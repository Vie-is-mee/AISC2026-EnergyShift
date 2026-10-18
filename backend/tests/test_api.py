from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Event
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app, analysis_lock
from backend.analysis import analyze
from backend.tests.test_b1_policy import small_fixture


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.data = small_fixture()

    def test_health_and_fixture_are_local_and_versioned(self):
        health = self.client.get("/api/demo/health").json()
        self.assertEqual(health["schema_version"], "demo-3")
        fixtures = self.client.get("/api/demo/fixtures").json()
        self.assertEqual(fixtures[0]["source_type"], "SYNTHETIC")
        data = self.client.get("/api/demo/fixtures/editable-cell").json()
        self.assertEqual(len(data["jobs"]), 8)
        self.assertEqual(data["schema_version"], "demo-3")
        self.assertEqual(self.client.get("/api/demo/fixtures/unknown").status_code, 404)

    def test_public_assets_do_not_load_legacy_scenarios_or_remote_fonts(self):
        html = self.client.get("/")
        self.assertEqual(html.status_code, 200)
        self.assertIn('/app.js', html.text)
        self.assertNotIn("fonts.googleapis", html.text)
        self.assertNotIn("ERP SAP", html.text)
        js = self.client.get("/app.js")
        self.assertIn('/api/demo/analyze', js.text)
        self.assertNotIn("SCENARIOS", js.text)
        self.assertEqual(self.client.get("/live.css").status_code, 200)
        self.assertIn("no-store", html.headers["cache-control"])

    def test_legacy_builder_cannot_overwrite_live_script(self):
        root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            for name in ["build_app.py", "app_logic_part.js", "scenarios_extracted.js"]:
                shutil.copy2(root / name, temporary / name)
            (temporary / "app.js").write_text("// live frontend must survive\n", encoding="utf-8")
            result = subprocess.run([sys.executable, str(temporary / "build_app.py")], cwd=temporary, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((temporary / "app.js").read_text(), "// live frontend must survive\n")
            self.assertIn("SCENARIOS", (temporary / "legacy/app.js").read_text(encoding="utf-8"))

    def test_private_files_and_legacy_are_not_served(self):
        for path in ["/.env", "/.env_example", "/.git/config", "/backend/app.py", "/requirements.txt", "/legacy/index.html", "/scenarios_extracted.js", "/docs/UPGRADE_HISTORY.md", "/styles.css"]:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_invalid_json_duplicate_keys_and_nonfinite_numbers_rejected(self):
        for text in ['{', '{"x":1,"x":2}', '{"x":NaN}']:
            response = self.client.post("/api/demo/analyze", content=text, headers={"content-type": "application/json"})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["errors"][0]["code"], "INVALID_JSON")

    def test_content_type_size_encoding_and_origin_guards(self):
        self.assertEqual(self.client.post("/api/demo/analyze", content="{}").status_code, 415)
        self.assertEqual(self.client.post("/api/demo/analyze", content=b"x" * (512 * 1024 + 1), headers={"content-type":"application/json"}).status_code, 413)
        self.assertEqual(self.client.post("/api/demo/analyze", content=b"\xff", headers={"content-type":"application/json"}).status_code, 422)
        self.assertEqual(self.client.post("/api/demo/analyze", json=self.data, headers={"origin":"https://unrelated.example"}).status_code, 403)
        self.assertEqual(self.client.get("/", headers={"host":"unrelated.example"}).status_code, 400)

    def test_job_limit_is_enforced_before_search(self):
        data = self.client.get("/api/demo/fixtures/editable-cell").json()
        extra = deepcopy(data["jobs"][0]); extra["id"] = "J9"
        data["jobs"].append(extra)
        data["current_schedule"].append({"job_id":"J9", "machine_id":"M1", "start":"2026-10-19T20:00:00+07:00"})
        result = self.client.post("/api/demo/analyze", json=data)
        self.assertEqual(result.status_code, 422)
        self.assertEqual(result.json()["errors"][0]["code"], "DEMO_LIMIT")

    def test_reanalysis_uses_edited_input_and_one_result_snapshot(self):
        first = self.client.post("/api/demo/analyze", json=self.data).json()
        self.assertEqual(first["decision"]["kind"], "CHANGE")
        self.assertEqual(first["input_hash"], first["plans"]["B1"]["input_hash"])
        self.assertEqual(first["input_snapshot"]["jobs"][0]["quantity"], 1000)
        self.data["cost_scope"]["excluded_review"]["LABOR_OVERTIME"].update(status="UNKNOWN", incremental_min_vnd=None, incremental_max_vnd=None)
        second = self.client.post("/api/demo/analyze", json=self.data).json()
        self.assertEqual(second["decision"]["kind"], "MEASURE_FIRST")
        self.assertNotEqual(first["input_hash"], second["input_hash"])
        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertIsNone(second["plans"]["B2"]["cost"])

    def test_invalid_baseline_has_no_economic_result(self):
        self.data["current_schedule"][0]["start"] = "2026-10-19T23:30:00+07:00"
        response = self.client.post("/api/demo/analyze", json=self.data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "BASELINE_INVALID")
        self.assertIsNone(response.json()["B0"]["cost"])
        self.assertNotIn("comparison", response.json())

    def test_quantity_mismatch_returns_actionable_error(self):
        self.data["jobs"][0]["quantity"] = 1000000
        result = self.client.post("/api/demo/analyze", json=self.data)
        self.assertEqual(result.status_code, 422)
        self.assertEqual(result.json()["errors"][0]["code"], "LOT_CONFIRMATION_MISMATCH")

    def test_analysis_runs_off_event_loop_and_conflicts_are_explicit(self):
        entered, release = Event(), Event()
        def slow(data, **kwargs):
            entered.set()
            release.wait(10)
            return analyze(data, **kwargs)
        with patch("backend.app.analyze", side_effect=slow), ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(self.client.post, "/api/demo/analyze", json=self.data)
            try:
                self.assertTrue(entered.wait(5))
                self.assertTrue(self.client.get("/api/demo/health").json()["analysis_busy"])
                self.assertEqual(self.client.post("/api/demo/analyze", json=self.data).status_code, 409)
            finally:
                release.set()
            self.assertEqual(future.result(timeout=10).status_code, 200)
        self.assertFalse(analysis_lock.locked())

    def test_internal_error_never_echoes_diagnostics_or_leaks_lock(self):
        with patch("backend.app.analyze", side_effect=RuntimeError("private diagnostic")):
            result = self.client.post("/api/demo/analyze", json=self.data)
        self.assertEqual(result.status_code, 500)
        self.assertNotIn("private diagnostic", result.text)
        self.assertFalse(analysis_lock.locked())


if __name__ == "__main__":
    unittest.main()
