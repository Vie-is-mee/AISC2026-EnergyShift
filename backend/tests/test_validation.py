import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

from backend.validation import parse_json, validate_input


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "backend/fixtures/editable_cell.json"


class InputGateTests(unittest.TestCase):
    def setUp(self):
        self.raw = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def blocked(self, data, code=None):
        result = validate_input(data)
        self.assertEqual(result.status, "BLOCKED_INVALID")
        self.assertIsNone(result.snapshot)
        self.assertIsNone(result.input_hash)
        self.assertTrue(result.errors)
        self.assertTrue(all(e.field and e.code and e.why and e.how_to_fix for e in result.errors))
        if code:
            self.assertIn(code, [e.code for e in result.errors])

    def test_fixture_ready_without_predetermined_verdict(self):
        original = copy.deepcopy(self.raw)
        result = validate_input(self.raw)
        self.assertEqual(result.status, "READY", result.errors)
        self.assertEqual(len(result.snapshot["jobs"]), 8)
        self.assertEqual(len(result.snapshot["machines"]), 3)
        self.assertEqual(result.snapshot["metadata"]["source_type"], "SYNTHETIC")
        self.assertNotIn("decision", result.snapshot)
        self.assertEqual(self.raw, original)

    def test_hash_repeatable_and_key_order_independent(self):
        first = validate_input(self.raw)
        reordered = dict(reversed(list(self.raw.items())))
        self.assertEqual(first.input_hash, validate_input(reordered).input_hash)
        self.assertEqual(first.input_hash, validate_input(first.snapshot).input_hash)

    def test_edit_changes_hash(self):
        before = validate_input(self.raw).input_hash
        self.raw["jobs"][0]["eligible"]["M1"]["avg_kw"] += 1
        self.assertNotEqual(before, validate_input(self.raw).input_hash)

    def test_bad_shapes(self):
        for value in [None, [], "invalid", 3, {}, {"schema_version": "demo-99"}]:
            with self.subTest(value=value):
                self.blocked(value)

    def test_missing_field(self):
        del self.raw["jobs"][0]["quantity"]
        self.blocked(self.raw, "missing")

    def test_extra_verdict_rejected(self):
        self.raw["decision"] = "CHANGE"
        self.blocked(self.raw, "extra_forbidden")

    def test_duplicate_ids(self):
        for collection in ["jobs", "machines", "molds"]:
            with self.subTest(collection=collection):
                data = copy.deepcopy(self.raw)
                data[collection].append(copy.deepcopy(data[collection][0]))
                self.blocked(data, "DUPLICATE_ID")

    def test_missing_and_duplicate_baseline_job(self):
        for assignments in [self.raw["current_schedule"][:-1], self.raw["current_schedule"] + [self.raw["current_schedule"][0]]]:
            data = copy.deepcopy(self.raw)
            data["current_schedule"] = assignments
            self.blocked(data, "JOB_CONSERVATION")

    def test_unknown_references(self):
        for field, value, code in [("mold_id", "K99", "UNKNOWN_MOLD"), ("eligible", {"M99": self.raw["jobs"][0]["eligible"]["M1"]}, "UNKNOWN_MACHINE")]:
            with self.subTest(field=field):
                data = copy.deepcopy(self.raw)
                data["jobs"][0][field] = value
                self.blocked(data, code)

    def test_unknown_baseline_machine(self):
        self.raw["current_schedule"][0]["machine_id"] = "M99"
        self.blocked(self.raw, "UNKNOWN_MACHINE")

    def test_ineligible_baseline_machine(self):
        del self.raw["jobs"][0]["eligible"]["M1"]
        self.blocked(self.raw, "INELIGIBLE_MACHINE")

    def test_negative_and_nonfinite_power(self):
        for value in [-1, float("nan"), float("inf"), "35", True]:
            data = copy.deepcopy(self.raw)
            data["jobs"][0]["eligible"]["M1"]["avg_kw"] = value
            self.blocked(data)

    def test_bad_duration_quantity_and_tariff(self):
        for value in [0, -1, 1.5, True]:
            data = copy.deepcopy(self.raw)
            data["jobs"][0]["eligible"]["M1"]["duration_min"] = value
            self.blocked(data)
        self.raw["tariff"]["windows"][0]["vnd_per_kwh"] = -1
        self.blocked(self.raw)

    def test_timezone_and_precision(self):
        for value in ["2026-10-19T00:00:00", "2026-10-19T00:00:00Z", "2026-10-19T00:00:01+07:00", "nonsense"]:
            data = copy.deepcopy(self.raw)
            data["jobs"][0]["release"] = value
            self.blocked(data)

    def test_due_before_release(self):
        self.raw["jobs"][0]["due"] = self.raw["jobs"][0]["release"]
        self.blocked(self.raw)

    def test_impossible_duration(self):
        for processing in self.raw["jobs"][0]["eligible"].values():
            processing["duration_min"] = 1500
        self.blocked(self.raw, "IMPOSSIBLE_DURATION")

    def test_tariff_gaps_overlap_and_incomplete_coverage(self):
        for value in ["2026-10-19T04:30:00+07:00", "2026-10-19T03:30:00+07:00"]:
            data = copy.deepcopy(self.raw)
            data["tariff"]["windows"][1]["start"] = value
            self.blocked(data, "TARIFF_COVERAGE")
        self.raw["tariff"]["windows"].pop()
        self.blocked(self.raw, "TARIFF_COVERAGE")

    def test_calendar_overlap_and_horizon(self):
        self.raw["machines"][0]["available"].append(copy.deepcopy(self.raw["machines"][0]["available"][0]))
        self.blocked(self.raw, "CALENDAR_OVERLAP")

    def test_missing_setup_and_initial_state(self):
        data = copy.deepcopy(self.raw)
        data["setup"]["transitions"].pop()
        self.blocked(data, "MISSING_TRANSITION")
        del self.raw["setup"]["initial_family_by_machine"]["M1"]
        self.blocked(self.raw, "INITIAL_STATE_INCOMPLETE")

    def test_duplicate_setup(self):
        self.raw["setup"]["transitions"].append(copy.deepcopy(self.raw["setup"]["transitions"][0]))
        self.blocked(self.raw, "DUPLICATE_TRANSITION")

    def test_false_provenance(self):
        self.raw["jobs"][0]["eligible"]["M1"]["power_source"] = "MEASURED"
        self.blocked(self.raw, "PROVENANCE_MISMATCH")

    def test_cost_exclusions_required(self):
        self.raw["cost_scope"]["excluded"].pop()
        self.blocked(self.raw, "COST_SCOPE_INCOMPLETE")

    def test_json_errors(self):
        for text in ['{', '{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}']:
            result = parse_json(text)
            self.assertEqual(result.status, "BLOCKED_INVALID")
            self.assertEqual(result.errors[0].code, "INVALID_JSON")

    def test_cli_exit_codes(self):
        valid = subprocess.run([sys.executable, "-m", "backend", str(FIXTURE)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(valid.returncode, 0, valid.stderr)
        self.assertEqual(json.loads(valid.stdout)["status"], "READY")
        missing = subprocess.run([sys.executable, "-m", "backend", "missing-file.json"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(missing.returncode, 1)
        self.assertEqual(json.loads(missing.stdout)["errors"][0]["code"], "READ_ERROR")


if __name__ == "__main__":
    unittest.main()
