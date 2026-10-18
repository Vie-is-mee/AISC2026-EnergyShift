"""Input readiness gate, separate from the future schedule verifier."""
import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta

from pydantic import ValidationError

from .schemas import Dataset


@dataclass(frozen=True)
class Issue:
    field: str
    code: str
    why: str
    how_to_fix: str


@dataclass
class GateResult:
    status: str
    errors: list[Issue]
    snapshot: dict | None = None
    input_hash: str | None = None


def validate_input(raw) -> GateResult:
    """Accept a decoded JSON object; return structured errors without guessing defaults."""
    try:
        data = Dataset.model_validate(raw)
    except ValidationError as exc:
        return GateResult("BLOCKED_INVALID", [
            Issue(".".join(map(str, e["loc"])) or "$", e["type"], e["msg"],
                  "Correct this field to match docs/DEMO_DATA_CONTRACT.md")
            for e in exc.errors(include_input=False, include_url=False)
        ])

    issues = []

    def issue(field, code, why, fix):
        issues.append(Issue(field, code, why, fix))

    def unique(items, field):
        ids = [x.id for x in items]
        if len(ids) != len(set(ids)):
            issue(field, "DUPLICATE_ID", "IDs must be unique", "Assign distinct IDs")
        return set(ids)

    machines = unique(data.machines, "machines")
    molds = unique(data.molds, "molds")
    jobs = unique(data.jobs, "jobs")
    families = {j.family for j in data.jobs} | set(data.setup.initial_family_by_machine.values())
    for i, machine in enumerate(data.machines):
        windows = sorted(machine.available, key=lambda w: w.start)
        for n, window in enumerate(windows):
            if window.start < data.horizon.start or window.end > data.horizon.end:
                issue(f"machines.{i}.available", "OUTSIDE_HORIZON", "Calendar exceeds horizon", "Trim the calendar")
            if n and window.start < windows[n - 1].end:
                issue(f"machines.{i}.available", "CALENDAR_OVERLAP", "Availability windows overlap", "Merge or separate windows")

    expected_offset = timedelta(hours=7)
    dates = [data.horizon.start, data.horizon.end]
    dates += [v for m in data.machines for w in m.available for v in (w.start, w.end)]
    dates += [v for j in data.jobs for v in (j.release, j.due)]
    dates += [a.start for a in data.current_schedule]
    dates += [v for w in data.tariff.windows for v in (w.start, w.end)]
    if any(d.utcoffset() != expected_offset for d in dates):
        issue("metadata.timezone", "OFFSET_MISMATCH", "demo-1 dates must match UTC+07:00", "Use +07:00 timestamps")

    for i, job in enumerate(data.jobs):
        if job.mold_id not in molds:
            issue(f"jobs.{i}.mold_id", "UNKNOWN_MOLD", "Mold does not exist", "Declare the physical mold")
        if not set(job.eligible) <= machines:
            issue(f"jobs.{i}.eligible", "UNKNOWN_MACHINE", "Eligible machine does not exist", "Use declared machine IDs")
        if job.release < data.horizon.start or job.due > data.horizon.end:
            issue(f"jobs.{i}", "OUTSIDE_HORIZON", "Job time bounds exceed demo horizon", "Correct release/due or horizon")
        if not any(p.duration_min <= (job.due - job.release).total_seconds() / 60 for p in job.eligible.values()):
            issue(f"jobs.{i}.eligible", "IMPOSSIBLE_DURATION", "No duration fits release/due", "Correct duration or time bounds")
        if data.metadata.source_type == "SYNTHETIC" and any(p.power_source != "SYNTHETIC" for p in job.eligible.values()):
            issue(f"jobs.{i}.eligible", "PROVENANCE_MISMATCH", "Synthetic input cannot claim measured power", "Label power SYNTHETIC")

    schedule_ids = [a.job_id for a in data.current_schedule]
    if len(schedule_ids) != len(set(schedule_ids)) or set(schedule_ids) != jobs:
        issue("current_schedule", "JOB_CONSERVATION", "Every job needs exactly one baseline assignment", "Remove duplicates and restore missing jobs")
    job_map = {j.id: j for j in data.jobs}
    for i, assignment in enumerate(data.current_schedule):
        job = job_map.get(assignment.job_id)
        if assignment.machine_id not in machines:
            issue(f"current_schedule.{i}.machine_id", "UNKNOWN_MACHINE", "Machine does not exist", "Use a declared machine")
        elif job and assignment.machine_id not in job.eligible:
            issue(f"current_schedule.{i}.machine_id", "INELIGIBLE_MACHINE", "Job cannot use this machine", "Use a whitelisted pair")

    if set(data.setup.initial_family_by_machine) != machines:
        issue("setup.initial_family_by_machine", "INITIAL_STATE_INCOMPLETE", "Each machine needs an initial family", "Declare exactly all machine IDs")
    transitions = set()
    for i, t in enumerate(data.setup.transitions):
        key = (t.machine_id, t.from_family, t.to_family)
        if key in transitions:
            issue(f"setup.transitions.{i}", "DUPLICATE_TRANSITION", "Transition appears twice", "Keep one explicit value")
        transitions.add(key)
        if t.machine_id not in machines or t.from_family not in families or t.to_family not in families:
            issue(f"setup.transitions.{i}", "UNKNOWN_REFERENCE", "Unknown machine or family", "Use declared machines and families")
    # Require all possible transitions, including same-family, so later search
    # cannot silently treat a missing cost/time as zero.
    for machine in data.machines:
        target = {j.family for j in data.jobs if machine.id in j.eligible}
        origins = target | {data.setup.initial_family_by_machine.get(machine.id)}
        for origin in sorted(x for x in origins if x is not None):
            for dest in sorted(target):
                if (machine.id, origin, dest) not in transitions:
                    issue("setup.transitions", "MISSING_TRANSITION", f"Missing {machine.id}: {origin}->{dest}", "Declare minutes and incremental cost explicitly")

    cursor = data.horizon.start
    for i, window in enumerate(sorted(data.tariff.windows, key=lambda w: w.start)):
        if window.start != cursor:
            issue(f"tariff.windows.{i}", "TARIFF_COVERAGE", "Gap, overlap or out-of-horizon tariff", "Cover horizon once with adjacent windows")
        if window.end > data.horizon.end:
            issue("tariff.windows", "TARIFF_COVERAGE", "Tariff exceeds horizon", "Trim to horizon")
        cursor = window.end
    if cursor != data.horizon.end:
        issue("tariff.windows", "TARIFF_COVERAGE", "Tariff does not end at horizon", "Complete coverage to horizon end")
    excluded = data.cost_scope.excluded
    if len(excluded) != len(set(excluded)) or set(excluded) != {"LABOR_OVERTIME", "IDLE_ENERGY", "SETUP_ENERGY", "OTHER_COSTS"}:
        issue("cost_scope.excluded", "COST_SCOPE_INCOMPLETE", "demo-1 must disclose all unmodeled components", "List each excluded component exactly once")
    if issues:
        return GateResult("BLOCKED_INVALID", issues)

    snapshot = data.model_dump(mode="json")
    # Normalize equivalent offset spellings/numbers through typed models; list
    # order is retained intentionally as part of the submitted snapshot.
    canonical = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    digest = "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return GateResult("READY", [], snapshot, digest)


def parse_json(text: str) -> GateResult:
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    try:
        raw = json.loads(text, object_pairs_hook=unique_keys,
                         parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
    except (ValueError, TypeError) as exc:
        return GateResult("BLOCKED_INVALID", [Issue("$", "INVALID_JSON", str(exc), "Provide valid finite JSON")])
    return validate_input(raw)
