import copy
import json
import subprocess
import sys
import unittest
import tempfile
from fractions import Fraction
from pathlib import Path

from backend.costing import cost_schedule
from backend.verifier import verify_schedule

ROOT = Path(__file__).resolve().parents[2]


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "backend/fixtures/editable_cell.json").read_text())
        self.schedule = copy.deepcopy(self.data["current_schedule"])

    def failed(self, code):
        result = verify_schedule(self.data, self.schedule)
        self.assertEqual(result["status"], "FAIL", result)
        self.assertIn(code, [i["code"] for i in result["issues"]])
        self.assertIsNone(cost_schedule(self.data, self.schedule)["cost"])

    def single(self, start="2026-10-19T09:00:00+07:00", duration=60, power=20.0):
        # Retain family B in the declared initial state when narrowing the
        # fixture to one A job, so the explicit A/B transition matrix is valid.
        self.data["setup"]["initial_family_by_machine"]["M3"] = "B"
        self.data["jobs"] = self.data["jobs"][:1]
        self.data["jobs"][0]["eligible"] = {"M1": {"duration_min": duration, "avg_kw": power, "power_source": "SYNTHETIC"}}
        self.data["current_schedule"] = [{"job_id": "J1", "machine_id": "M1", "start": start}]
        self.schedule = copy.deepcopy(self.data["current_schedule"])

    def test_fixture_baseline_pass(self):
        result = verify_schedule(self.data, self.schedule)
        self.assertEqual(result["status"], "PASS", result)
        self.assertEqual(len(result["jobs"]), 8)
        self.assertEqual(sum(j["quantity"] for j in result["jobs"]), 36000)

    def test_missing_duplicate_unknown_job(self):
        original = copy.deepcopy(self.schedule)
        for candidate in [original[:-1], original + [original[0]], original + [{**original[0], "job_id": "X"}]]:
            self.schedule = candidate
            self.failed("JOB_CONSERVATION")

    def test_unknown_machine(self):
        self.schedule[0]["machine_id"] = "X"
        self.failed("UNKNOWN_MACHINE")

    def test_ineligible_machine(self):
        del self.data["jobs"][0]["eligible"]["M3"]
        self.schedule[0]["machine_id"] = "M3"
        self.failed("INELIGIBLE_MACHINE")

    def test_machine_overlap(self):
        self.schedule[1]["start"] = "2026-10-19T09:00:00+07:00"
        self.failed("MACHINE_OVERLAP")

    def test_setup_gap(self):
        self.schedule[1]["start"] = "2026-10-19T10:15:00+07:00"
        self.failed("INSUFFICIENT_SETUP")

    def test_exact_setup_gap_passes(self):
        self.schedule[1]["start"] = "2026-10-19T10:30:00+07:00"
        self.assertEqual(verify_schedule(self.data, self.schedule)["status"], "PASS")

    def test_before_release(self):
        self.data["jobs"][0]["release"] = "2026-10-19T08:30:00+07:00"
        self.failed("BEFORE_RELEASE")

    def test_late_due(self):
        self.data["jobs"][0]["due"] = "2026-10-19T09:30:00+07:00"
        self.failed("LATE_DUE")

    def test_end_equal_due_passes(self):
        self.data["jobs"][0]["due"] = "2026-10-19T10:00:00+07:00"
        self.assertEqual(verify_schedule(self.data, self.schedule)["status"], "PASS")

    def test_maintenance_during_run(self):
        self.data["machines"][0]["available"] = [
            {"start": self.data["horizon"]["start"], "end": "2026-10-19T09:00:00+07:00"},
            {"start": "2026-10-19T09:30:00+07:00", "end": self.data["horizon"]["end"]}]
        self.failed("MACHINE_UNAVAILABLE")

    def test_adjacent_availability_passes(self):
        self.data["machines"][0]["available"] = [
            {"start": self.data["horizon"]["start"], "end": "2026-10-19T09:00:00+07:00"},
            {"start": "2026-10-19T09:00:00+07:00", "end": self.data["horizon"]["end"]}]
        self.assertEqual(verify_schedule(self.data, self.schedule)["status"], "PASS")

    def test_mold_shared_across_machines(self):
        self.data["jobs"][3]["mold_id"] = "K1"
        self.failed("MOLD_OVERLAP")

    def test_mold_reserved_during_setup(self):
        self.data["jobs"][3]["mold_id"] = "K1"
        self.data["jobs"][3]["family"] = "B"
        self.schedule[3]["start"] = "2026-10-19T10:15:00+07:00"
        self.failed("MOLD_OVERLAP")

    def test_first_setup_before_horizon(self):
        self.single(start="2026-10-19T00:00:00+07:00")
        self.data["jobs"][0]["family"] = "B"
        self.failed("OUTSIDE_HORIZON")

    def test_setup_during_maintenance(self):
        self.single()
        self.data["jobs"][0]["family"] = "B"
        self.data["machines"][0]["available"][0]["start"] = "2026-10-19T09:00:00+07:00"
        self.failed("MACHINE_UNAVAILABLE")

    def test_job_ending_outside_horizon(self):
        self.schedule[0]["start"] = "2026-10-19T23:00:00+07:00"
        self.failed("OUTSIDE_HORIZON")

    def test_bad_candidate_shapes_and_forged_end(self):
        for schedule in [None, {}, [{**self.schedule[0], "end": "2026-10-19T08:01:00+07:00"}], [{**self.schedule[0], "start": "bad"}]]:
            self.assertEqual(verify_schedule(self.data, schedule)["status"], "FAIL")

    def test_input_unknown_blocks_cost(self):
        self.data["setup"]["transitions"].pop()
        result = cost_schedule(self.data, self.schedule)
        self.assertEqual(result["verification"]["status"], "UNKNOWN")
        self.assertIsNone(result["cost"])

    def test_cross_0930_exact_52310(self):
        self.single()
        result = cost_schedule(self.data, self.schedule)
        self.assertEqual(result["status"], "COSTED")
        cost = result["cost"]
        self.assertEqual(cost["total_vnd"], 52310)
        self.assertEqual(cost["by_job"]["J1"]["kwh_exact"], "20/1")
        electric = [e for e in cost["ledger"] if e["component"] == "RUN_ELECTRICITY"]
        self.assertEqual([e["cost_vnd"] for e in electric], [18330, 33980])

    def test_cross_midnight_with_different_daily_rate(self):
        self.single(start="2026-10-19T23:00:00+07:00", duration=120)
        end = "2026-10-20T02:00:00+07:00"
        self.data["horizon"]["end"] = end
        self.data["jobs"][0]["due"] = end
        for m in self.data["machines"]:
            m["available"][0]["end"] = end
        self.data["tariff"]["windows"].append({"start": "2026-10-20T00:00:00+07:00", "end": end, "band": "NORMAL", "vnd_per_kwh": 2000.0})
        result = cost_schedule(self.data, self.schedule)
        self.assertEqual(result["cost"]["total_vnd"], 63800)
        self.assertEqual(result["cost"]["by_job"]["J1"]["kwh_exact"], "40/1")

    def test_all_summaries_reconcile(self):
        result = cost_schedule(self.data, self.schedule)
        cost = result["cost"]
        total = cost["total_vnd"]
        self.assertEqual(total, sum(e["cost_vnd"] for e in cost["ledger"]))
        self.assertEqual(total, sum(cost["by_machine"].values()))
        self.assertEqual(total, sum(j["total_vnd"] for j in cost["by_job"].values()))
        self.assertEqual(total, sum(cost["by_component"].values()))
        self.assertEqual(cost["by_component"]["RUN_ELECTRICITY"], sum(cost["electricity_by_band"].values()))
        self.assertEqual(cost["by_component"]["SETUP"], 300000)

    def test_power_edit_recomputes_energy_and_cost(self):
        self.single()
        before = cost_schedule(self.data, self.schedule)
        self.data["jobs"][0]["eligible"]["M1"]["avg_kw"] = 22.0
        after = cost_schedule(self.data, self.schedule)
        self.assertEqual(after["cost"]["total_vnd"], 57541)
        self.assertNotEqual(before["input_hash"], after["input_hash"])

    def test_half_up_fractional_vnd_and_energy(self):
        self.single(duration=1, power=30.0)
        for w in self.data["tariff"]["windows"]:
            w["vnd_per_kwh"] = 1.0
        cost = cost_schedule(self.data, self.schedule)["cost"]
        self.assertEqual(cost["total_vnd"], 1)
        self.assertEqual(cost["by_job"]["J1"]["kwh_exact"], "1/2")

    def test_each_tariff_boundary_against_hand_calculation(self):
        cases = [("03:30", 30230), ("09:00", 52310), ("11:00", 52310),
                 ("16:30", 52310), ("19:30", 52310), ("21:30", 30230)]
        for clock, expected in cases:
            with self.subTest(clock=clock):
                self.setUp()
                self.single(start=f"2026-10-19T{clock}:00+07:00")
                self.assertEqual(cost_schedule(self.data, self.schedule)["cost"]["total_vnd"], expected)

    def test_alternative_machine_uses_its_own_duration_and_power(self):
        self.single(start="2026-10-19T04:00:00+07:00")
        self.data["jobs"][0]["eligible"]["M2"] = {"duration_min": 90, "avg_kw": 10.0, "power_source": "SYNTHETIC"}
        self.schedule[0]["machine_id"] = "M2"
        report = cost_schedule(self.data, self.schedule)
        self.assertEqual(report["cost"]["total_vnd"], 27495)
        self.assertEqual(report["cost"]["total_kwh_exact"], "15/1")
        self.assertEqual(report["verification"]["jobs"][0]["end"], "2026-10-19T05:30:00+07:00")

    def test_energy_summaries_reconcile_exactly(self):
        cost = cost_schedule(self.data, self.schedule)["cost"]
        self.assertEqual(Fraction(cost["total_kwh_exact"]), sum(Fraction(j["kwh_exact"]) for j in cost["by_job"].values()))
        self.assertEqual(Fraction(cost["total_kwh_exact"]), sum(Fraction(e) for e in cost["kwh_by_band_exact"].values()))

    def test_same_family_touching_jobs_and_mold_pass(self):
        self.data["jobs"][1]["family"] = "A"
        self.data["jobs"][1]["mold_id"] = "K1"
        self.schedule[1]["start"] = "2026-10-19T10:00:00+07:00"
        self.assertEqual(verify_schedule(self.data, self.schedule)["status"], "PASS")

    def test_invalid_baseline_cli_never_costs(self):
        self.data["current_schedule"][1]["start"] = "2026-10-19T09:00:00+07:00"
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "invalid.json"
            source.write_text(json.dumps(self.data), encoding="utf-8")
            result = subprocess.run([sys.executable, "-m", "backend", str(source), "--baseline"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "BASELINE_INVALID")
        self.assertIsNone(report["cost"])

    def test_zero_power_still_counts_setup(self):
        self.single(power=0.0)
        self.data["jobs"][0]["family"] = "B"
        self.assertEqual(cost_schedule(self.data, self.schedule)["cost"]["total_vnd"], 50000)

    def test_candidate_order_does_not_change_report(self):
        before = cost_schedule(self.data, self.schedule)
        self.assertEqual(before, cost_schedule(self.data, list(reversed(self.schedule))))

    def test_no_mutation_or_fake_totals(self):
        original = copy.deepcopy((self.data, self.schedule))
        cost_schedule(self.data, self.schedule)
        self.assertEqual(original, (self.data, self.schedule))

    def test_baseline_cli(self):
        result = subprocess.run([sys.executable, "-m", "backend", "backend/fixtures/editable_cell.json", "--baseline"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "BASELINE_VERIFIED")
        self.assertEqual(report["verification"]["status"], "PASS")
        self.assertEqual(report["plan_id"], "B0")


if __name__ == "__main__":
    unittest.main()
