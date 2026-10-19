from copy import deepcopy
from datetime import datetime, timedelta
from itertools import product
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.analysis import analyze
from backend.b1 import search_b1
from backend.b2 import search_b2
from backend.costing import cost_schedule
from backend.tests.test_b1_policy import small_fixture


def coordinated_fixture():
    data = small_fixture()
    data["jobs"].append(deepcopy(data["jobs"][0]))
    data["jobs"][1]["id"] = "J2"
    data["current_schedule"].append({"job_id": "J2", "machine_id": "M1", "start": "2026-10-19T10:30:00+07:00"})
    data["cost_scope"]["review_scope"] = "ALL_CANDIDATE_SCHEDULES_IN_HORIZON"
    data["policy"]["min_b2_incremental_vnd"] = 10000
    return data


class B2Tests(unittest.TestCase):
    def test_coordinated_improvement_independent_cost_and_unmutated_input(self):
        data = coordinated_fixture(); before = deepcopy(data)
        report = analyze(data, enable_b2=True)
        b2 = report["plans"]["B2"]
        self.assertEqual([report["plans"][p]["cost"]["total_vnd"] for p in ("B0", "B1", "B2")], [135920, 91760, 47600])
        self.assertEqual(len(b2["changes"]), 2)
        self.assertEqual(cost_schedule(data, b2["schedule"])["cost"], b2["cost"])
        self.assertEqual(b2["verification"]["status"], "PASS")
        self.assertEqual(b2["solver_status"], "OPTIMAL")
        self.assertFalse(b2["solver"]["global_optimum_proven"])
        self.assertEqual(report["decision"]["selected_plan"], "B2")
        self.assertEqual(data, before)

    def test_incremental_threshold_prefers_simple_rule(self):
        data = coordinated_fixture(); data["policy"]["min_b2_incremental_vnd"] = 1000000
        report = analyze(data, enable_b2=True)
        self.assertEqual(report["decision"]["kind"], "USE_SIMPLE_RULE")
        self.assertEqual(report["decision"]["selected_plan"], "B1")

    def test_single_move_reviews_do_not_authorize_coordinated_plan(self):
        data = coordinated_fixture(); data["cost_scope"]["review_scope"] = "ALL_SINGLE_JOB_MOVES_IN_HORIZON"
        report = analyze(data, enable_b2=True)
        self.assertEqual(report["coordinated_economics"]["B2"]["status"], "UNKNOWN_SCOPE")
        self.assertEqual(report["decision"]["selected_plan"], "B1")

    def test_timeout_retains_verified_incumbent_without_proof(self):
        data = coordinated_fixture(); seed = search_b1(data)
        result = search_b2(data, seed["B0"], seed["B1"], time_limit_seconds=0)
        self.assertEqual(result["cost"], seed["B1"]["cost"])
        self.assertEqual(result["origin"], "B1")
        self.assertEqual(result["solver_status"], "UNKNOWN")
        self.assertEqual(result["solver"]["optimality"], "NOT_PROVEN")

    def test_rejected_model_falls_back(self):
        data = coordinated_fixture(); seed = search_b1(data)
        with patch("backend.b2._model", side_effect=ValueError("internal error")):
            result = search_b2(data, seed["B0"], seed["B1"])
        self.assertEqual(result["origin"], "B1")
        self.assertEqual(result["verification"]["status"], "PASS")
        self.assertEqual(result["solver_status"], "UNKNOWN")

    def test_no_change_tie_is_baseline(self):
        data = coordinated_fixture()
        for window in data["tariff"]["windows"]: window["vnd_per_kwh"] = 1000.0
        report = analyze(data, enable_b2=True)
        self.assertEqual(report["decision"]["kind"], "KEEP_CURRENT")
        self.assertEqual(report["plans"]["B2"]["schedule"], report["plans"]["B0"]["schedule"])

    def test_negative_extra_cost_cannot_recommend_unchanged_schedule(self):
        data = coordinated_fixture()
        for window in data["tariff"]["windows"]: window["vnd_per_kwh"] = 1000.0
        data["cost_scope"]["excluded_review"]["OTHER_COSTS"].update(incremental_min_vnd=-100000, incremental_max_vnd=-100000)
        self.assertEqual(analyze(data, enable_b2=True)["decision"]["kind"], "KEEP_CURRENT")

    def test_unknown_cost_requires_evidence(self):
        data = coordinated_fixture()
        data["cost_scope"]["excluded_review"]["LABOR_OVERTIME"].update(status="UNKNOWN", incremental_min_vnd=None, incremental_max_vnd=None)
        self.assertEqual(analyze(data, enable_b2=True)["decision"]["kind"], "MEASURE_FIRST")

    def test_expensive_cost_keeps_baseline(self):
        data = coordinated_fixture()
        data["cost_scope"]["excluded_review"]["LABOR_OVERTIME"].update(incremental_min_vnd=1000000, incremental_max_vnd=1000000)
        self.assertEqual(analyze(data, enable_b2=True)["decision"]["kind"], "KEEP_CURRENT")

    def test_invalid_seeds_and_parameters_are_rejected(self):
        for limit in (-1, 31, True, float("nan")):
            with self.assertRaises(ValueError): search_b2({}, {}, {}, time_limit_seconds=limit)
        data = coordinated_fixture(); seed = search_b1(data)
        seed["B1"]["schedule"][0]["machine_id"] = "UNKNOWN"
        with self.assertRaises(ValueError): search_b2(data, seed["B0"], seed["B1"])

    def test_physical_mold_models_do_not_silently_fail(self):
        data = json.loads((Path(__file__).resolve().parents[1] / "fixtures/editable_cell.json").read_text())
        seed = search_b1(data)
        result = search_b2(data, seed["B0"], seed["B1"], time_limit_seconds=10)
        self.assertEqual(result["verification"]["status"], "PASS")
        self.assertTrue(all(r["status"] in ("OPTIMAL", "FEASIBLE", "UNKNOWN", "NOT_RUN") for r in result["solver"]["models"]))
        self.assertLessEqual(result["cost"]["total_vnd"], seed["B1"]["cost"]["total_vnd"])

    def test_exhaustive_oracle_calendar_gap_and_offgrid_anchors(self):
        data = coordinated_fixture()
        data["machines"][0]["available"] = [{"start": "2026-10-19T00:00:00+07:00", "end": "2026-10-19T01:00:00+07:00"}, {"start": "2026-10-19T09:00:00+07:00", "end": "2026-10-20T00:00:00+07:00"}]
        seed = search_b1(data, grid_minutes=120)
        result = search_b2(data, seed["B0"], seed["B1"], grid_minutes=120)
        start = datetime.fromisoformat(data["horizon"]["start"])
        domains = []
        for job in data["jobs"]:
            anchors = {(datetime.fromisoformat(a["start"]) - start) // timedelta(minutes=1) for p in (seed["B0"], seed["B1"]) for a in p["schedule"] if a["job_id"] == job["id"]}
            domains.append(sorted(set(range(0, 1441, 120)) | anchors))
        best = seed["B0"]["cost"]["total_vnd"]
        for left, right in product(*domains):
            if left + 60 > right: continue
            schedule = [{"job_id": j["id"], "machine_id": "M1", "start": (start + timedelta(minutes=m)).isoformat()} for j, m in zip(data["jobs"], (left, right))]
            checked = cost_schedule(data, schedule)
            if checked["status"] == "COSTED": best = min(best, checked["cost"]["total_vnd"])
        self.assertEqual(result["solver_status"], "OPTIMAL")
        self.assertEqual(result["cost"]["total_vnd"], best)
