"""Generic single-stage factory scheduling; independent of demo-3 mold assumptions.

Setup transitions and renewable resource needs require complete explicit declarations.
Every returned candidate is independently verified and repriced. Any CP-SAT
optimality proof is limited to the declared discrete-grid mathematical model.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from pydantic import Field, ValidationError, field_validator, model_validator

from .schemas import Model, Window, Identifier
from .factory_constraints import (FactoryPrecedence, FactoryResourcePool, FactorySetupPolicy, active_rules,
                                  validate_constraints, verify_constraints)
from .factory_cp_sat import build_options, solve, MAX_OPTIONS


class FactoryMetadata(Model):
    plant_alias: Identifier
    industry: str = Field(min_length=1, max_length=100)
    source_type: Literal["SYNTHETIC", "MEASURED", "ESTIMATED", "PARTNER_EXPORT"]
    timezone: Literal["Asia/Ho_Chi_Minh"]
    currency: Literal["VND"]


class FactoryMachine(Model):
    id: Identifier
    available: list[Window] = Field(min_length=1)
    changeovers: FactorySetupPolicy | None = None


class FactoryCapability(Model):
    duration_minutes: int = Field(gt=0, le=2880)
    average_kw: float = Field(ge=0, le=100000)
    power_source: Literal["SYNTHETIC", "MEASURED", "ESTIMATED"]
    reference: str = Field(min_length=1, max_length=200)


class FactoryJob(Model):
    id: Identifier
    release: datetime
    due: datetime
    eligible: dict[str, FactoryCapability] = Field(min_length=1)
    setup_family: Identifier | None = None
    # Renewable shared resource quantities, only enforced when pools are declared.
    demands: dict[Identifier, int] = Field(default_factory=dict, max_length=8)

    _dates = field_validator("release", "due", mode="before")(Window.timestamp.__func__)

    @model_validator(mode="after")
    def check_order(self):
        if self.due <= self.release:
            raise ValueError("Due must follow release")
        return self


class FactoryTariff(Window):
    band: str = Field(min_length=1, max_length=60)
    vnd_per_kwh: float = Field(ge=0, le=10000000)


class FactoryAssignment(Model):
    job_id: Identifier
    machine_id: Identifier
    start: datetime

    _date = field_validator("start", mode="before")(Window.timestamp.__func__)


class FactoryInput(Model):
    schema_version: Literal["factory-1"]
    metadata: FactoryMetadata
    horizon: Window
    step_minutes: Literal[5, 10, 15, 30, 60]
    machines: list[FactoryMachine] = Field(min_length=1, max_length=5)
    jobs: list[FactoryJob] = Field(min_length=1, max_length=12)
    current_schedule: list[FactoryAssignment] = Field(min_length=1, max_length=12)
    tariffs: list[FactoryTariff] = Field(min_length=1, max_length=120)
    tariff_reference: str = Field(min_length=1, max_length=200)
    setup_assumption: Literal["NO_SETUP_REQUIRED_CONFIRMED", "DECLARED_CHANGEOVERS"]
    unsupported_constraints: list[str] = Field(max_length=30)
    precedence: list[FactoryPrecedence] = Field(default_factory=list, max_length=40)
    resources: list[FactoryResourcePool] = Field(default_factory=list, max_length=8)


def _bad(code, details=None):
    return {"status": "BLOCKED", "code": code, "issues": details or [],
            "cost": None, "verification": {"status": "NOT_RUN"}}


def _as_utc7(value):
    return value.tzinfo is not None and value.utcoffset() == timedelta(hours=7) and value.second == 0 and value.microsecond == 0


def _validate(raw):
    try:
        data = FactoryInput.model_validate(raw)
    except ValidationError as exc:
        return None, _bad("SCHEMA_INVALID", [{"field": ".".join(map(str, e["loc"])), "code": e["type"]} for e in exc.errors(include_input=False, include_url=False)][:30])
    if data.unsupported_constraints:
        return None, _bad("UNSUPPORTED_CONSTRAINTS", [{"code": "NOT_ENFORCED", "constraint": name} for name in data.unsupported_constraints])
    moments = [data.horizon.start, data.horizon.end]
    for j in data.jobs:
        moments.extend([j.release, j.due])
    for m in data.machines:
        for w in m.available:
            moments.extend([w.start, w.end])
    for t in data.tariffs:
        moments.extend([t.start, t.end])
    moments.extend(a.start for a in data.current_schedule)
    for pool in data.resources:
        for w in pool.available:
            moments.extend([w.start, w.end])
    if not all(_as_utc7(x) for x in moments):
        return None, _bad("TIMEZONE_OR_PRECISION", [{"code": "REQUIRE_VIETNAM_OFFSET_AND_MINUTE_PRECISION"}])
    hmin = int((data.horizon.end - data.horizon.start).total_seconds() // 60)
    if hmin <= 0 or hmin > 48 * 60 or hmin % data.step_minutes:
        return None, _bad("HORIZON_UNSUPPORTED", [{"code": "LIMIT_48H_AND_ALIGN_STEP"}])
    if any(int((a.start - data.horizon.start).total_seconds() // 60) % data.step_minutes
           for a in data.current_schedule):
        return None, _bad("BASELINE_OFF_GRID", [{"code": "BASELINE_MUST_ALIGN_TO_STEP"}])
    ids = [j.id for j in data.jobs]
    mids = [m.id for m in data.machines]
    if len(ids) != len(set(ids)) or len(mids) != len(set(mids)):
        return None, _bad("DUPLICATE_IDENTIFIERS")
    if len(data.current_schedule) != len(ids) or sorted(a.job_id for a in data.current_schedule) != sorted(ids):
        return None, _bad("BASELINE_JOB_COVERAGE")
    machine_ids = set(mids)
    for job in data.jobs:
        if not set(job.eligible) <= machine_ids or not job.eligible:
            return None, _bad("UNKNOWN_ELIGIBLE_MACHINE", [{"job": job.id}])
        if not data.horizon.start <= job.release < job.due <= data.horizon.end:
            return None, _bad("JOB_WINDOW_OUTSIDE_HORIZON", [{"job": job.id}])
        for mid, p in job.eligible.items():
            if p.duration_minutes % data.step_minutes:
                return None, _bad("DURATION_OFF_GRID", [{"job": job.id, "machine": mid}])
            if ((data.metadata.source_type == "SYNTHETIC" and p.power_source != "SYNTHETIC") or
                    (data.metadata.source_type == "MEASURED" and p.power_source != "MEASURED")):
                return None, _bad("PROVENANCE_CONFLICT", [{"job": job.id, "machine": mid}])
    for machine in data.machines:
        before = data.horizon.start
        for w in sorted(machine.available, key=lambda v: v.start):
            if w.start < before or w.end > data.horizon.end:
                return None, _bad("MACHINE_CALENDAR_INVALID", [{"machine": machine.id}])
            before = w.end
    cursor = data.horizon.start
    for t in sorted(data.tariffs, key=lambda x: x.start):
        if t.start != cursor or t.end > data.horizon.end:
            return None, _bad("TARIFF_GAP_OR_OVERLAP")
        cursor = t.end
    if cursor != data.horizon.end:
        return None, _bad("TARIFF_INCOMPLETE")
    constraint_issues = validate_constraints(data)
    if constraint_issues:
        return None, _bad("CONSTRAINT_INVALID", constraint_issues)
    return data, None


def _verify(data: FactoryInput, schedule):
    jobs = {j.id: j for j in data.jobs}
    machines = {m.id: m for m in data.machines}
    issues, rows = [], []
    counts = {key: 0 for key in jobs}
    by_machine = {key: [] for key in machines}
    for a in schedule:
        jid, mid, start = a["job_id"], a["machine_id"], a["start"]
        if jid not in jobs or mid not in machines:
            issues.append({"code": "UNKNOWN_JOB_OR_MACHINE", "job_id": jid}); continue
        counts[jid] += 1
        if mid not in jobs[jid].eligible:
            issues.append({"code": "INELIGIBLE_MACHINE", "job_id": jid}); continue
        profile = jobs[jid].eligible[mid]
        end = start + timedelta(minutes=profile.duration_minutes)
        if start < jobs[jid].release or end > jobs[jid].due or start < data.horizon.start or end > data.horizon.end:
            issues.append({"code": "JOB_TIME_WINDOW", "job_id": jid})
        windows = sorted(machines[mid].available, key=lambda x: x.start)
        cursor = start
        for w in windows:
            if w.start <= cursor < w.end:
                cursor = w.end
        if cursor < end:
            issues.append({"code": "MACHINE_UNAVAILABLE", "job_id": jid, "machine_id": mid})
        item = {"job_id": jid, "machine_id": mid, "start": start.isoformat(), "end": end.isoformat(),
                "duration_minutes": profile.duration_minutes, "average_kw": profile.average_kw}
        by_machine[mid].append((start, end, jid))
        rows.append(item)
    if len(schedule) != len(jobs) or any(value != 1 for value in counts.values()):
        issues.append({"code": "JOB_CONSERVATION"})
    for mid, items in by_machine.items():
        previous_end = None
        for start, end, jid in sorted(items):
            if previous_end is not None and start < previous_end:
                issues.append({"code": "MACHINE_OVERLAP", "job_id": jid, "machine_id": mid})
            previous_end = max(previous_end, end) if previous_end else end
    setup_issues, changeovers = verify_constraints(data, rows)
    issues.extend(setup_issues)
    return {"status": "FAIL" if issues else "PASS", "issues": issues,
            "jobs": sorted(rows, key=lambda x: x["job_id"]),
            "changeovers": changeovers,
            "scope": "factory-1: " + ", ".join(active_rules(data)) + "; setup " + data.setup_assumption}


def _cost(data, verification):
    if verification["status"] != "PASS":
        return None
    total_vnd, total_kwh = 0, Decimal("0")
    ledger = []
    for job in verification["jobs"]:
        start, end = datetime.fromisoformat(job["start"]), datetime.fromisoformat(job["end"])
        kw = Decimal(str(job["average_kw"]))
        for t in data.tariffs:
            left, right = max(start, t.start), min(end, t.end)
            if right <= left:
                continue
            minutes = Decimal(int((right - left).total_seconds() // 60))
            kwh = kw * minutes / Decimal(60)
            value = int((kwh * Decimal(str(t.vnd_per_kwh))).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            ledger.append({"job_id": job["job_id"], "machine_id": job["machine_id"], "band": t.band,
                           "start": left.isoformat(), "end": right.isoformat(),
                           "kwh": float(kwh), "vnd": value})
            total_vnd += value
            total_kwh += kwh
    setup_ledger = []
    for setup in verification["changeovers"]:
        charge = setup["flat_cost_vnd"]
        total_vnd += charge
        setup_ledger.append({
            "machine_id": setup["machine_id"], "job_id": setup["job_id"],
            "from_family": setup["from_family"], "to_family": setup["to_family"],
            "start": setup["start"], "end": setup["end"],
            "flat_cost_vnd": charge, "reference": setup["reference"],
        })
    return {"total_vnd": total_vnd, "energy_kwh": float(total_kwh),
            "ledger": ledger, "changeover_ledger": setup_ledger,
            "changeover_total_vnd": sum(row["flat_cost_vnd"] for row in setup_ledger),
            "modeled_components": ["RUN_ELECTRICITY"] +
                (["DECLARED_CHANGEOVER_FIXED_FEE"] if data.setup_assumption == "DECLARED_CHANGEOVERS" else []),
            "excluded_costs": ["LABOR", "INVENTORY", "IDLE", "SETUP_ENERGY", "TRANSPORT", "OTHER"]}


def _production_metrics(data, verification):
    """Independent physical production KPI used to verify the CP-SAT objective."""
    if verification["status"] != "PASS":
        return None
    endings = [int((datetime.fromisoformat(row["end"]) - data.horizon.start).total_seconds() // 60)
               for row in verification["jobs"]]
    span = int((data.horizon.end - data.horizon.start).total_seconds() // 60)
    makespan = max(endings)
    total_completion = sum(endings)
    return {"makespan_minutes": makespan, "sum_completion_minutes": total_completion,
            "score": makespan * (span * len(data.jobs) + 1) + total_completion,
            "reference": "horizon.start", "model_scope": "declared operations"}


def _package(data, schedule):
    proof = _verify(data, schedule)
    return {"status": proof["status"], "verification": proof,
            "cost": _cost(data, proof), "production": _production_metrics(data, proof),
            "schedule": [{"job_id": a["job_id"], "machine_id": a["machine_id"],
                          "start": a["start"].isoformat()} for a in sorted(schedule, key=lambda x: x["job_id"])]}


def analyze_factory(raw, *, mode="FIXED_MACHINE", objective_mode="ENERGY",
                    max_makespan_slack_minutes=0, max_evaluations=1000, passes=3):
    """Optimize factory-1 on a declared discrete grid using OR-Tools CP-SAT.

    B1 may change at most one job relative to B0; B2 optimizes all jobs.
    Only independently verified, repriced schedules can be reported.
    The prior bounded local-search engine is replaced for factory-1 only.
    """
    if mode not in ("FIXED_MACHINE", "JOINT_MACHINE_TIME"):
        return _bad("UNSUPPORTED_MODE")
    if objective_mode not in ("ENERGY", "PRODUCTION", "COMBINED"):
        return _bad("UNSUPPORTED_OBJECTIVE_MODE")
    if (type(max_makespan_slack_minutes) is not int or
            not 0 <= max_makespan_slack_minutes <= 1440 or
            (objective_mode != "COMBINED" and max_makespan_slack_minutes != 0)):
        return _bad("PRODUCTION_GUARD_INVALID")
    if type(max_evaluations) is not int or not 1 <= max_evaluations <= 4000 or type(passes) is not int or not 1 <= passes <= 5:
        return _bad("SEARCH_LIMIT_INVALID")
    data, blocked = _validate(raw)
    if blocked:
        return blocked
    if max_makespan_slack_minutes % data.step_minutes:
        return _bad("PRODUCTION_GUARD_OFF_GRID")
    baseline = [{"job_id": a.job_id, "machine_id": a.machine_id, "start": a.start} for a in data.current_schedule]
    b0 = _package(data, baseline)
    canonical = json.dumps(data.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    input_hash = "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    common = {
        "schema_version": "factory-1", "source_type": data.metadata.source_type,
        "input_hash": input_hash, "mode": mode, "objective_mode": objective_mode,
        "max_makespan_slack_minutes": max_makespan_slack_minutes, "currency": "VND",
        "factory": {"industry": data.metadata.industry, "plant_alias": data.metadata.plant_alias},
        "step_minutes": data.step_minutes, "setup_assumption": data.setup_assumption,
        "tariff_reference": data.tariff_reference, "enforced_constraints": active_rules(data),
        "limitations": [
            "Non-preemptive one-stage jobs; no material inventory or unregistered factory requirements",
            "Precedence, changeovers and renewable capacity constraints enforced only when explicitly declared",
            "Changeover machine time, fixed fees and shared setup crew demands are modeled only if declared; setup energy excluded",
            "Modeled running electricity plus declared fixed setup fees, not measured factory savings; labor, setup energy, idle and material costs excluded",
            "CP-SAT optimality, if proved, applies only to the finite declared scheduling grid and modeled cost",
        ],
    }
    if b0["status"] != "PASS":
        return {**common, "status": "BASELINE_INVALID", "plans": {"B0": b0},
                "decision": {"kind": "BLOCKED", "selected_plan": None},
                "message": "Baseline failed independent verifier; no invalid baseline costs."}
    # A user-supplied evaluation budget acts as a candidate-model-size guard,
    # never as an undocumented guarantee about CP-SAT branching.
    candidate_cap = min(MAX_OPTIONS, max_evaluations * 16)
    options, candidate_count = build_options(data, mode, max_options=candidate_cap)
    if options is None:
        return {**_bad("MODEL_TOO_LARGE", [{"code": "CANDIDATE_LIMIT",
                                            "limit": candidate_cap, "enumerated": candidate_count}]),
                "input_hash": input_hash, "enforced_constraints": active_rules(data)}
    b0_cost = b0["cost"]["total_vnd"]
    b0_score = b0["production"]["score"]
    b0_makespan = b0["production"]["makespan_minutes"]
    makespan_limit = (b0_makespan + max_makespan_slack_minutes
                      if objective_mode == "COMBINED" else None)

    def verified_solution(schedule, solver_info):
        if schedule is None:
            return None
        plan = _package(data, schedule)
        if (plan["status"] != "PASS" or plan["cost"]["total_vnd"] != solver_info["objective_vnd"] or
                plan["production"]["score"] != solver_info.get("production_score") or
                plan["production"]["makespan_minutes"] != solver_info.get("makespan_minutes")):
            return False
        return plan

    first, b1_solver = solve(
        data, options, baseline=baseline, objective_mode=objective_mode,
        cost_ceiling=None if objective_mode == "PRODUCTION" else b0_cost,
        production_ceiling=b0_score if objective_mode == "PRODUCTION" else None,
        makespan_limit=makespan_limit, at_most_one_change=True)
    b1_plan = verified_solution(first, b1_solver)
    if b1_plan is False:
        return _bad("SOLVER_VERIFIER_MISMATCH")
    b1 = b1_plan or b0

    second, b2_solver = solve(
        data, options, baseline=baseline, objective_mode=objective_mode,
        cost_ceiling=None if objective_mode == "PRODUCTION" else b1["cost"]["total_vnd"],
        production_ceiling=b1["production"]["score"] if objective_mode == "PRODUCTION" else None,
        makespan_limit=makespan_limit)
    b2_plan = verified_solution(second, b2_solver)
    if b2_plan is False:
        return _bad("SOLVER_VERIFIER_MISMATCH")
    b2 = b2_plan or b1
    plans = {"B0": b0, "B1": b1, "B2": b2}
    if objective_mode == "PRODUCTION":
        selected = min(plans, key=lambda key: (
            plans[key]["production"]["score"], plans[key]["cost"]["total_vnd"],
            ["B0", "B1", "B2"].index(key)))
    else:
        selected = min(plans, key=lambda key: (
            plans[key]["cost"]["total_vnd"], ["B0", "B1", "B2"].index(key)))
    return {
        **common, "status": "COMPLETED", "plans": plans,
        "comparison": {"saving_b1_vnd": b0_cost - b1["cost"]["total_vnd"],
                       "saving_b2_vnd": b0_cost - b2["cost"]["total_vnd"],
                       "makespan_change_b1_minutes": b1["production"]["makespan_minutes"] - b0_makespan,
                       "makespan_change_b2_minutes": b2["production"]["makespan_minutes"] - b0_makespan,
                       "modeled_only": True,
                       "cost_nonworsening_guaranteed": objective_mode != "PRODUCTION"},
        "search": {
            "algorithm": ("OR-Tools CP-SAT / discrete intervals / makespan then completion score"
                          if objective_mode == "PRODUCTION" else
                          "OR-Tools CP-SAT / discrete machine and setup intervals / exact VND candidate objective"),
            "max_evaluations": max_evaluations, "evaluated": candidate_count,
            "candidate_limit": candidate_cap, "limit_reached": False,
            "passes": passes, "coordinated_steps": [],
            "b1": b1_solver, "b2": b2_solver,
            "baseline_makespan_minutes": b0_makespan, "makespan_limit_minutes": makespan_limit,
            "objective_kind": "PRODUCTION_SCORE" if objective_mode == "PRODUCTION" else "MODELED_COST_VND",
            "global_optimum_proven": bool(b2_plan and b2_solver["global_optimum_proven"]),
        },
        "decision": {"kind": "REVIEW_REQUIRED", "selected_plan": selected,
                     "reason": ("Production mode prioritizes makespan then summed completion; modeled costs may rise."
                                if objective_mode == "PRODUCTION" else
                                "Modeled running electricity and explicit setup fees only; engineering approval required.")},
    }
