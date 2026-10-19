"""One analysis snapshot: B0/B1, fixed-schedule sensitivity and evidence policy."""
from copy import deepcopy
from fractions import Fraction
from uuid import uuid4

from .b1 import search_b1
from .costing import cost_schedule
from .policy import decide, meets_threshold
from .validation import validate_input
from .risk import economic_risk, power_uncertainty


def analyze(snapshot, *, grid_minutes=30, max_candidates=5000, enable_b2=False, b2_time_limit_seconds=6, b2_neighborhood_limit=0):
    gate = validate_input(snapshot)
    run_id = "run_" + uuid4().hex
    if gate.status != "READY":
        return {"run_id": run_id, "status": "BLOCKED_INVALID", "errors": [vars(e) for e in gate.errors],
                "decision": None}
    result = search_b1(gate.snapshot, grid_minutes=grid_minutes, max_candidates=max_candidates)
    common = {"run_id": run_id, "input_hash": gate.input_hash,
              "schema_version": gate.snapshot["schema_version"],
              "source_type": gate.snapshot["metadata"]["source_type"],
              "cost_scope": gate.snapshot["cost_scope"], "policy": gate.snapshot["policy"]}
    if result["status"] != "COMPLETED":
        return {**common, **result, "decision": {"kind": "BASELINE_INVALID", "selected_plan": None,
                                                "reason_codes": ["BASELINE_NOT_VERIFIED"]}}
    b0, b1 = result["B0"], result["B1"]
    scenarios = {}
    for label, direction in [("LOW", -1), ("BASE", 0), ("HIGH", 1)]:
        varied = deepcopy(gate.snapshot)
        for job in varied["jobs"]:
            for profile in job["eligible"].values():
                uncertainty = power_uncertainty(profile, gate.snapshot["policy"])
                profile["avg_kw"] = float(Fraction(str(profile["avg_kw"])) * (1 + direction * uncertainty))
        left = cost_schedule(varied, b0["schedule"])
        right = cost_schedule(varied, b1["schedule"])
        if left["status"] != "COSTED" or right["status"] != "COSTED":
            scenarios[label] = {"status": "BLOCKED"}
        else:
            a, b = left["cost"]["total_vnd"], right["cost"]["total_vnd"]
            scenarios[label] = {"status": "COSTED", "b0_vnd": a, "b1_vnd": b, "saving_vnd": a - b,
                                "meets_threshold": meets_threshold(a, b, gate.snapshot["policy"]),
                                "scenario_input_hash": left["input_hash"]}
    sensitivity = {"method": "fixed schedules; same-direction profile-specific power scenarios",
                   "scope": "Illustrative scenarios only; policy uses independent power and excluded-cost bounds in economic_assessment",
                   "scenarios": scenarios}
    acceptance = [s.get("meets_threshold") for s in scenarios.values()]
    sensitivity["acceptance_stable_in_tested_scenarios"] = None if None in acceptance else len(set(acceptance)) == 1
    total0, total1 = b0["cost"]["total_vnd"], b1["cost"]["total_vnd"]
    component_deltas = {key: b0["cost"]["by_component"][key] - b1["cost"]["by_component"][key]
                        for key in b0["cost"]["by_component"]}
    risk = economic_risk(gate.snapshot, b0, b1)
    decision = decide(b0, b1, sensitivity, gate.snapshot["policy"], result["search"], risk)
    decision["evidence_ids"] = ["plans.B0.verification", "plans.B1.verification", "comparison", "sensitivity", "economic_assessment", "search"]
    # Derived setup effects on other jobs are explicit; B1 moves only one assignment.
    before = {j["job_id"]: j for j in b0["verification"]["jobs"]}
    setup_effects = [{"job_id": j["job_id"], "before_setup_start": before[j["job_id"]]["setup_start"],
                      "after_setup_start": j["setup_start"],
                      "before_setup_vnd": b0["cost"]["by_job"][j["job_id"]]["setup_vnd"],
                      "after_setup_vnd": b1["cost"]["by_job"][j["job_id"]]["setup_vnd"]}
                     for j in b1["verification"]["jobs"]
                     if j["setup_start"] != before[j["job_id"]]["setup_start"]
                     or b0["cost"]["by_job"][j["job_id"]]["setup_vnd"] != b1["cost"]["by_job"][j["job_id"]]["setup_vnd"]]
    report = {**common, "status": "COMPLETED", "plans": {"B0": b0, "B1": b1,
            "B2": {"status": "NOT_RUN", "solver_status": "NOT_RUN", "cost": None, "schedule": None}},
            "comparison": {"saving_vnd": total0 - total1,
                           "saving_pct": round((total0 - total1) * 100 / total0, 6) if total0 else None,
                           "saving_by_component_vnd": component_deltas,
                           "changed_assignments": len(b1["changes"]), "derived_setup_effects": setup_effects},
            "search": result["search"], "sensitivity": sensitivity,
            "economic_assessment": risk, "decision": decision}
    if enable_b2:
        from .coordinated import extend_with_b2
        report = extend_with_b2(gate.snapshot, report, grid_minutes=grid_minutes, time_limit_seconds=b2_time_limit_seconds, neighborhood_limit=b2_neighborhood_limit)
    return report
