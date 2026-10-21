"""Adversarial, unit and HTTP coverage for the optional no-mold factory-1 core."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient
from backend.app import app
from backend.factory_core import analyze_factory

EXAMPLE = Path(__file__).resolve().parents[1] / "fixtures/factory_generic_demo.json"


class GenericFactoryCoreTests(unittest.TestCase):
    def setUp(self):
        self.raw = json.loads(EXAMPLE.read_text(encoding="utf-8"))

    def test_fixed_machine_baseline_and_cost_reconciliation(self):
        report = analyze_factory(self.raw, mode="FIXED_MACHINE")
        self.assertEqual(report["status"], "COMPLETED", report)
        self.assertEqual(report["source_type"], "SYNTHETIC")
        self.assertEqual(report["plans"]["B0"]["cost"]["total_vnd"], 208000)
        self.assertEqual(report["plans"]["B0"]["cost"]["energy_kwh"], 52)
        for name, plan in report["plans"].items():
            self.assertEqual(plan["verification"]["status"], "PASS", name)
            self.assertEqual(len(plan["verification"]["jobs"]), 3)
            self.assertEqual(sum(item["vnd"] for item in plan["cost"]["ledger"]), plan["cost"]["total_vnd"])
            self.assertEqual(sum(item["kwh"] for item in plan["cost"]["ledger"]), plan["cost"]["energy_kwh"])
            self.assertTrue(all(a["machine_id"] ==
                next(b["machine_id"] for b in self.raw["current_schedule"] if b["job_id"] == a["job_id"])
                for a in plan["schedule"]))
        self.assertLess(report["plans"]["B1"]["cost"]["total_vnd"], report["plans"]["B0"]["cost"]["total_vnd"])
        self.assertLessEqual(report["plans"]["B2"]["cost"]["total_vnd"], report["plans"]["B1"]["cost"]["total_vnd"])
        self.assertTrue(report["search"]["global_optimum_proven"])
        self.assertEqual(report["search"]["b2"]["status"], "OPTIMAL")
        self.assertIn("OR-Tools CP-SAT", report["search"]["algorithm"])
        self.assertEqual(report["decision"]["kind"], "REVIEW_REQUIRED")
        self.assertEqual(report["setup_assumption"], "NO_SETUP_REQUIRED_CONFIRMED")

    def test_joint_mode_can_consider_other_machines_and_durations(self):
        report = analyze_factory(self.raw, mode="JOINT_MACHINE_TIME", max_evaluations=1500)
        self.assertEqual(report["status"], "COMPLETED", report)
        self.assertTrue(all(p["verification"]["status"] == "PASS" for p in report["plans"].values()))
        self.assertLess(report["plans"]["B2"]["cost"]["total_vnd"], 208000)
        fixed = analyze_factory(self.raw, mode="FIXED_MACHINE", max_evaluations=1500)
        self.assertLess(report["plans"]["B2"]["cost"]["total_vnd"],
                        fixed["plans"]["B2"]["cost"]["total_vnd"],
                        "Synthetic example should distinguish machine-and-time search from fixed-machine search")
        baseline_by_id = {a["job_id"]: a["machine_id"] for a in self.raw["current_schedule"]}
        self.assertTrue(any(a["machine_id"] != baseline_by_id[a["job_id"]]
                            for a in report["plans"]["B2"]["schedule"]))
        self.assertTrue(all(a["machine_id"] in next(j["eligible"] for j in self.raw["jobs"]
                                                   if j["id"] == a["job_id"])
                            for a in report["plans"]["B2"]["schedule"]))

    def test_unsupported_constraints_are_blocked_not_ignored(self):
        self.raw["unsupported_constraints"] = ["shared_workforce_2_operators"]
        report = analyze_factory(self.raw)
        self.assertEqual(report["status"], "BLOCKED")
        self.assertEqual(report["code"], "UNSUPPORTED_CONSTRAINTS")
        self.assertIsNone(report["cost"])

    def test_missing_setup_confirmation_and_untrusted_unknown_fields_block(self):
        for edit in ("remove_setup", "add_fabricated_cost"):
            data = deepcopy(self.raw)
            if edit == "remove_setup":
                del data["setup_assumption"]
            else:
                data["guaranteed_savings"] = 9999999
            result = analyze_factory(data)
            self.assertEqual(result["status"], "BLOCKED")
            self.assertEqual(result["code"], "SCHEMA_INVALID")

    def test_undeclared_constraint_review_field_blocks(self):
        del self.raw["unsupported_constraints"]
        report = analyze_factory(self.raw)
        self.assertEqual(report["status"], "BLOCKED")
        self.assertEqual(report["code"], "SCHEMA_INVALID")

    def test_invalid_baseline_is_not_costed(self):
        self.raw["current_schedule"][1]["start"] = self.raw["current_schedule"][0]["start"]
        report = analyze_factory(self.raw)
        self.assertEqual(report["status"], "BASELINE_INVALID")
        self.assertIsNone(report["plans"]["B0"]["cost"])
        self.assertNotIn("B1", report["plans"])
        self.assertIn("MACHINE_OVERLAP", [x["code"] for x in report["plans"]["B0"]["verification"]["issues"]])

    def test_tariff_missing_coverage_and_provenance_block(self):
        self.raw["tariffs"][-1]["end"] = "2026-10-19T15:00:00+07:00"
        self.assertEqual(analyze_factory(self.raw)["code"], "TARIFF_INCOMPLETE")
        data = json.loads(EXAMPLE.read_text(encoding="utf-8"))
        data["jobs"][0]["eligible"]["CNC-A"]["power_source"] = "MEASURED"
        self.assertEqual(analyze_factory(data)["code"], "PROVENANCE_CONFLICT")

    def test_empty_or_invalid_optimization_mode_block(self):
        self.assertEqual(analyze_factory(self.raw, mode="ANYTHING")["code"], "UNSUPPORTED_MODE")
        self.assertEqual(analyze_factory(self.raw, max_evaluations=0)["code"], "SEARCH_LIMIT_INVALID")

    def test_other_industry_without_molds_remains_compatible(self):
        data = deepcopy(self.raw)
        data["metadata"]["industry"] = "Đóng gói thực phẩm một công đoạn"
        data["metadata"]["plant_alias"] = "PACKAGING_CELL"
        result = analyze_factory(data)
        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(result["factory"]["industry"], "Đóng gói thực phẩm một công đoạn")
        self.assertNotEqual(result["input_hash"], analyze_factory(self.raw)["input_hash"])


    def test_cp_sat_two_move_b2_strictly_improves_over_one_move_b1(self):
        raw = deepcopy(self.raw)
        raw["machines"] = raw["machines"][:1]
        raw["jobs"] = raw["jobs"][:2]
        raw["current_schedule"] = raw["current_schedule"][:2]
        raw["current_schedule"][1]["start"] = "2026-10-19T09:00:00+07:00"
        for job in raw["jobs"]:
            job["eligible"] = {"CNC-A": job["eligible"]["CNC-A"]}
            job["due"] = "2026-10-19T12:00:00+07:00"
        raw["horizon"]["end"] = "2026-10-19T12:00:00+07:00"
        raw["machines"][0]["available"][0]["end"] = "2026-10-19T12:00:00+07:00"
        raw["tariffs"][0]["end"] = "2026-10-19T10:00:00+07:00"
        raw["tariffs"][1]["start"] = "2026-10-19T10:00:00+07:00"
        raw["tariffs"][1]["end"] = "2026-10-19T12:00:00+07:00"
        report = analyze_factory(raw, mode="FIXED_MACHINE")
        self.assertEqual(report["status"], "COMPLETED", report)
        self.assertTrue(report["search"]["global_optimum_proven"])
        self.assertEqual(report["plans"]["B0"]["cost"]["total_vnd"], 152000)
        self.assertEqual(report["plans"]["B1"]["cost"]["total_vnd"], 92000)
        self.assertEqual(report["plans"]["B2"]["cost"]["total_vnd"], 38000)
        original = {row["job_id"]: row for row in raw["current_schedule"]}
        changed_b1 = sum(a["start"] != original[a["job_id"]]["start"]
                         for a in report["plans"]["B1"]["schedule"])
        self.assertEqual(changed_b1, 1)
        self.assertEqual(len(report["plans"]["B2"]["verification"]["jobs"]), 2)

    def test_explicit_precedence_is_enforced_and_independently_verified(self):
        raw = deepcopy(self.raw)
        raw["precedence"] = [{"before": "J1", "after": "J2", "min_lag_minutes": 0}]
        report = analyze_factory(raw, mode="JOINT_MACHINE_TIME")
        self.assertEqual(report["status"], "COMPLETED", report)
        self.assertIn("PRECEDENCE", report["enforced_constraints"])
        for plan in report["plans"].values():
            by_id = {a["job_id"]: a for a in plan["verification"]["jobs"]}
            self.assertGreaterEqual(by_id["J2"]["start"], by_id["J1"]["end"])
        raw["precedence"][0]["min_lag_minutes"] = 120
        invalid = analyze_factory(raw)
        self.assertEqual(invalid["status"], "BASELINE_INVALID")
        self.assertIn("PRECEDENCE_VIOLATION",
                      [i["code"] for i in invalid["plans"]["B0"]["verification"]["issues"]])

    def test_shared_renewable_capacity_and_calendar(self):
        raw = deepcopy(self.raw)
        raw["resources"] = [{"id": "STAFF", "capacity": 1,
                             "available": [{"start": raw["horizon"]["start"],
                                             "end": raw["horizon"]["end"]}]}]
        raw["jobs"][0]["demands"] = {"STAFF": 1}
        raw["jobs"][2]["demands"] = {"STAFF": 1}
        report = analyze_factory(raw, mode="JOINT_MACHINE_TIME")
        self.assertEqual(report["status"], "COMPLETED", report)
        self.assertIn("RESOURCE_CAPACITY", report["enforced_constraints"])
        for plan in report["plans"].values():
            by_id = {a["job_id"]: a for a in plan["verification"]["jobs"]}
            j1, j3 = by_id["J1"], by_id["J3"]
            self.assertTrue(j1["end"] <= j3["start"] or j3["end"] <= j1["start"])
        raw["current_schedule"][2]["start"] = raw["current_schedule"][0]["start"]
        invalid = analyze_factory(raw)
        self.assertEqual(invalid["status"], "BASELINE_INVALID")
        self.assertIn("RESOURCE_OVER_CAPACITY",
                      [i["code"] for i in invalid["plans"]["B0"]["verification"]["issues"]])

    def test_constraint_registry_rejects_bad_edges_pools_and_unimplemented_inventory(self):
        for mutation, expected in [
            (lambda d: d.update(precedence=[{"before": "J1", "after": "UNKNOWN"}]), "PRECEDENCE_INVALID"),
            (lambda d: d.update(precedence=[{"before": "J1", "after": "J2"},
                                            {"before": "J2", "after": "J1"}]), "PRECEDENCE_CYCLE"),
            (lambda d: d["jobs"][0].update(demands={"STAFF": 1}), "RESOURCE_UNKNOWN"),
            (lambda d: d.update(resources=[{"id": "STAFF", "capacity": 1, "available": [
                {"start": d["horizon"]["start"], "end": d["horizon"]["end"]}]}]), "RESOURCE_UNUSED"),
        ]:
            raw = deepcopy(self.raw)
            mutation(raw)
            result = analyze_factory(raw)
            self.assertEqual(result["code"], "CONSTRAINT_INVALID", result)
            self.assertIn(expected, [i["code"] for i in result["issues"]])
        raw = deepcopy(self.raw)
        raw["unsupported_constraints"] = ["inventory_stock_by_shift"]
        self.assertEqual(analyze_factory(raw)["code"], "UNSUPPORTED_CONSTRAINTS")

    def test_resource_availability_is_hard_not_soft(self):
        raw = deepcopy(self.raw)
        raw["resources"] = [{"id": "TEAM", "capacity": 2, "available": [
            {"start": "2026-10-19T10:00:00+07:00", "end": raw["horizon"]["end"]}]}]
        raw["jobs"][0]["demands"] = {"TEAM": 1}
        invalid = analyze_factory(raw)
        self.assertEqual(invalid["status"], "BASELINE_INVALID")
        self.assertIn("RESOURCE_UNAVAILABLE",
                      [i["code"] for i in invalid["plans"]["B0"]["verification"]["issues"]])


    def test_packaging_industry_uses_same_compiler_and_resource_verifier(self):
        packaging = json.loads((EXAMPLE.parent / "factory_packaging_demo.json").read_text(encoding="utf-8"))
        self.assertNotIn("mold_id", str(packaging))
        for mode in ("FIXED_MACHINE", "JOINT_MACHINE_TIME"):
            result = analyze_factory(packaging, mode=mode)
            self.assertEqual(result["status"], "COMPLETED", result)
            self.assertEqual(result["enforced_constraints"][-2:], ["PRECEDENCE", "RESOURCE_CAPACITY"])
            for plan in result["plans"].values():
                self.assertEqual(plan["verification"]["status"], "PASS")
                self.assertEqual(plan["cost"]["total_vnd"],
                                 sum(row["vnd"] for row in plan["cost"]["ledger"]))
            self.assertTrue(result["search"]["global_optimum_proven"])

    def test_cp_sat_candidate_guard_blocks_without_claiming_savings(self):
        result = analyze_factory(self.raw, max_evaluations=1)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(result["code"], "MODEL_TOO_LARGE")
        self.assertIsNone(result["cost"])
        self.assertNotIn("comparison", result)

    def test_solver_verifier_cost_disagreement_never_publishes_plan(self):
        from unittest.mock import patch
        baseline = [{"job_id": row["job_id"], "machine_id": row["machine_id"],
                     "start": __import__("datetime").datetime.fromisoformat(row["start"])}
                    for row in self.raw["current_schedule"]]
        bad_solver_details = {"status": "OPTIMAL", "global_optimum_proven": True,
                              "objective_vnd": 0, "wall_time_seconds": 0}
        with patch("backend.factory_core.solve", return_value=(baseline, bad_solver_details)):
            result = analyze_factory(self.raw)
        self.assertEqual(result["code"], "SOLVER_VERIFIER_MISMATCH")
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIsNone(result["cost"])

    def test_fractional_power_and_tariff_cost_parity(self):
        raw = deepcopy(self.raw)
        raw["jobs"][0]["eligible"]["CNC-A"]["average_kw"] = 0.3333
        raw["tariffs"][0]["vnd_per_kwh"] = 4000.49
        raw["tariffs"][1]["vnd_per_kwh"] = 999.91
        result = analyze_factory(raw, mode="JOINT_MACHINE_TIME")
        self.assertEqual(result["status"], "COMPLETED", result)
        self.assertEqual(result["plans"]["B2"]["cost"]["total_vnd"],
                         sum(entry["vnd"] for entry in result["plans"]["B2"]["cost"]["ledger"]))
        self.assertTrue(result["search"]["global_optimum_proven"])


    def test_declared_changeovers_schedule_and_cost_reconciliation(self):
        raw = json.loads((EXAMPLE.parent / "factory_changeover_demo.json").read_text(encoding="utf-8"))
        for mode in ("FIXED_MACHINE", "JOINT_MACHINE_TIME"):
            report = analyze_factory(raw, mode=mode)
            self.assertEqual(report["status"], "COMPLETED", report)
            self.assertIn("SEQUENCE_CHANGEOVER", report["enforced_constraints"])
            self.assertEqual(report["plans"]["B0"]["cost"]["total_vnd"], 77000)
            self.assertEqual(report["plans"]["B0"]["cost"]["changeover_total_vnd"], 7000)
            for plan in report["plans"].values():
                self.assertEqual(plan["verification"]["status"], "PASS")
                fees = sum(item["flat_cost_vnd"] for item in plan["cost"]["changeover_ledger"])
                energy_charge = sum(item["vnd"] for item in plan["cost"]["ledger"])
                self.assertEqual(plan["cost"]["total_vnd"], fees + energy_charge)
                self.assertEqual(len(plan["verification"]["changeovers"]), 3)
                self.assertTrue(all(entry["reference"] for entry in plan["cost"]["changeover_ledger"]))
            self.assertEqual(report["search"]["b2"]["status"], "OPTIMAL")
            self.assertTrue(report["search"]["global_optimum_proven"])

    def test_changeover_gap_crew_and_machine_windows_are_verified(self):
        original = json.loads((EXAMPLE.parent / "factory_changeover_demo.json").read_text(encoding="utf-8"))
        gap = deepcopy(original)
        gap["current_schedule"][2]["start"] = "2026-10-19T09:00:00+07:00"
        r = analyze_factory(gap)
        self.assertEqual(r["status"], "BASELINE_INVALID")
        self.assertIn("CHANGEOVER_GAP", {i["code"] for i in r["plans"]["B0"]["verification"]["issues"]})
        crew = deepcopy(original)
        crew["current_schedule"][2]["start"] = "2026-10-19T10:00:00+07:00"
        r = analyze_factory(crew)
        self.assertEqual(r["status"], "BASELINE_INVALID")
        self.assertIn("RESOURCE_OVER_CAPACITY", {i["code"] for i in r["plans"]["B0"]["verification"]["issues"]})
        calendar = deepcopy(original)
        calendar["resources"][0]["available"][0]["end"] = "2026-10-19T10:00:00+07:00"
        r = analyze_factory(calendar)
        self.assertEqual(r["status"], "BASELINE_INVALID")
        self.assertIn("CHANGEOVER_RESOURCE_UNAVAILABLE",
                      {i["code"] for i in r["plans"]["B0"]["verification"]["issues"]})
        machine = deepcopy(original)
        machine["machines"][0]["available"] = [
            {"start": "2026-10-19T08:00:00+07:00", "end": "2026-10-19T10:00:00+07:00"},
            {"start": "2026-10-19T10:30:00+07:00", "end": "2026-10-19T12:00:00+07:00"}
        ]
        r = analyze_factory(machine)
        self.assertEqual(r["status"], "BASELINE_INVALID")
        self.assertIn("CHANGEOVER_MACHINE_UNAVAILABLE",
                      {i["code"] for i in r["plans"]["B0"]["verification"]["issues"]})

    def test_changeover_missing_provenance_and_mode_conflicts_are_blocked(self):
        original = json.loads((EXAMPLE.parent / "factory_changeover_demo.json").read_text(encoding="utf-8"))
        def no_transition(raw):
            raw["machines"][0]["changeovers"]["transitions"].pop()
        def no_setup_policy(raw):
            del raw["machines"][1]["changeovers"]
        def missing_family(raw):
            del raw["jobs"][0]["setup_family"]
        def zero_resource(raw):
            raw["machines"][0]["changeovers"]["transitions"][1]["duration_minutes"] = 0
        def unknown_pool(raw):
            raw["machines"][0]["changeovers"]["transitions"][1]["demands"] = {"FAKE_CREW": 1}
        def off_grid(raw):
            raw["machines"][0]["changeovers"]["transitions"][1]["duration_minutes"] = 17
        for mutator, expected in [
            (no_transition, "CHANGEOVER_MATRIX_INCOMPLETE"),
            (no_setup_policy, "SETUP_DECLARATION_REQUIRED"),
            (missing_family, "SETUP_DECLARATION_REQUIRED"),
            (zero_resource, "CHANGEOVER_ZERO_DURATION_RESOURCE"),
            (unknown_pool, "CHANGEOVER_RESOURCE_INVALID"),
            (off_grid, "CHANGEOVER_DURATION_OFF_GRID"),
        ]:
            raw = deepcopy(original)
            mutator(raw)
            r = analyze_factory(raw)
            self.assertEqual(r["code"], "CONSTRAINT_INVALID", r)
            self.assertIn(expected, [e["code"] for e in r["issues"]])
            self.assertIsNone(r["cost"])
        raw = deepcopy(original)
        raw["setup_assumption"] = "NO_SETUP_REQUIRED_CONFIRMED"
        self.assertIn("SETUP_MODE_CONFLICT", [i["code"] for i in analyze_factory(raw)["issues"]])
        raw = deepcopy(original)
        del raw["machines"][0]["changeovers"]["transitions"][1]["reference"]
        self.assertEqual(analyze_factory(raw)["code"], "SCHEMA_INVALID")

    def test_non_triangle_changeover_matrix_uses_actual_successors(self):
        raw = deepcopy(self.raw)
        raw["machines"] = raw["machines"][:1]
        raw["jobs"] = raw["jobs"][:3]
        for i, job in enumerate(raw["jobs"]):
            job["eligible"] = {"CNC-A": job["eligible"]["CNC-A"]}
            job["setup_family"] = ("A", "B", "C")[i]
            job["due"] = ("2026-10-19T09:00:00+07:00",
                          "2026-10-19T10:00:00+07:00",
                          "2026-10-19T11:00:00+07:00")[i]
        raw["current_schedule"] = [
            {"job_id": "J1", "machine_id": "CNC-A", "start": "2026-10-19T08:00:00+07:00"},
            {"job_id": "J2", "machine_id": "CNC-A", "start": "2026-10-19T09:00:00+07:00"},
            {"job_id": "J3", "machine_id": "CNC-A", "start": "2026-10-19T10:00:00+07:00"},
        ]
        raw["setup_assumption"] = "DECLARED_CHANGEOVERS"
        raw["machines"][0]["changeovers"] = {
            "initial_family": "A",
            "transitions": [
                {"from_family": fr, "to_family": to,
                 "duration_minutes": 120 if fr == "A" and to == "C" else 0,
                 "flat_cost_vnd": 0, "reference": "synthetic-nontriangle"}
                for fr in "ABC" for to in "ABC"
            ]
        }
        result = analyze_factory(raw, mode="FIXED_MACHINE")
        self.assertEqual(result["status"], "COMPLETED", result)
        self.assertEqual(result["search"]["b2"]["status"], "OPTIMAL")
        self.assertEqual(result["plans"]["B0"]["verification"]["status"], "PASS")
        self.assertEqual(result["plans"]["B2"]["verification"]["status"], "PASS")

    def test_baseline_start_must_use_declared_discrete_grid(self):
        raw = deepcopy(self.raw)
        raw["current_schedule"][0]["start"] = "2026-10-19T08:15:00+07:00"
        report = analyze_factory(raw)
        self.assertEqual(report["code"], "BASELINE_OFF_GRID")
        self.assertIsNone(report["cost"])

    def test_initial_setup_gap_and_transition_provenance(self):
        raw = json.loads((EXAMPLE.parent / "factory_changeover_demo.json").read_text(encoding="utf-8"))
        initial = deepcopy(raw)
        initial["machines"][0]["changeovers"]["initial_family"] = "BOX"
        # BOX -> FORM is 30 minutes, but baseline FORM starts at horizon start.
        report = analyze_factory(initial)
        self.assertEqual(report["status"], "BASELINE_INVALID", report)
        self.assertIn("CHANGEOVER_GAP", {i["code"] for i in report["plans"]["B0"]["verification"]["issues"]})
        no_ref = deepcopy(raw)
        no_ref["machines"][0]["changeovers"]["transitions"][0]["reference"] = ""
        self.assertEqual(analyze_factory(no_ref)["code"], "SCHEMA_INVALID")


    def test_independent_production_energy_and_combined_modes(self):
        values = {}
        for objective in ("ENERGY", "PRODUCTION", "COMBINED"):
            report = analyze_factory(self.raw, mode="JOINT_MACHINE_TIME", objective_mode=objective)
            self.assertEqual(report["status"], "COMPLETED", report)
            self.assertEqual(report["objective_mode"], objective)
            self.assertEqual(report["search"]["b2"]["status"], "OPTIMAL")
            self.assertEqual(report["search"]["b2"]["objective_vnd"],
                             report["plans"]["B2"]["cost"]["total_vnd"])
            self.assertEqual(report["search"]["b2"]["production_score"],
                             report["plans"]["B2"]["production"]["score"])
            self.assertTrue(report["search"]["global_optimum_proven"])
            values[objective] = report
        self.assertEqual(values["ENERGY"]["plans"]["B2"]["cost"]["total_vnd"], 50000)
        self.assertEqual(values["ENERGY"]["plans"]["B2"]["production"]["makespan_minutes"], 450)
        self.assertEqual(values["PRODUCTION"]["plans"]["B2"]["production"]["makespan_minutes"], 120)
        self.assertEqual(values["PRODUCTION"]["plans"]["B0"]["production"]["makespan_minutes"], 180)
        self.assertEqual(values["PRODUCTION"]["plans"]["B1"]["cost"]["total_vnd"], 236000)
        self.assertFalse(values["PRODUCTION"]["comparison"]["cost_nonworsening_guaranteed"])
        self.assertEqual(values["PRODUCTION"]["search"]["b2"]["objective_kind"], "PRODUCTION_SCORE")
        self.assertEqual(values["COMBINED"]["plans"]["B2"]["cost"]["total_vnd"], 200000)
        self.assertEqual(values["COMBINED"]["plans"]["B2"]["production"]["makespan_minutes"], 150)
        self.assertEqual(values["COMBINED"]["search"]["makespan_limit_minutes"], 180)
        self.assertTrue(values["COMBINED"]["comparison"]["cost_nonworsening_guaranteed"])

    def test_combined_explicit_production_slack_tradeoff(self):
        report = analyze_factory(self.raw, mode="JOINT_MACHINE_TIME",
                                 objective_mode="COMBINED", max_makespan_slack_minutes=90)
        self.assertEqual(report["status"], "COMPLETED", report)
        self.assertEqual(report["search"]["makespan_limit_minutes"], 270)
        self.assertEqual(report["plans"]["B2"]["production"]["makespan_minutes"], 270)
        self.assertEqual(report["plans"]["B2"]["cost"]["total_vnd"], 152000)
        self.assertEqual(report["comparison"]["makespan_change_b2_minutes"], 90)
        self.assertGreaterEqual(report["plans"]["B2"]["production"]["makespan_minutes"],
                                report["plans"]["B0"]["production"]["makespan_minutes"])
        for p in ("B1", "B2"):
            self.assertLessEqual(report["plans"][p]["production"]["makespan_minutes"], 270)
            self.assertLessEqual(report["plans"][p]["cost"]["total_vnd"],
                                 report["plans"]["B0"]["cost"]["total_vnd"])

    def test_objective_and_makespan_guard_fail_closed(self):
        for opts, code in [
            ({"objective_mode": "MAGIC"}, "UNSUPPORTED_OBJECTIVE_MODE"),
            ({"objective_mode": "PRODUCTION", "max_makespan_slack_minutes": 30}, "PRODUCTION_GUARD_INVALID"),
            ({"objective_mode": "ENERGY", "max_makespan_slack_minutes": 30}, "PRODUCTION_GUARD_INVALID"),
            ({"objective_mode": "COMBINED", "max_makespan_slack_minutes": -30}, "PRODUCTION_GUARD_INVALID"),
            ({"objective_mode": "COMBINED", "max_makespan_slack_minutes": 17}, "PRODUCTION_GUARD_OFF_GRID"),
            ({"objective_mode": "COMBINED", "max_makespan_slack_minutes": 1470}, "PRODUCTION_GUARD_INVALID"),
            ({"objective_mode": "COMBINED", "max_makespan_slack_minutes": 15.0}, "PRODUCTION_GUARD_INVALID"),
        ]:
            result = analyze_factory(self.raw, **opts)
            self.assertEqual(result["code"], code, result)
            self.assertIsNone(result["cost"])
            self.assertNotIn("plans", result)

    def test_all_objectives_respect_changeover_and_renewable_capacity(self):
        raw = json.loads((EXAMPLE.parent / "factory_changeover_demo.json").read_text(encoding="utf-8"))
        for objective in ("PRODUCTION", "ENERGY", "COMBINED"):
            report = analyze_factory(raw, mode="JOINT_MACHINE_TIME", objective_mode=objective)
            self.assertEqual(report["status"], "COMPLETED", report)
            for plan in report["plans"].values():
                self.assertEqual(plan["verification"]["status"], "PASS")
                self.assertEqual(plan["cost"]["total_vnd"], sum(x["vnd"] for x in plan["cost"]["ledger"]) +
                                 sum(x["flat_cost_vnd"] for x in plan["cost"]["changeover_ledger"]))
                self.assertEqual(len(plan["verification"]["changeovers"]), 3)

    def test_production_metrics_bad_solver_proof_is_blocked(self):
        from unittest.mock import patch
        old = analyze_factory(self.raw, objective_mode="PRODUCTION")
        self.assertEqual(old["status"], "COMPLETED")
        from datetime import datetime
        baseline = [{"job_id": x["job_id"], "machine_id": x["machine_id"],
                     "start": datetime.fromisoformat(x["start"])}
                    for x in old["plans"]["B0"]["schedule"]]
        incorrect = {"status": "OPTIMAL", "objective_vnd": 208000,
                     "production_score": 123, "makespan_minutes": 120,
                     "objective_value": 123, "global_optimum_proven": True}
        with patch("backend.factory_core.solve", return_value=(baseline, incorrect)):
            report = analyze_factory(self.raw, objective_mode="PRODUCTION")
        self.assertEqual(report["code"], "SOLVER_VERIFIER_MISMATCH")
        self.assertIsNone(report["cost"])


class FactoryApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.factory = json.loads(EXAMPLE.read_text(encoding="utf-8"))

    def test_example_and_independent_and_joint_endpoints(self):
        example = self.client.get("/api/factory/example")
        self.assertEqual(example.status_code, 200)
        self.assertEqual(example.json()["schema_version"], "factory-1")
        packaging = self.client.get("/api/factory/packaging-example")
        self.assertEqual(packaging.status_code, 200)
        self.assertEqual(packaging.json()["metadata"]["source_type"], "SYNTHETIC")
        self.assertEqual(len(packaging.json()["precedence"]), 1)
        changeovers = self.client.get("/api/factory/changeover-example")
        self.assertEqual(changeovers.status_code, 200)
        self.assertEqual(changeovers.json()["setup_assumption"], "DECLARED_CHANGEOVERS")
        setup_response = self.client.post("/api/factory/analyze", json={
            "mode": "JOINT_MACHINE_TIME", "factory": changeovers.json()})
        self.assertEqual(setup_response.json()["status"], "COMPLETED", setup_response.json())
        self.assertIn("SEQUENCE_CHANGEOVER", setup_response.json()["enforced_constraints"])
        for mode in ("FIXED_MACHINE", "JOINT_MACHINE_TIME"):
            response = self.client.post("/api/factory/analyze", json={"mode": mode, "factory": self.factory})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["status"], "COMPLETED")
            self.assertTrue(all(p["verification"]["status"] == "PASS" for p in response.json()["plans"].values()))

    def test_missing_fields_are_rejected_not_guessed(self):
        response = self.client.post("/api/factory/analyze", json={"factory": self.factory})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["status"], "BLOCKED")
        self.assertIsNone(response.json().get("plans"))

    def test_unsupported_constraint_never_produces_savings(self):
        factory = deepcopy(self.factory)
        factory["unsupported_constraints"] = ["worker_capacity"]
        response = self.client.post("/api/factory/analyze", json={"factory": factory, "mode": "JOINT_MACHINE_TIME"})
        self.assertEqual(response.json()["status"], "BLOCKED")
        self.assertIsNone(response.json().get("cost"))


if __name__ == "__main__":
    unittest.main()
