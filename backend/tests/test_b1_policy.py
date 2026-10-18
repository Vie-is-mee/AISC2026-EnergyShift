import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from backend.analysis import analyze
from backend.b1 import search_b1
from backend.costing import cost_schedule
from backend.policy import meets_threshold

ROOT = Path(__file__).resolve().parents[2]


def small_fixture():
    """Independent one-job example with an analytically checkable best move."""
    data = json.loads((ROOT / "backend/fixtures/editable_cell.json").read_text())
    data["jobs"] = data["jobs"][:1]
    data["jobs"][0]["eligible"] = {"M1": {"duration_min": 60, "avg_kw": 20.0, "power_source": "SYNTHETIC"}}
    data["setup"]["initial_family_by_machine"]["M3"] = "B"
    data["current_schedule"] = [{"job_id": "J1", "machine_id": "M1", "start": "2026-10-19T09:30:00+07:00"}]
    data["policy"]["min_net_saving_vnd"] = 10000
    return data


class B1Tests(unittest.TestCase):
    def setUp(self):
        self.data = small_fixture()

    def test_known_move_and_economics(self):
        report = analyze(self.data)
        self.assertEqual(report["plans"]["B0"]["cost"]["total_vnd"], 67960)
        self.assertEqual(report["plans"]["B1"]["cost"]["total_vnd"], 23800)
        self.assertEqual(report["comparison"]["saving_vnd"], 44160)
        self.assertEqual(report["comparison"]["changed_assignments"], 1)
        self.assertEqual(report["plans"]["B1"]["schedule"][0]["start"], "2026-10-19T00:00:00+07:00")
        self.assertEqual(report["decision"]["kind"], "CHANGE")
        self.assertIn("B2_NOT_EVALUATED", report["decision"]["reason_codes"])
        self.assertIsNone(report["plans"]["B2"]["cost"])

    def test_uniform_tariff_keeps_baseline_on_tie(self):
        for window in self.data["tariff"]["windows"]:
            window["vnd_per_kwh"] = 1000.0
        report = analyze(self.data)
        self.assertEqual(report["decision"]["kind"], "KEEP_CURRENT")
        self.assertEqual(report["comparison"]["changed_assignments"], 0)
        self.assertEqual(report["plans"]["B1"]["schedule"], report["plans"]["B0"]["schedule"])

    def test_policy_rejects_small_vnd_saving(self):
        self.data["policy"]["min_net_saving_vnd"] = 60000
        self.assertEqual(analyze(self.data)["decision"]["kind"], "KEEP_CURRENT")

    def test_policy_rejects_small_percent_saving(self):
        self.data["policy"]["min_net_saving_pct"] = 90.0
        self.assertEqual(analyze(self.data)["decision"]["kind"], "KEEP_CURRENT")

    def test_sensitivity_crosses_threshold(self):
        self.data["policy"]["min_net_saving_vnd"] = 44000
        report = analyze(self.data)
        self.assertEqual(report["decision"]["kind"], "MEASURE_FIRST")
        self.assertEqual(report["decision"]["selected_plan"], "B0")
        self.assertEqual(report["sensitivity"]["scenarios"]["LOW"]["saving_vnd"], 37536)
        self.assertEqual(report["sensitivity"]["scenarios"]["HIGH"]["saving_vnd"], 50784)

    def test_zero_uncertainty_matches_base(self):
        self.data["policy"]["power_uncertainty_pct"] = 0.0
        values = analyze(self.data)["sensitivity"]["scenarios"]
        self.assertEqual(values["LOW"], values["BASE"])
        self.assertEqual(values["HIGH"], values["BASE"])

    def test_measured_profiles_are_not_scaled(self):
        self.data["metadata"]["source_type"] = "MEASURED"
        self.data["jobs"][0]["eligible"]["M1"]["power_source"] = "MEASURED"
        values = analyze(self.data)["sensitivity"]["scenarios"]
        self.assertEqual(values["LOW"], values["HIGH"])

    def test_incomplete_search_is_explicit(self):
        report = analyze(self.data, max_candidates=1)
        self.assertFalse(report["search"]["search_complete"])
        self.assertEqual(report["search"]["termination"], "CANDIDATE_LIMIT")
        self.assertEqual(report["search"]["evaluated_candidates"], 1)
        self.assertIn("SEARCH_INCOMPLETE", report["decision"]["reason_codes"])

    def test_incomplete_search_with_no_valid_move_does_not_claim_impossibility(self):
        self.data["setup"]["initial_family_by_machine"]["M1"] = "B"
        report = analyze(self.data, max_candidates=1)
        self.assertEqual(report["search"]["rejected_candidates"], 1)
        self.assertEqual(report["decision"]["kind"], "KEEP_CURRENT")
        self.assertIn("SEARCH_INCOMPLETE", report["decision"]["reason_codes"])
        self.assertIn("NO_QUALIFYING_MOVE_FOUND_IN_SEARCHED_DOMAIN", report["decision"]["reason_codes"])

    def test_power_edit_changes_verdict_by_computation(self):
        self.data["policy"]["power_uncertainty_pct"] = 0.0
        self.assertEqual(analyze(self.data)["decision"]["kind"], "CHANGE")
        self.data["jobs"][0]["eligible"]["M1"]["avg_kw"] = 1.0
        self.assertEqual(analyze(self.data)["decision"]["kind"], "KEEP_CURRENT")

    def test_invalid_options(self):
        for options in [{"grid_minutes": 0}, {"grid_minutes": True}, {"max_candidates": 0}, {"max_candidates": 1.5}]:
            with self.assertRaises(ValueError):
                search_b1(self.data, **options)

    def test_invalid_data_has_no_decision(self):
        del self.data["jobs"][0]["quantity"]
        report = analyze(self.data)
        self.assertEqual(report["status"], "BLOCKED_INVALID")
        self.assertIsNone(report["decision"])

    def test_invalid_baseline_blocks_search(self):
        self.data["current_schedule"][0]["start"] = "2026-10-19T23:30:00+07:00"
        report = analyze(self.data)
        self.assertEqual(report["status"], "BASELINE_INVALID")
        self.assertEqual(report["decision"]["kind"], "BASELINE_INVALID")
        self.assertNotIn("search", report)

    def test_repeated_run_keeps_plan_and_verdict(self):
        original = copy.deepcopy(self.data)
        a, b = analyze(self.data), analyze(self.data)
        self.assertEqual(a["plans"], b["plans"])
        self.assertEqual(a["decision"], b["decision"])
        self.assertEqual(self.data, original)
        self.assertNotEqual(a["run_id"], b["run_id"])

    def test_hash_and_component_consistency(self):
        result = analyze(self.data)
        self.assertEqual(result["input_hash"], result["plans"]["B1"]["input_hash"])
        self.assertEqual(result["comparison"]["saving_vnd"], sum(result["comparison"]["saving_by_component_vnd"].values()))
        self.assertEqual(result["input_hash"], result["sensitivity"]["scenarios"]["BASE"]["scenario_input_hash"])

    def test_due_and_calendar_restrict_search(self):
        self.data["jobs"][0]["release"] = "2026-10-19T09:30:00+07:00"
        self.data["jobs"][0]["due"] = "2026-10-19T10:30:00+07:00"
        result = analyze(self.data)
        self.assertEqual(result["search"]["evaluated_candidates"], 0)
        self.assertEqual(result["decision"]["kind"], "KEEP_CURRENT")

    def test_off_grid_baseline_time_for_alternative_machine(self):
        self.data["jobs"][0]["release"] = "2026-10-19T09:07:00+07:00"
        self.data["jobs"][0]["due"] = "2026-10-19T10:07:00+07:00"
        self.data["current_schedule"][0]["start"] = "2026-10-19T09:07:00+07:00"
        self.data["jobs"][0]["eligible"]["M2"] = {"duration_min": 60, "avg_kw": 1.0, "power_source": "SYNTHETIC"}
        report = search_b1(self.data)
        self.assertEqual(report["B1"]["schedule"][0]["machine_id"], "M2")
        self.assertEqual(report["B1"]["schedule"][0]["start"], "2026-10-19T09:07:00+07:00")

    def test_thresholds_inclusive_without_float_drift(self):
        policy = {"min_net_saving_vnd": 1, "min_net_saving_pct": 0.1}
        self.assertTrue(meets_threshold(1000, 999, policy))
        self.assertFalse(meets_threshold(1001, 1000, policy))
        self.assertFalse(meets_threshold(0, 0, policy))

    def test_analyze_cli(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.json"
            path.write_text(json.dumps(self.data), encoding="utf-8")
            result = subprocess.run([sys.executable, "-m", "backend", str(path), "--analyze"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["decision"]["kind"], "CHANGE")


class FullCellTests(unittest.TestCase):
    def test_single_move_search_recosts_setup_on_unchanged_jobs(self):
        data = json.loads((ROOT / "backend/fixtures/editable_cell.json").read_text())
        result = analyze(data)
        b0, b1 = result["plans"]["B0"], result["plans"]["B1"]
        self.assertEqual(b1["verification"]["status"], "PASS")
        self.assertEqual(b1["cost"], cost_schedule(data, b1["schedule"])["cost"])
        self.assertLessEqual(b1["cost"]["total_vnd"], b0["cost"]["total_vnd"])
        self.assertEqual(sum(x != y for x, y in zip(b0["schedule"], b1["schedule"])), 1)
        self.assertEqual(result["comparison"]["saving_vnd"], 157918)
        self.assertEqual(result["comparison"]["saving_by_component_vnd"]["SETUP"], 100000)
        self.assertEqual({x["job_id"] for x in result["comparison"]["derived_setup_effects"]}, {"J4", "J5"})
        search = result["search"]
        self.assertEqual(search["evaluated_candidates"], search["rejected_candidates"] + search["valid_candidates"])


if __name__ == "__main__":
    unittest.main()
