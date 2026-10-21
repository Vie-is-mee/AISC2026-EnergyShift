"""Declared, versioned factory-1 hard constraints shared by validation and verification.

Only constraints represented here and in the CP-SAT compiler are enforceable. Generic
operator descriptions in unsupported_constraints always block the entire analysis.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from pydantic import Field
from .schemas import Model, Window, Identifier

# Stable, explicit registry: every active rule has validation, CP-SAT and verifier coverage.
CONSTRAINT_REGISTRY = {
    "MACHINE_ELIGIBILITY": "Machine-specific processing capabilities",
    "JOB_WINDOWS": "Release and due dates",
    "MACHINE_CALENDAR": "Non-preemptive machine availability",
    "MACHINE_NO_OVERLAP": "One running job per machine",
    "PRECEDENCE": "Finish-to-start job dependencies and minimum lag",
    "RESOURCE_CAPACITY": "Renewable shared pools and their calendars",
    "SEQUENCE_CHANGEOVER": "Machine-specific setup intervals, successor transition fees and shared setup crews",
    "OPERATION_ROUTING": "Explicit work-order operation graph, compiled as operation-level precedence",
}


class FactoryPrecedence(Model):
    before: Identifier
    after: Identifier
    min_lag_minutes: int = Field(default=0, ge=0, le=2880)


class FactoryResourcePool(Model):
    id: Identifier
    capacity: int = Field(ge=1, le=20)
    available: list[Window] = Field(min_length=1, max_length=30)



class FactoryChangeover(Model):
    from_family: Identifier
    to_family: Identifier
    duration_minutes: int = Field(ge=0, le=2880)
    flat_cost_vnd: int = Field(ge=0, le=100000000)
    reference: str = Field(min_length=1, max_length=200)
    demands: dict[Identifier, int] = Field(default_factory=dict, max_length=8)


class FactorySetupPolicy(Model):
    initial_family: Identifier
    transitions: list[FactoryChangeover] = Field(min_length=1, max_length=120)


def transition_lookup(machine):
    return {(tr.from_family, tr.to_family): tr for tr in machine.changeovers.transitions}


def machine_setup(data, machine_id):
    machine = next(m for m in data.machines if m.id == machine_id)
    return machine.changeovers


def changeovers_for_schedule(data, rows):
    """Reconstruct actual adjacent transitions, not every ordered pair.

    Setup runs immediately before its successor job, exclusively on that
    machine. Returns a verified ledger candidate and semantic issues.
    """
    if data.setup_assumption != "DECLARED_CHANGEOVERS":
        return [], []
    issues, changes = [], []
    machine_map = {m.id: m for m in data.machines}
    jobs = {job.id: job for job in data.jobs}
    for mid, machine in machine_map.items():
        assigned = sorted(
            (row for row in rows if row["machine_id"] == mid),
            key=lambda row: (row["start"], row["job_id"]),
        )
        previous = None
        previous_family = machine.changeovers.initial_family
        lookup = transition_lookup(machine)
        for row in assigned:
            job = jobs[row["job_id"]]
            rule = lookup.get((previous_family, job.setup_family))
            if rule is None:
                issues.append({"code": "CHANGEOVER_MISSING", "machine_id": mid, "job_id": job.id})
                continue
            start = datetime.fromisoformat(row["start"])
            setup_start = start - timedelta(minutes=rule.duration_minutes)
            previous_end = datetime.fromisoformat(previous["end"]) if previous else data.horizon.start
            if setup_start < previous_end:
                issues.append({"code": "CHANGEOVER_GAP", "machine_id": mid, "job_id": job.id})
            if rule.duration_minutes and not inside(machine.available, setup_start, start):
                issues.append({"code": "CHANGEOVER_MACHINE_UNAVAILABLE", "machine_id": mid, "job_id": job.id})
            changes.append({
                "machine_id": mid, "job_id": job.id, "from_family": previous_family,
                "to_family": job.setup_family, "start": setup_start.isoformat(),
                "end": start.isoformat(), "duration_minutes": rule.duration_minutes,
                "flat_cost_vnd": rule.flat_cost_vnd, "reference": rule.reference,
                "demands": rule.demands,
            })
            previous = row
            previous_family = job.setup_family
    return changes, issues


def active_rules(data):
    rules = ["MACHINE_ELIGIBILITY", "JOB_WINDOWS", "MACHINE_CALENDAR", "MACHINE_NO_OVERLAP"]
    if data.precedence:
        rules.append("PRECEDENCE")
    if data.resources:
        rules.append("RESOURCE_CAPACITY")
    if data.setup_assumption == "DECLARED_CHANGEOVERS":
        rules.append("SEQUENCE_CHANGEOVER")
    return rules


def inside(windows, start, end):
    """Non-preemptive use must fit entirely in one declared open interval."""
    return any(w.start <= start and end <= w.end for w in windows)


def validate_constraints(data):
    """Semantic checks independent of solver; returns blocking issues."""
    issues = []
    ids = {j.id for j in data.jobs}
    pools = {pool.id: pool for pool in data.resources}
    if len(pools) != len(data.resources):
        issues.append({"code": "RESOURCE_DUPLICATE_ID"})
    if data.setup_assumption == "NO_SETUP_REQUIRED_CONFIRMED":
        if any(m.changeovers is not None for m in data.machines) or any(j.setup_family is not None for j in data.jobs):
            issues.append({"code": "SETUP_MODE_CONFLICT"})
    else:
        if any(m.changeovers is None for m in data.machines) or any(j.setup_family is None for j in data.jobs):
            issues.append({"code": "SETUP_DECLARATION_REQUIRED"})
        else:
            for machine in data.machines:
                eligible_jobs = [j for j in data.jobs if machine.id in j.eligible]
                families = {job.setup_family for job in eligible_jobs}
                policy = machine.changeovers
                transitions = policy.transitions
                keys = [(t.from_family, t.to_family) for t in transitions]
                if len(set(keys)) != len(keys):
                    issues.append({"code": "CHANGEOVER_DUPLICATE", "machine_id": machine.id})
                required = {(frm, to) for frm in (families | {policy.initial_family}) for to in families}
                if required != set(keys):
                    issues.append({"code": "CHANGEOVER_MATRIX_INCOMPLETE", "machine_id": machine.id})
                for t in transitions:
                    if t.duration_minutes % data.step_minutes:
                        issues.append({"code": "CHANGEOVER_DURATION_OFF_GRID", "machine_id": machine.id})
                    for rid, demand in t.demands.items():
                        pool = pools.get(rid)
                        if pool is None or type(demand) is not int or not 1 <= demand <= pool.capacity:
                            issues.append({"code": "CHANGEOVER_RESOURCE_INVALID", "machine_id": machine.id, "resource_id": rid})
                    if t.duration_minutes == 0 and t.demands:
                        issues.append({"code": "CHANGEOVER_ZERO_DURATION_RESOURCE", "machine_id": machine.id})
    for pool in data.resources:
        end_prev = data.horizon.start
        for window in sorted(pool.available, key=lambda w: w.start):
            if window.start < end_prev or window.end > data.horizon.end:
                issues.append({"code": "RESOURCE_CALENDAR_INVALID", "resource_id": pool.id})
            end_prev = window.end
    for job in data.jobs:
        for resource_id, demand in job.demands.items():
            pool = pools.get(resource_id)
            if not pool:
                issues.append({"code": "RESOURCE_UNKNOWN", "job_id": job.id, "resource_id": resource_id})
            elif type(demand) is not int or not 1 <= demand <= pool.capacity:
                issues.append({"code": "RESOURCE_DEMAND_INVALID", "job_id": job.id, "resource_id": resource_id})
    for pool in data.resources:
        if not any(pool.id in j.demands for j in data.jobs) and not any(
            machine.changeovers and any(pool.id in tr.demands for tr in machine.changeovers.transitions)
            for machine in data.machines
        ):
            issues.append({"code": "RESOURCE_UNUSED", "resource_id": pool.id})
    pairs = set()
    graph = {jid: [] for jid in ids}
    for edge in data.precedence:
        pair = (edge.before, edge.after)
        if edge.before not in ids or edge.after not in ids or edge.before == edge.after or pair in pairs:
            issues.append({"code": "PRECEDENCE_INVALID", "before": edge.before, "after": edge.after})
        else:
            graph[edge.before].append(edge.after)
        pairs.add(pair)
    visiting, visited = set(), set()
    def visit(job):
        if job in visiting:
            return True
        if job in visited:
            return False
        visiting.add(job)
        cycle = any(visit(other) for other in graph[job])
        visiting.remove(job)
        visited.add(job)
        return cycle
    if any(visit(jid) for jid in ids if jid not in visited):
        issues.append({"code": "PRECEDENCE_CYCLE"})
    return issues


def verify_constraints(data, rows):
    """An independent sweep-line check; no solver internals are trusted."""
    issues = []
    changeovers, setup_issues = changeovers_for_schedule(data, rows)
    issues.extend(setup_issues)
    by_id = {row["job_id"]: row for row in rows}
    for edge in data.precedence:
        before, after = by_id.get(edge.before), by_id.get(edge.after)
        if before and after:
            from datetime import datetime
            end_before = datetime.fromisoformat(before["end"])
            start_after = datetime.fromisoformat(after["start"])
            if end_before + timedelta(minutes=edge.min_lag_minutes) > start_after:
                issues.append({"code": "PRECEDENCE_VIOLATION", "before": edge.before, "after": edge.after})
    from datetime import datetime
    for pool in data.resources:
        events = []
        for row in rows:
            demand = next((j.demands.get(pool.id, 0) for j in data.jobs if j.id == row["job_id"]), 0)
            if not demand:
                continue
            start, end = datetime.fromisoformat(row["start"]), datetime.fromisoformat(row["end"])
            if not inside(pool.available, start, end):
                issues.append({"code": "RESOURCE_UNAVAILABLE", "job_id": row["job_id"], "resource_id": pool.id})
            events.extend([(start, demand), (end, -demand)])
        for setup in changeovers:
            demand = setup["demands"].get(pool.id, 0)
            if not demand or setup["duration_minutes"] == 0:
                continue
            setup_start, setup_end = datetime.fromisoformat(setup["start"]), datetime.fromisoformat(setup["end"])
            if not inside(pool.available, setup_start, setup_end):
                issues.append({"code": "CHANGEOVER_RESOURCE_UNAVAILABLE", "job_id": setup["job_id"], "resource_id": pool.id})
            events.extend([(setup_start, demand), (setup_end, -demand)])
        # At a shared instant a finish releases capacity before another job starts.
        occupancy = 0
        for _, delta in sorted(events, key=lambda item: (item[0], item[1])):
            occupancy += delta
            if occupancy > pool.capacity:
                issues.append({"code": "RESOURCE_OVER_CAPACITY", "resource_id": pool.id})
                break
    return issues, changeovers
