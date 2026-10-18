"""Verify JSON schedules against a snapshot, independently of any scheduler."""
from collections import Counter, defaultdict
from datetime import timedelta

from pydantic import TypeAdapter, ValidationError

from .schemas import Assignment, Dataset
from .validation import validate_input


def verify_schedule(snapshot, schedule):
    gate = validate_input(snapshot)
    if gate.status != "READY":
        return {"status": "UNKNOWN", "issues": [vars(e) for e in gate.errors], "jobs": []}
    data = Dataset.model_validate(gate.snapshot)
    try:
        assignments = TypeAdapter(list[Assignment]).validate_python(schedule, strict=True)
    except ValidationError as exc:
        return {"status": "FAIL", "issues": [
            {"code": "INVALID_ASSIGNMENT", "field": ".".join(map(str, e["loc"])), "why": e["msg"]}
            for e in exc.errors(include_input=False, include_url=False)], "jobs": []}
    issues, rows = [], []

    def fail(code, job_id=None, **details):
        issues.append({"code": code, "job_id": job_id, **details})

    jobs = {j.id: j for j in data.jobs}
    machines = {m.id: m for m in data.machines}
    if Counter(a.job_id for a in assignments) != Counter(jobs.keys()):
        fail("JOB_CONSERVATION", expected=sorted(jobs), actual=sorted(a.job_id for a in assignments))
    grouped = defaultdict(list)
    for assignment in assignments:
        job = jobs.get(assignment.job_id)
        if job is None:
            fail("UNKNOWN_JOB", assignment.job_id)
            continue
        if assignment.machine_id not in machines:
            fail("UNKNOWN_MACHINE", job.id, machine_id=assignment.machine_id)
            continue
        if assignment.machine_id not in job.eligible:
            fail("INELIGIBLE_MACHINE", job.id, machine_id=assignment.machine_id)
            continue
        if assignment.start.utcoffset() != timedelta(hours=7):
            fail("OFFSET_MISMATCH", job.id)
        grouped[assignment.machine_id].append(assignment)

    transitions = {(t.machine_id, t.from_family, t.to_family): t for t in data.setup.transitions}
    for machine_id in machines:
        grouped.setdefault(machine_id, [])
    for machine_id, sequence in sorted(grouped.items()):
        family = data.setup.initial_family_by_machine[machine_id]
        mold = data.setup.initial_mold_by_machine[machine_id]
        previous_end = None
        for assignment in sorted(sequence, key=lambda a: (a.start, a.job_id)):
            job = jobs[assignment.job_id]
            processing = job.eligible[machine_id]
            setup = transitions[machine_id, family, job.family]
            change = data.setup.mold_change_by_machine[machine_id]
            mold_minutes = change.minutes if mold != job.mold_id else 0
            setup_minutes = setup.minutes + mold_minutes
            start = assignment.start
            try:
                end = start + timedelta(minutes=processing.duration_min)
                setup_start = start - timedelta(minutes=setup_minutes)
            except OverflowError:
                fail("TIME_OVERFLOW", job.id, machine_id=machine_id)
                continue
            row = {"job_id": job.id, "machine_id": machine_id, "mold_id": job.mold_id,
                   "quantity": job.quantity, "start": start.isoformat(), "end": end.isoformat(),
                   "setup_start": setup_start.isoformat(), "setup_minutes": setup_minutes,
                   "family_setup_minutes": setup.minutes, "mold_change_minutes": mold_minutes,
                   "previous_mold_id": mold,
                   "due": job.due.isoformat()}
            rows.append(row)
            context = {"machine_id": machine_id, "start": start.isoformat(), "end": end.isoformat()}
            if start < job.release:
                fail("BEFORE_RELEASE", job.id, **context)
            if end > job.due:
                fail("LATE_DUE", job.id, **context)
            if setup_start < data.horizon.start or end > data.horizon.end:
                fail("OUTSIDE_HORIZON", job.id, **context)
            # Availability is a union: adjacent windows do not introduce downtime.
            cursor = setup_start
            for window in sorted(machines[machine_id].available, key=lambda w: w.start):
                if window.start <= cursor < window.end:
                    cursor = max(cursor, window.end)
            if cursor < end:
                fail("MACHINE_UNAVAILABLE", job.id, **context)
            if previous_end is not None:
                if start < previous_end:
                    fail("MACHINE_OVERLAP", job.id, **context)
                elif setup_start < previous_end:
                    fail("INSUFFICIENT_SETUP", job.id, setup_start=setup_start.isoformat(), **context)
            previous_end = max(previous_end, end) if previous_end else end
            family = job.family
            mold = job.mold_id

    # Conservative mounted occupancy: a mold stays on a machine through idle
    # time until its replacement is installed (next run start). No implicit
    # instant removal/reuse on a second machine. Both molds are reserved during
    # a physical replacement; standalone unmount/transfer operations are not supported.
    reservations = []
    for machine_id in machines:
        mold = data.setup.initial_mold_by_machine[machine_id]
        since = data.horizon.start.isoformat()
        for row in sorted((r for r in rows if r["machine_id"] == machine_id), key=lambda r: (r["start"], r["job_id"])):
            if mold != row["mold_id"]:
                if mold is not None and since < row["start"]:
                    reservations.append({"mold_id": mold, "machine_id": machine_id, "start": since, "end": row["start"]})
                mold, since = row["mold_id"], row["setup_start"]
        if mold is not None and since < data.horizon.end.isoformat():
            reservations.append({"mold_id": mold, "machine_id": machine_id, "start": since, "end": data.horizon.end.isoformat()})
    by_mold = defaultdict(list)
    for row in reservations:
        by_mold[row["mold_id"]].append(row)
    for mold_id, sequence in by_mold.items():
        ordered = sorted(sequence, key=lambda r: r["start"])
        for i, left in enumerate(ordered):
            for right in ordered[i + 1:]:
                if right["start"] >= left["end"]:
                    break
                if left["machine_id"] != right["machine_id"]:
                    fail("MOLD_OVERLAP", mold_id=mold_id, machine_id=right["machine_id"],
                         other_machine_id=left["machine_id"], start=max(left["start"], right["start"]),
                         end=min(left["end"], right["end"]))
    return {"status": "FAIL" if issues else "PASS", "issues": issues,
            "jobs": sorted(rows, key=lambda r: r["job_id"]),
            "mold_reservations": reservations,
            "scope": "demo-2; mounted molds held until replacement; no standalone unload/transfer or labor model"}
