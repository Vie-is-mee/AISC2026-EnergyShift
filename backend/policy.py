"""Economic policy for B0/B1 only; no invented B2 comparison."""
from fractions import Fraction


def meets_threshold(baseline_vnd, candidate_vnd, policy):
    saving = baseline_vnd - candidate_vnd
    return (saving > 0 and saving >= policy["min_net_saving_vnd"]
            and saving * 100 >= Fraction(str(policy["min_net_saving_pct"])) * baseline_vnd)


def decide(b0, b1, sensitivity, policy, search):
    if b0["verification"]["status"] != "PASS" or b0["cost"] is None:
        return {"kind": "BASELINE_INVALID", "selected_plan": None, "reason_codes": ["BASELINE_NOT_VERIFIED"]}
    if b1["verification"]["status"] != "PASS" or b1["cost"] is None:
        return {"kind": "MEASURE_FIRST", "selected_plan": "B0", "reason_codes": ["CANDIDATE_NOT_VERIFIED"]}
    base = b0["cost"]["total_vnd"]
    candidate = b1["cost"]["total_vnd"]
    reasons = ["B2_NOT_EVALUATED", "MODELED_COST_SCOPE_ONLY"]
    if not search["search_complete"]:
        reasons.append("SEARCH_INCOMPLETE")
    observations = sensitivity["scenarios"]
    if set(observations) != {"LOW", "BASE", "HIGH"} or any(s["status"] != "COSTED" for s in observations.values()):
        return {"kind": "MEASURE_FIRST", "selected_plan": "B0", "reason_codes": reasons + ["SENSITIVITY_BLOCKED"]}
    acceptance = [meets_threshold(s["b0_vnd"], s["b1_vnd"], policy) for s in observations.values()]
    if any(acceptance) and not all(acceptance):
        return {"kind": "MEASURE_FIRST", "selected_plan": "B0", "reason_codes": reasons + ["THRESHOLD_CROSSED_IN_TESTED_SCENARIOS"]}
    if not meets_threshold(base, candidate, policy):
        return {"kind": "KEEP_CURRENT", "selected_plan": "B0", "reason_codes": reasons + ["NO_QUALIFYING_MOVE_FOUND_IN_SEARCHED_DOMAIN"]}
    # USE_SIMPLE_RULE is reserved for an actual B1-vs-B2 comparison. A valid
    # B1-only result may recommend CHANGE without claiming B2 adds no value.
    return {"kind": "CHANGE", "selected_plan": "B1",
            "reason_codes": reasons + ["B1_MEETS_THRESHOLDS_IN_TESTED_SCENARIOS"]}
