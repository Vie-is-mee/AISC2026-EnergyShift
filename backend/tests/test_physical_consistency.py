import copy
import json
from pathlib import Path
import unittest

from backend.costing import cost_schedule
from backend.validation import validate_input
from backend.verifier import verify_schedule


class PhysicalConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((Path(__file__).parents[1] / "fixtures/editable_cell.json").read_text())

    def codes(self):
        return {e.code for e in validate_input(self.data).errors}

    def test_quantity_only_edit_is_blocked_for_all_machine_profiles(self):
        self.data["jobs"][0]["quantity"] = 1000000
        result = validate_input(self.data)
        self.assertEqual(result.status, "BLOCKED_INVALID")
        self.assertEqual(sum(e.code == "LOT_CONFIRMATION_MISMATCH" for e in result.errors), 3)
        self.assertIsNone(cost_schedule(self.data, self.data["current_schedule"])["cost"])

    def test_duration_only_edit_is_blocked(self):
        self.data["jobs"][0]["eligible"]["M1"]["duration_min"] += 1
        self.assertIn("LOT_CONFIRMATION_MISMATCH", self.codes())

    def test_reconfirmed_lot_is_explicitly_accepted(self):
        job = self.data["jobs"][0]
        job["quantity"] = 2000
        for p in job["eligible"].values():
            p["duration_min"] *= 2
            p["lot_confirmation"].update(quantity=2000, duration_min=p["duration_min"], reference="synthetic-reconfirmed-lot-v3")
        self.assertEqual(validate_input(self.data).status, "READY")

    def test_one_stale_alternative_machine_confirmation_is_blocked(self):
        self.data["jobs"][0]["eligible"]["M2"]["lot_confirmation"]["quantity"] = 1
        self.assertIn("LOT_CONFIRMATION_MISMATCH", self.codes())

    def test_missing_or_false_confirmation_evidence_is_blocked(self):
        original = copy.deepcopy(self.data)
        for mode in ("missing", "empty_reference", "whitespace_reference", "fake_measured"):
            with self.subTest(mode=mode):
                self.data = copy.deepcopy(original)
                profile = self.data["jobs"][0]["eligible"]["M1"]
                if mode == "missing":
                    del profile["lot_confirmation"]
                elif mode == "empty_reference":
                    profile["lot_confirmation"]["reference"] = ""
                elif mode == "whitespace_reference":
                    profile["lot_confirmation"]["reference"] = "  "
                else:
                    profile["lot_confirmation"]["source_type"] = "MEASURED"
                self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_old_schema_is_not_silently_migrated(self):
        self.data["schema_version"] = "demo-1"
        self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_initial_mold_must_be_explicit(self):
        del self.data["setup"]["initial_mold_by_machine"]["M1"]
        self.assertIn("INITIAL_MOLD_INCOMPLETE", self.codes())

    def test_one_initial_physical_location_per_mold(self):
        self.data["setup"]["initial_mold_by_machine"]["M2"] = "K1"
        self.assertIn("INITIAL_MOLD_CONFLICT", self.codes())

    def test_unknown_initial_mold(self):
        self.data["setup"]["initial_mold_by_machine"]["M1"] = "K99"
        self.assertIn("UNKNOWN_MOLD", self.codes())

    def test_missing_physical_changeover_is_not_zero(self):
        del self.data["setup"]["mold_change_by_machine"]["M1"]
        self.assertIn("MOLD_CHANGE_INCOMPLETE", self.codes())

    def test_zero_or_negative_changeover_time_is_rejected(self):
        for minutes in (0, -1):
            self.data["setup"]["mold_change_by_machine"]["M1"]["minutes"] = minutes
            self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_unacknowledged_family_cost_scope_is_rejected(self):
        del self.data["setup"]["family_transition_scope"]
        self.assertEqual(validate_input(self.data).status, "BLOCKED_INVALID")

    def test_physical_setup_during_maintenance_is_rejected(self):
        self.data["jobs"][1]["family"] = "A"
        self.data["machines"][0]["available"] = [
            {"start": self.data["horizon"]["start"], "end": "2026-10-19T11:30:00+07:00"},
            {"start": "2026-10-19T11:45:00+07:00", "end": self.data["horizon"]["end"]}]
        report = verify_schedule(self.data, self.data["current_schedule"])
        self.assertIn("MACHINE_UNAVAILABLE", {e["code"] for e in report["issues"]})

    def test_same_family_different_mold_touching_is_rejected(self):
        self.data["jobs"][1]["family"] = "A"
        self.data["current_schedule"][1]["start"] = "2026-10-19T10:00:00+07:00"
        report = verify_schedule(self.data, self.data["current_schedule"])
        self.assertEqual(report["status"], "FAIL")
        self.assertIn("INSUFFICIENT_SETUP", {e["code"] for e in report["issues"]})

    def test_same_family_different_mold_needs_time_and_cost(self):
        self.data["jobs"][1]["family"] = "A"
        self.data["current_schedule"][1]["start"] = "2026-10-19T10:30:00+07:00"
        report = cost_schedule(self.data, self.data["current_schedule"])
        self.assertEqual(report["status"], "COSTED")
        job = next(j for j in report["verification"]["jobs"] if j["job_id"] == "J2")
        self.assertEqual((job["family_setup_minutes"], job["mold_change_minutes"], job["setup_minutes"]), (0, 30, 30))
        self.assertEqual(report["cost"]["by_job"]["J2"]["setup_vnd"], 25000)

    def test_family_cleaning_is_additional_to_physical_change(self):
        report = cost_schedule(self.data, self.data["current_schedule"])
        job = next(j for j in report["verification"]["jobs"] if j["job_id"] == "J2")
        self.assertEqual(job["setup_minutes"], 60)
        self.assertEqual(report["cost"]["by_job"]["J2"]["setup_vnd"], 75000)

    def test_empty_machine_requires_initial_installation(self):
        self.data["setup"]["initial_mold_by_machine"]["M1"] = None
        report = cost_schedule(self.data, self.data["current_schedule"])
        self.assertEqual(report["status"], "COSTED")
        self.assertEqual(report["cost"]["by_job"]["J1"]["mold_change_vnd"], 25000)
        self.data["current_schedule"][0]["start"] = self.data["horizon"]["start"]
        self.assertEqual(verify_schedule(self.data, self.data["current_schedule"])["status"], "FAIL")

    def test_unused_machine_keeps_initial_mold_reserved(self):
        self.data["jobs"] = self.data["jobs"][:1]
        self.data["setup"]["initial_family_by_machine"]["M3"] = "B"
        self.data["current_schedule"] = [{"job_id": "J1", "machine_id": "M2", "start": "2026-10-19T15:00:00+07:00"}]
        report = verify_schedule(self.data, self.data["current_schedule"])
        self.assertIn("MOLD_OVERLAP", {e["code"] for e in report["issues"]})

    def test_mold_reuse_requires_replacement_to_release_previous_machine(self):
        self.data["jobs"] = self.data["jobs"][:3]
        for job in self.data["jobs"]:
            job["family"] = "A"
        self.data["setup"]["initial_family_by_machine"]["M3"] = "B"
        self.data["jobs"][1]["mold_id"] = "K1"
        self.data["current_schedule"] = [
            {"job_id": "J1", "machine_id": "M1", "start": "2026-10-19T08:00:00+07:00"},
            {"job_id": "J3", "machine_id": "M1", "start": "2026-10-19T12:00:00+07:00"},
            {"job_id": "J2", "machine_id": "M2", "start": "2026-10-19T13:00:00+07:00"}]
        self.assertEqual(verify_schedule(self.data, self.data["current_schedule"])["status"], "PASS")
        self.data["current_schedule"][2]["start"] = "2026-10-19T12:00:00+07:00"
        report = verify_schedule(self.data, self.data["current_schedule"])
        self.assertIn("MOLD_OVERLAP", {e["code"] for e in report["issues"]})


if __name__ == "__main__":
    unittest.main()
