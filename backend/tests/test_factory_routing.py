"""Multistage factory-2 tests: schema, CP-SAT, independent verifier and HTTP."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

from backend.app import app
from backend.factory_routing import analyze_factory_routing

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/factory_multistage_demo.json"
CHANGEOVER = FIXTURE.parent / "factory_changeover_demo.json"


def synthetic():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.raw = synthetic()

    def test_b0_b1_b2_both_modes_with_exact_work_order_ledger(self):
        expected = {"FIXED_MACHINE": (74500, 56900, 43700),
                    "JOINT_MACHINE_TIME": (74500, 56900, 35000)}
        for mode, costs in expected.items():
            result = analyze_factory_routing(self.raw, mode=mode)
            self.assertEqual(result["status"], "COMPLETED", result)
            self.assertEqual(result["schema_version"], "factory-2")
            self.assertEqual(result["operation_count"], 4)
            self.assertEqual(result["work_order_count"], 2)
            self.assertEqual(result["buffer_assumption"], "UNLIMITED_INTERSTAGE_BUFFER_CONFIRMED")
            self.assertTrue(result["search"]["global_optimum_proven"])
            self.assertEqual(tuple(result["plans"][p]["cost"]["total_vnd"] for p in ("B0", "B1", "B2")), costs)
            for name, plan in result["plans"].items():
                self.assertEqual(plan["verification"]["status"], "PASS", name)
                self.assertEqual(len(plan["verification"]["operations"]), 4)
                self.assertEqual(len(plan["work_orders"]), 2)
                self.assertEqual(sum(order["modeled_cost_vnd"] for order in plan["work_orders"]),
                                 plan["cost"]["total_vnd"])
                for work in plan["work_orders"]:
                    stages = {s["operation_id"]: s for s in work["operations"]}
                    if work["work_order_id"] == "ORDER-A":
                        self.assertGreaterEqual(stages["SEAL"]["start"], stages["FORM"]["end"])
                    else:
                        self.assertGreaterEqual(stages["WRAP"]["start"], stages["BOX"]["end"])
                for entry in plan["cost"]["ledger"]:
                    self.assertIn(entry["work_order_id"], ("ORDER-A", "ORDER-B"))

    def test_stable_version_hash_changes_when_routing_changes(self):
        original = analyze_factory_routing(self.raw)
        changed = deepcopy(self.raw)
        changed["work_orders"][0]["precedence"][0]["min_lag_minutes"] = 30
        updated = analyze_factory_routing(changed)
        self.assertNotEqual(original["input_hash"], updated["input_hash"])
        self.assertEqual(original["schema_version"], "factory-2")
        self.assertEqual(updated["schema_version"], "factory-2")
        self.assertEqual(updated["status"], "BASELINE_INVALID")
        self.assertIsNone(updated["plans"]["B0"]["cost"])
        self.assertIn("PRECEDENCE_VIOLATION",
                      [issue["code"] for issue in updated["plans"]["B0"]["verification"]["issues"]])

    def test_missing_dependency_cannot_silently_infer_list_order(self):
        case = deepcopy(self.raw)
        case["work_orders"][0]["precedence"] = []
        result = analyze_factory_routing(case)
        self.assertEqual(result["code"], "ROUTING_INVALID")
        self.assertIn("ROUTE_EDGES_REQUIRED", [issue["code"] for issue in result["issues"]])
        self.assertIsNone(result["cost"])

    def test_disconnected_graph_and_cross_order_links_are_rejected(self):
        case = deepcopy(self.raw)
        third = deepcopy(case["work_orders"][0]["operations"][0])
        third["id"] = "CUT"
        case["work_orders"][0]["operations"].append(third)
        result = analyze_factory_routing(case)
        self.assertEqual(result["code"], "ROUTING_INVALID")
        self.assertIn("ROUTE_DISCONNECTED", [issue["code"] for issue in result["issues"]])
        case = synthetic()
        case["work_orders"][0]["precedence"][0]["after"] = "WRAP"
        result = analyze_factory_routing(case)
        self.assertEqual(result["code"], "ROUTING_INVALID")
        self.assertIn("ROUTE_EDGE_INVALID", [issue["code"] for issue in result["issues"]])

    def test_duplicate_operations_and_work_order_ids_are_blocked(self):
        for mutation, code in [
            (lambda x: x["work_orders"][1].update(id="ORDER-A"), "WORK_ORDER_DUPLICATE"),
            (lambda x: x["work_orders"][1]["operations"][0].update(id="FORM"),
             "OPERATION_NOT_GLOBAL_UNIQUE"),
        ]:
            case = deepcopy(self.raw)
            mutation(case)
            report = analyze_factory_routing(case)
            self.assertEqual(report["code"], "ROUTING_INVALID", report)
            self.assertIn(code, [issue["code"] for issue in report["issues"]])
        case = deepcopy(self.raw)
        case["work_orders"][0]["precedence"].append(deepcopy(case["work_orders"][0]["precedence"][0]))
        report = analyze_factory_routing(case)
        self.assertEqual(report["code"], "ROUTING_INVALID")
        self.assertIn("ROUTE_EDGE_DUPLICATE", [x["code"] for x in report["issues"]])

    def test_cycle_and_missing_stage_proof_are_blocked(self):
        case = deepcopy(self.raw)
        case["work_orders"][0]["precedence"].append(
            {"before": "SEAL", "after": "FORM", "min_lag_minutes": 0})
        result = analyze_factory_routing(case)
        self.assertEqual(result["code"], "CONSTRAINT_INVALID")
        self.assertIn("PRECEDENCE_CYCLE", [issue["code"] for issue in result["issues"]])
        case = deepcopy(self.raw)
        case["current_schedule"].pop()
        result = analyze_factory_routing(case)
        self.assertEqual(result["code"], "ROUTING_INVALID")
        self.assertIn("ROUTING_BASELINE_COVERAGE", [x["code"] for x in result["issues"]])

    def test_unknown_requirements_buffers_fields_are_fail_closed(self):
        for mutation, expected in [
            (lambda x: x.pop("buffer_assumption"), "SCHEMA_INVALID"),
            (lambda x: x.update(buffer_assumption="INVENTORY_CAPACITY_INFERRED"), "SCHEMA_INVALID"),
            (lambda x: x["work_orders"][0].pop("precedence"), "SCHEMA_INVALID"),
            (lambda x: x["work_orders"][0]["operations"][0].update(
                unverified_material_stock=10), "SCHEMA_INVALID"),
            (lambda x: x.update(unsupported_constraints=["finite_wip_buffer"]), "UNSUPPORTED_CONSTRAINTS"),
        ]:
            case = deepcopy(self.raw)
            mutation(case)
            result = analyze_factory_routing(case)
            self.assertEqual(result["code"], expected, result)
            self.assertIsNone(result["cost"])
            self.assertNotIn("comparison", result)

    def test_source_input_hash_not_virtual_flat_model_hash(self):
        result = analyze_factory_routing(self.raw)
        self.assertEqual(result["schema_version"], "factory-2")
        self.assertEqual(result["input_hash"][:7], "sha256:")
        self.assertEqual(len(result["input_hash"]), 71)

    def test_declared_setup_matrix_works_with_multistage_operations(self):
        raw = json.loads(CHANGEOVER.read_text(encoding="utf-8"))
        route = {
            "schema_version": "factory-2", "metadata": raw["metadata"],
            "horizon": raw["horizon"], "step_minutes": raw["step_minutes"],
            "machines": raw["machines"],
            "work_orders": [{
                "id": "SYNTHETIC-ROUTE", "release": raw["horizon"]["start"],
                "due": raw["horizon"]["end"],
                "operations": [{
                    "id": job["id"], "eligible": job["eligible"],
                    "demands": job.get("demands", {}), "setup_family": job["setup_family"]
                } for job in raw["jobs"]],
                "precedence": [
                    {"before": "FORM", "after": "SEAL", "min_lag_minutes": 0},
                    {"before": "SEAL", "after": "BOX", "min_lag_minutes": 0},
                ]
            }],
            "current_schedule": [
                {"operation_id": a["job_id"], "machine_id": a["machine_id"], "start": a["start"]}
                for a in raw["current_schedule"]
            ],
            "tariffs": raw["tariffs"], "tariff_reference": raw["tariff_reference"],
            "setup_assumption": raw["setup_assumption"],
            "buffer_assumption": "UNLIMITED_INTERSTAGE_BUFFER_CONFIRMED",
            "resources": raw["resources"], "unsupported_constraints": [],
        }
        result = analyze_factory_routing(route, mode="JOINT_MACHINE_TIME")
        self.assertEqual(result["status"], "COMPLETED", result)
        self.assertIn("SEQUENCE_CHANGEOVER", result["enforced_constraints"])
        for plan in result["plans"].values():
            self.assertEqual(plan["verification"]["status"], "PASS")
            self.assertEqual(sum(order["modeled_cost_vnd"] for order in plan["work_orders"]),
                             plan["cost"]["total_vnd"])
            self.assertEqual(plan["cost"]["changeover_total_vnd"],
                             sum(item["flat_cost_vnd"] for item in plan["cost"]["changeover_ledger"]))


    def test_multistage_independent_business_objectives(self):
        outputs = {}
        for objective in ("ENERGY", "PRODUCTION", "COMBINED"):
            report = analyze_factory_routing(self.raw, mode="JOINT_MACHINE_TIME", objective_mode=objective)
            self.assertEqual(report["status"], "COMPLETED", report)
            self.assertEqual(report["schema_version"], "factory-2")
            self.assertEqual(report["objective_mode"], objective)
            self.assertTrue(report["search"]["global_optimum_proven"])
            for plan in report["plans"].values():
                self.assertEqual(plan["verification"]["status"], "PASS")
                self.assertEqual(sum(o["modeled_cost_vnd"] for o in plan["work_orders"]),
                                 plan["cost"]["total_vnd"])
            outputs[objective] = report
        self.assertEqual(outputs["ENERGY"]["plans"]["B2"]["cost"]["total_vnd"], 35000)
        self.assertEqual(outputs["ENERGY"]["plans"]["B2"]["production"]["makespan_minutes"], 240)
        self.assertEqual(outputs["PRODUCTION"]["plans"]["B2"]["production"]["makespan_minutes"], 150)
        self.assertEqual(outputs["PRODUCTION"]["plans"]["B2"]["cost"]["total_vnd"], 85600)
        self.assertEqual(outputs["COMBINED"]["plans"]["B2"]["cost"]["total_vnd"], 53700)
        self.assertEqual(outputs["COMBINED"]["plans"]["B2"]["production"]["makespan_minutes"], 210)

    def test_multistage_combined_slack_and_validation(self):
        report = analyze_factory_routing(self.raw, mode="JOINT_MACHINE_TIME",
                                         objective_mode="COMBINED", max_makespan_slack_minutes=60)
        self.assertEqual(report["status"], "COMPLETED")
        self.assertEqual(report["search"]["makespan_limit_minutes"], 270)
        self.assertEqual(report["plans"]["B2"]["cost"]["total_vnd"], 35000)
        self.assertLessEqual(report["plans"]["B2"]["production"]["makespan_minutes"], 270)
        self.assertEqual(analyze_factory_routing(self.raw, objective_mode="PRODUCTION",
                          max_makespan_slack_minutes=30)["code"], "PRODUCTION_GUARD_INVALID")


class RoutingApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_sample_and_analyze_fixed_and_joint(self):
        response = self.client.get("/api/factory/multistage-example")
        self.assertEqual(response.status_code, 200)
        input_data = response.json()
        self.assertEqual(input_data["schema_version"], "factory-2")
        self.assertEqual(input_data["metadata"]["source_type"], "SYNTHETIC")
        for mode in ("FIXED_MACHINE", "JOINT_MACHINE_TIME"):
            report = self.client.post("/api/factory/analyze",
                                      json={"factory": input_data, "mode": mode})
            self.assertEqual(report.status_code, 200)
            self.assertEqual(report.json()["schema_version"], "factory-2")
            self.assertEqual(report.json()["status"], "COMPLETED", report.text)

    def test_route_error_does_not_publish_prices(self):
        case = synthetic()
        case["unsupported_constraints"] = ["transfer_truck"]
        report = self.client.post("/api/factory/analyze",
                                  json={"factory": case, "mode": "JOINT_MACHINE_TIME"})
        self.assertEqual(report.json()["code"], "UNSUPPORTED_CONSTRAINTS")
        self.assertIsNone(report.json()["cost"])


    def test_api_business_modes_and_strict_optional_fields(self):
        source = synthetic()
        for objective in ("ENERGY", "PRODUCTION", "COMBINED"):
            response = self.client.post("/api/factory/analyze", json={
                "factory": source, "mode": "JOINT_MACHINE_TIME",
                "objective_mode": objective, "max_makespan_slack_minutes": 0
            })
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["status"], "COMPLETED")
            self.assertEqual(response.json()["objective_mode"], objective)
        invalid = self.client.post("/api/factory/analyze", json={
            "factory": source, "mode": "JOINT_MACHINE_TIME",
            "objective_mode": "COMBINED", "max_makespan_slack_minutes": 17
        })
        self.assertEqual(invalid.json()["code"], "PRODUCTION_GUARD_OFF_GRID")
        extraneous = self.client.post("/api/factory/analyze", json={
            "factory": source, "mode": "JOINT_MACHINE_TIME", "objective_mode": "ENERGY",
            "unknown_business_override": 999
        })
        self.assertNotEqual(extraneous.status_code, 200)
        self.assertEqual(extraneous.json()["status"], "BLOCKED")
        old_api = self.client.post("/api/factory/analyze", json={
            "factory": source, "mode": "JOINT_MACHINE_TIME"
        })
        self.assertEqual(old_api.json()["objective_mode"], "ENERGY")


if __name__ == "__main__":
    unittest.main()
