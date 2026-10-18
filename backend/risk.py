"""Conservative independent power bounds and explicit excluded-cost guard.

For fixed schedules, electrical cost is linear in each job/machine power
before rounding. Exact rational bounds plus per-ledger rounding allowances
cover all independent profile powers in their declared +/- uncertainty box.
"""
from collections import defaultdict
from fractions import Fraction


def power_uncertainty(profile, policy):
    value = profile.get("power_uncertainty_pct")
    if value is not None:
        return Fraction(str(value))
    return Fraction(0) if profile["power_source"] == "MEASURED" else Fraction(str(policy["power_uncertainty_pct"]))


def linear_bounds(snapshot, b0, b1, weight0=Fraction(1), weight1=Fraction(-1)):
    profiles = {(j["id"], m): p for j in snapshot["jobs"] for m, p in j["eligible"].items()}
    entries = {}
    constant = weight0 * b0["cost"]["by_component"]["SETUP"] + weight1 * b1["cost"]["by_component"]["SETUP"]
    for plan, weight in [(b0, weight0), (b1, weight1)]:
        for row in plan["cost"]["ledger"]:
            if row["component"] != "RUN_ELECTRICITY":
                continue
            key = tuple(row[k] for k in ("job_id", "machine_id", "start", "end", "vnd_per_kwh"))
            if key not in entries:
                entries[key] = [row, Fraction(0)]
            entries[key][1] += weight
    coefficients = defaultdict(Fraction)
    error = Fraction(0)
    for row, weight in entries.values():
        if weight == 0:
            continue
        key = (row["job_id"], row["machine_id"])
        profile = profiles[key]
        uncertainty = power_uncertainty(profile, snapshot["policy"])
        if not uncertainty or profile["avg_kw"] == 0:
            constant += weight * row["cost_vnd"]
        else:
            coefficients[key] += weight * Fraction(row["exact_vnd"])
            error += abs(weight) / 2
    low, high = constant, constant
    for key, coefficient in coefficients.items():
        uncertainty = power_uncertainty(profiles[key], snapshot["policy"])
        low += coefficient * (1 - uncertainty if coefficient >= 0 else 1 + uncertainty)
        high += coefficient * (1 + uncertainty if coefficient >= 0 else 1 - uncertainty)
    return low - error, high + error, coefficients, error


def economic_risk(snapshot, b0, b1):
    reviews = snapshot["cost_scope"]["excluded_review"]
    unknown = sorted(k for k, v in reviews.items() if v["status"] == "UNKNOWN")
    saving_low, saving_high, coefficients, rounding = linear_bounds(snapshot, b0, b1)
    pct = Fraction(str(snapshot["policy"]["min_net_saving_pct"])) / 100
    margin_low, margin_high, _, _ = linear_bounds(snapshot, b0, b1, 1 - pct, Fraction(-1))
    minimum = snapshot["policy"]["min_net_saving_vnd"]
    # Largest integer total incremental cost that still passes both thresholds
    # and strictly positive savings under the conservative power lower bounds.
    headroom = min((saving_low - minimum).__floor__(), margin_low.__floor__(),
                   (saving_low.numerator - 1) // saving_low.denominator)
    profiles = {(j["id"], m): p for j in snapshot["jobs"] for m, p in j["eligible"].items()}
    variables = [{"job_id": j, "machine_id": m, "base_saving_coefficient_exact_vnd": str(c),
                  "power_uncertainty_pct_exact": str(power_uncertainty(profiles[j, m], snapshot["policy"])),
                  "saving_range_contribution_exact_vnd": str(2 * abs(c) * power_uncertainty(profiles[j, m], snapshot["policy"])),
                  "worst_saving_power_factor": str(1 - power_uncertainty(profiles[j, m], snapshot["policy"]) if c >= 0 else 1 + power_uncertainty(profiles[j, m], snapshot["policy"]))}
                 for (j, m), c in sorted(coefficients.items(), key=lambda item: (-abs(item[1]) * power_uncertainty(profiles[item[0]], snapshot["policy"]), item[0]))]
    result = {"status": "UNKNOWN_COSTS" if unknown else "BOUNDED", "unknown_components": unknown,
              "method": "independent job/machine power box; fixed schedules; rational linear bounds plus rounding allowance",
              "modeled_saving_bounds_exact_vnd": [str(saving_low), str(saving_high)],
              "rounding_allowance_exact_vnd": str(rounding), "power_drivers": variables,
              "max_total_extra_cost_vnd_for_robust_change": headroom,
              "percentage_denominator": "modeled B0 run electricity + setup, not whole-plant cost",
              "limitations": "Does not bound duration, tariffs, setup, outages or authenticity of supplied cost reviews."}
    if unknown:
        return result
    extra_low = sum(v["incremental_min_vnd"] for v in reviews.values())
    extra_high = sum(v["incremental_max_vnd"] for v in reviews.values())
    low, high = saving_low - extra_high, saving_high - extra_low
    pct_low, pct_high = margin_low - extra_high, margin_high - extra_low
    result.update({"excluded_incremental_bounds_vnd": [extra_low, extra_high],
                   "headroom_after_review_vnd": headroom - extra_high,
                   "net_saving_bounds_exact_vnd": [str(low), str(high)],
                   "percentage_margin_bounds_exact_vnd": [str(pct_low), str(pct_high)],
                   "all_declared_values_qualify": low > 0 and low >= minimum and pct_low >= 0,
                   "no_declared_values_qualify": high <= 0 or high < minimum or pct_high < 0})
    return result
