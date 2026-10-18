"""Economic policy for B0/B1 only; no invented B2 comparison."""
from fractions import Fraction


def meets_threshold(baseline_vnd, candidate_vnd, policy):
    saving = baseline_vnd - candidate_vnd
    return (saving > 0 and saving >= policy["min_net_saving_vnd"]
            and saving * 100 >= Fraction(str(policy["min_net_saving_pct"])) * baseline_vnd)


def decide(b0, b1, sensitivity, policy, search, risk):
    if b0["verification"]["status"] != "PASS" or b0["cost"] is None:
        return {"kind": "BASELINE_INVALID", "selected_plan": None, "reason_codes": ["BASELINE_NOT_VERIFIED"]}
    if b1["verification"]["status"] != "PASS" or b1["cost"] is None:
        return {"kind": "MEASURE_FIRST", "selected_plan": "B0", "reason_codes": ["CANDIDATE_NOT_VERIFIED"]}
    reasons = ["B2_NOT_EVALUATED", "MODELED_COST_SCOPE_ONLY", "B1_SELECTED_BY_MODELED_BASE_COST"]
    if not search["search_complete"]:
        reasons.append("SEARCH_INCOMPLETE")
    observations = sensitivity["scenarios"]
    if set(observations) != {"LOW", "BASE", "HIGH"} or any(s["status"] != "COSTED" for s in observations.values()):
        return {"kind": "MEASURE_FIRST", "selected_plan": "B0", "reason_codes": reasons + ["SENSITIVITY_BLOCKED"]}
    if b0["schedule"] == b1["schedule"]:
        return {"kind": "KEEP_CURRENT", "selected_plan": "B0", "reason_codes": reasons + ["NO_QUALIFYING_MOVE_FOUND_IN_SEARCHED_DOMAIN"]}
    if risk["status"] != "BOUNDED":
        return {"kind": "MEASURE_FIRST", "selected_plan": "B0", "reason_codes": reasons + ["EXCLUDED_COSTS_NOT_BOUNDED"]}
    if risk["no_declared_values_qualify"]:
        return {"kind": "KEEP_CURRENT", "selected_plan": "B0", "reason_codes": reasons + ["SELECTED_B1_NOT_QUALIFIED_UNDER_DECLARED_BOUNDS"]}
    if not risk["all_declared_values_qualify"]:
        return {"kind": "MEASURE_FIRST", "selected_plan": "B0", "reason_codes": reasons + ["INDEPENDENT_POWER_OR_EXTRA_COST_RISK"]}
    # USE_SIMPLE_RULE is reserved for an actual B1-vs-B2 comparison. A valid
    # B1-only result may recommend CHANGE without claiming B2 adds no value.
    return {"kind": "CHANGE", "selected_plan": "B1",
            "reason_codes": reasons + ["B1_QUALIFIES_OVER_DECLARED_POWER_AND_COST_BOUNDS"]}
