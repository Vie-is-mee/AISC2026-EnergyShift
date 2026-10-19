"""Conservative economic selection across verified B0/B1/B2."""
from fractions import Fraction
from .b2 import search_b2
from .risk import economic_risk, linear_bounds


def extend_with_b2(snapshot, report, *, grid_minutes=30, time_limit_seconds=6, neighborhood_limit=0):
    b0, b1 = report["plans"]["B0"], report["plans"]["B1"]
    b2 = search_b2(snapshot, b0, b1, grid_minutes=grid_minutes, time_limit_seconds=time_limit_seconds, neighborhood_limit=neighborhood_limit)
    report["plans"]["B2"] = b2
    risk1, risk2 = report["economic_assessment"], economic_risk(snapshot, b0, b2)
    wide = snapshot["cost_scope"]["review_scope"] == "ALL_CANDIDATE_SCHEDULES_IN_HORIZON"
    if not wide:
        risk2 = {"status": "UNKNOWN_SCOPE", "unknown_components": ["COORDINATED_COST_REVIEW"],
                 "scope_note": "Single-job reviews do not authorize coordinated changes"}
    risks = {"B1": risk1, "B2": risk2}
    incremental = {"status": "UNKNOWN", "reason": "Explicit coordinated cost bounds required"}
    if wide and risk1["status"] == risk2["status"] == "BOUNDED":
        low, high, _, _ = linear_bounds(snapshot, b1, b2)
        width = risk1["excluded_incremental_bounds_vnd"][1] - risk1["excluded_incremental_bounds_vnd"][0]
        incremental = {"status": "BOUNDED", "net_incremental_bounds_exact_vnd": [str(low - width), str(high + width)],
                       "method": "Independent power bounds; excluded costs may differ throughout declared bounds, no assumed cancellation"}
    qualifies = {code: risk.get("all_declared_values_qualify", False) and report["plans"][code]["schedule"] != b0["schedule"] for code, risk in risks.items()}
    reasons = ["MODELED_COST_SCOPE_ONLY", "B2_BOUNDED_NEIGHBORHOODS" if neighborhood_limit else "B2_BOUNDED_FIXED_ASSIGNMENTS_AND_ORDER"]
    if b2["solver"]["optimality"] != "PROVEN_IN_DECLARED_DOMAIN":
        reasons.append("B2_SEARCH_INCOMPLETE")
    if qualifies["B1"] and qualifies["B2"]:
        low, high = map(Fraction, incremental["net_incremental_bounds_exact_vnd"])
        if low > 0 and low >= snapshot["policy"]["min_b2_incremental_vnd"]:
            kind, selected = "CHANGE", "B2"
            reasons.append("B2_INCREMENTAL_VALUE_ROBUST")
        else:
            kind, selected = "USE_SIMPLE_RULE", "B1"
            reasons.append("B2_INCREMENTAL_VALUE_NOT_ESTABLISHED")
    elif qualifies["B2"]:
        kind, selected = "CHANGE", "B2"
        reasons.append("B2_QUALIFIES_UNDER_DECLARED_BOUNDS")
    elif qualifies["B1"]:
        kind, selected = "CHANGE", "B1"
        reasons.append("B2_COST_REVIEW_REQUIRED" if not wide else "B2_NOT_ECONOMICALLY_QUALIFIED")
    else:
        changed = [p for p in risks if report["plans"][p]["schedule"] != b0["schedule"]]
        unknown = any(not risks[p].get("no_declared_values_qualify", False) for p in changed)
        kind, selected = ("MEASURE_FIRST", "B0") if unknown else ("KEEP_CURRENT", "B0")
        reasons.append("CANDIDATES_NEED_MORE_EVIDENCE" if unknown else "NO_QUALIFYING_CANDIDATE_IN_SEARCHED_DOMAIN")
    report["decision"] = {"kind": kind, "selected_plan": selected, "reason_codes": reasons,
                          "evidence_ids": ["plans.B0.verification", "plans.B1.verification", "plans.B2.verification", "plans.B2.solver", "coordinated_economics"]}
    report["coordinated_economics"] = {**risks, "incremental_B2_over_B1": incremental}
    # Historical comparison and LOW/BASE/HIGH remain B1-only for compatibility.
    report["comparison"]["plans"] = {code: {"saving_vnd": b0["cost"]["total_vnd"] - plan["cost"]["total_vnd"], "changed_assignments": len(plan["changes"])} for code, plan in (("B1", b1), ("B2", b2))}
    return report
