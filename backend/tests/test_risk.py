from copy import deepcopy
from fractions import Fraction
from itertools import product
import unittest

from backend.analysis import analyze
from backend.costing import cost_schedule
from backend.risk import economic_risk
from backend.tests.test_b1_policy import small_fixture
from backend.tests.support import profile
from backend.validation import validate_input


def alternative_fixture():
    data = small_fixture()
    job = data["jobs"][0]
    job.update(release="2026-10-19T09:00:00+07:00", due="2026-10-19T10:00:00+07:00", mold_id="K8")
    job["eligible"] = {"M1": profile(1000, 60, 20.0), "M2": profile(1000, 60, 18.0)}
    data["current_schedule"][0]["start"] = job["release"]
    data["policy"]["min_net_saving_vnd"] = 1000
    return data


class RiskTests(unittest.TestCase):
    def setUp(self):
        self.data = small_fixture()

    def review(self, status="BOUNDED", low=0, high=0):
        self.data["cost_scope"]["excluded_review"]["LABOR_OVERTIME"].update(
            status=status, incremental_min_vnd=low, incremental_max_vnd=high)

    def test_unknown_excluded_cost_blocks_change(self):
        self.review("UNKNOWN", None, None)
        result = analyze(self.data)
        self.assertEqual(result["decision"]["kind"], "MEASURE_FIRST")
        self.assertEqual(result["economic_assessment"]["unknown_components"], ["LABOR_OVERTIME"])
        self.assertNotIn("net_saving_bounds_exact_vnd", result["economic_assessment"])

    def test_known_extra_cost_reverses_modeled_benefit(self):
        self.review(low=200000, high=200000)
        result = analyze(self.data)
        self.assertEqual(result["decision"]["kind"], "KEEP_CURRENT")
        self.assertGreater(result["comparison"]["saving_vnd"], 0)
        self.assertLess(Fraction(result["economic_assessment"]["net_saving_bounds_exact_vnd"][1]), 0)

    def test_extra_cost_interval_crossing_threshold_requires_measurement(self):
        self.review(low=0, high=40000)
        self.assertEqual(analyze(self.data)["decision"]["kind"], "MEASURE_FIRST")

    def test_negative_incremental_cost_is_explicit_saving(self):
        self.review(low=-1000, high=-1000)
        result = analyze(self.data)
        self.assertEqual(result["economic_assessment"]["excluded_incremental_bounds_vnd"], [-1000, -1000])
        self.assertEqual(result["decision"]["kind"], "CHANGE")

    def test_missing_review_not_assumed_zero(self):
        del self.data["cost_scope"]["excluded_review"]["IDLE_ENERGY"]
        result = validate_input(self.data)
        self.assertEqual(result.status, "BLOCKED_INVALID")
        self.assertIn("EXCLUDED_REVIEW_INCOMPLETE", [e.code for e in result.errors])

    def test_unordered_or_null_bounded_review_rejected(self):
        for low, high in [(2, 1), (None, 1), (0, None)]:
            self.review(low=low, high=high)
            self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_unknown_with_values_is_rejected(self):
        self.review("UNKNOWN", 0, 0)
        self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_fake_measured_review_is_rejected(self):
        self.data["cost_scope"]["excluded_review"]["IDLE_ENERGY"]["source_type"] = "MEASURED"
        self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_review_needs_nonblank_evidence_reference(self):
        self.data["cost_scope"]["excluded_review"]["IDLE_ENERGY"]["reference"] = "  "
        self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_old_demo2_is_explicitly_rejected(self):
        self.data["schema_version"] = "demo-2"
        self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_independent_opposite_power_errors_no_longer_recommend_change(self):
        self.data = alternative_fixture()
        result = analyze(self.data)
        self.assertTrue(result["sensitivity"]["acceptance_stable_in_tested_scenarios"])
        self.assertTrue(all(s["meets_threshold"] for s in result["sensitivity"]["scenarios"].values()))
        self.assertEqual(result["decision"]["kind"], "MEASURE_FIRST")
        self.assertLess(Fraction(result["economic_assessment"]["net_saving_bounds_exact_vnd"][0]), 0)

    def test_box_bounds_cover_independent_corner_and_midpoint_recosts(self):
        data = alternative_fixture()
        result = analyze(data)
        risk = result["economic_assessment"]
        lower, upper = map(Fraction, risk["net_saving_bounds_exact_vnd"])
        margin_low, margin_high = map(Fraction, risk["percentage_margin_bounds_exact_vnd"])
        for a, b in product([0.85, 1.0, 1.15], repeat=2):
            varied = deepcopy(data)
            varied["jobs"][0]["eligible"]["M1"]["avg_kw"] = float(Fraction(20) * Fraction(str(a)))
            varied["jobs"][0]["eligible"]["M2"]["avg_kw"] = float(Fraction(18) * Fraction(str(b)))
            left = cost_schedule(varied, result["plans"]["B0"]["schedule"])["cost"]["total_vnd"]
            right = cost_schedule(varied, result["plans"]["B1"]["schedule"])["cost"]["total_vnd"]
            saving = left - right
            margin = saving - Fraction(str(data["policy"]["min_net_saving_pct"])) * left / 100
            self.assertLessEqual(lower, saving)
            self.assertGreaterEqual(upper, saving)
            self.assertLessEqual(margin_low, margin)
            self.assertGreaterEqual(margin_high, margin)

    def test_zero_uncertainty_and_zero_extra_cost_exact_bounds(self):
        self.data["policy"]["power_uncertainty_pct"] = 0.0
        result = analyze(self.data)
        self.assertEqual(result["economic_assessment"]["net_saving_bounds_exact_vnd"], ["44160", "44160"])
        self.assertEqual(result["economic_assessment"]["rounding_allowance_exact_vnd"], "0")
        self.assertEqual(result["economic_assessment"]["max_total_extra_cost_vnd_for_robust_change"], 34160)

    def test_measured_power_not_in_uncertainty_box(self):
        self.data["metadata"]["source_type"] = "MEASURED"
        self.data["jobs"][0]["eligible"]["M1"]["power_source"] = "MEASURED"
        result = analyze(self.data)
        self.assertEqual(result["economic_assessment"]["power_drivers"], [])
        self.assertEqual(result["economic_assessment"]["net_saving_bounds_exact_vnd"], ["44160", "44160"])

    def test_profile_specific_uncertainty_overrides_global_default(self):
        self.data["policy"]["power_uncertainty_pct"] = 0.5
        self.data["jobs"][0]["eligible"]["M1"]["power_uncertainty_pct"] = 0.0
        result = analyze(self.data)
        self.assertEqual(result["economic_assessment"]["net_saving_bounds_exact_vnd"], ["44160", "44160"])

    def test_measured_profile_can_have_explicit_meter_uncertainty(self):
        self.data["metadata"]["source_type"] = "MEASURED"
        profile = self.data["jobs"][0]["eligible"]["M1"]
        profile.update(power_source="MEASURED", power_uncertainty_pct=0.15)
        result = analyze(self.data)
        lower, upper = map(Fraction, result["economic_assessment"]["net_saving_bounds_exact_vnd"])
        self.assertLess(lower, 44160)
        self.assertGreater(upper, 44160)

    def test_unchanged_schedule_cancels_power_and_stays_keep_even_if_cost_unknown(self):
        for w in self.data["tariff"]["windows"]:
            w["vnd_per_kwh"] = 1000.0
        self.review("UNKNOWN", None, None)
        result = analyze(self.data)
        self.assertEqual(result["decision"]["kind"], "KEEP_CURRENT")
        self.assertEqual(result["economic_assessment"]["modeled_saving_bounds_exact_vnd"], ["0", "0"])

    def test_robust_bound_also_checks_percent_threshold(self):
        self.data["policy"]["min_net_saving_pct"] = 90.0
        result = analyze(self.data)
        self.assertEqual(result["decision"]["kind"], "KEEP_CURRENT")
        self.assertTrue(result["economic_assessment"]["no_declared_values_qualify"])

    def test_cost_review_does_not_mutate_ledger_or_raw_savings(self):
        baseline = analyze(self.data)
        self.review(low=1000, high=2000)
        guarded = analyze(self.data)
        self.assertEqual(baseline["plans"]["B1"]["cost"], guarded["plans"]["B1"]["cost"])
        self.assertEqual(baseline["comparison"]["saving_vnd"], guarded["comparison"]["saving_vnd"])
        self.assertNotEqual(baseline["input_hash"], guarded["input_hash"])


if __name__ == "__main__":
    unittest.main()
