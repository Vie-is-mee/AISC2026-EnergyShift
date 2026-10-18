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
    for machine_id, sequence in sorted(grouped.items()):
        family = data.setup.initial_family_by_machine[machine_id]
        previous_end = None
        for assignment in sorted(sequence, key=lambda a: (a.start, a.job_id)):
            job = jobs[assignment.job_id]
            processing = job.eligible[machine_id]
            setup = transitions[machine_id, family, job.family]
            start = assignment.start
            try:
                end = start + timedelta(minutes=processing.duration_min)
                setup_start = start - timedelta(minutes=setup.minutes)
            except OverflowError:
                fail("TIME_OVERFLOW", job.id, machine_id=machine_id)
                continue
            row = {"job_id": job.id, "machine_id": machine_id, "mold_id": job.mold_id,
                   "quantity": job.quantity, "start": start.isoformat(), "end": end.isoformat(),
                   "setup_start": setup_start.isoformat(), "setup_minutes": setup.minutes,
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

    # Mold reserved for setup + run. Transfer/unmount time is outside demo-1.
    by_mold = defaultdict(list)
    for row in rows:
        by_mold[row["mold_id"]].append(row)
    for mold_id, sequence in by_mold.items():
        active_end, active_job = None, None
        for row in sorted(sequence, key=lambda r: (r["setup_start"], r["job_id"])):
            # All normalized timestamps have identical offset and precision.
            if active_end is not None and row["setup_start"] < active_end:
                fail("MOLD_OVERLAP", row["job_id"], mold_id=mold_id, other_job_id=active_job,
                     start=row["setup_start"], end=row["end"])
            if active_end is None or row["end"] > active_end:
                active_end, active_job = row["end"], row["job_id"]
    return {"status": "FAIL" if issues else "PASS", "issues": issues,
            "jobs": sorted(rows, key=lambda r: r["job_id"]),
            "scope": "demo-1 declared constraints only; excludes labor and mold transfer time"}
