"""Regression evidence for source lineage, physical constraints and grounded AI."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app, analysis_lock
from backend import demo_sources, demo_ai
from backend.demo_sources import source_audit, default_selection, upload_pair
from backend.textile_demo import TextileRequest, optimize, verify, SOURCE_DEFAULTS
from backend.demo_ai import ExplainRequest, explain


class TextileExperimentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.context = patch.object(demo_sources, "ROOT", self.root)
        self.context.start()
        self.inp = {"task_modes": [{"id": "A1", "power": [1000]}, {"id": "B1", "power": [1000]}],
                    "machines": [{"id": "M1", "task_modes": ["A1", "B1"]}], "tasks": ["A", "B"],
                    "constraints": [], "configuration": {"time_window": 6},
                    "energy_sources": [{"id": "grid", "price": [10, 10, 1, 1, 1, 1]},
                                       {"id": "solar", "availability": [0, 0, 1000, 1000, 0, 0]}]}
        self.out = {"cell_schedules": [{"machines": [{"machine": "M1", "assignments": [
            {"task_mode": "A1", "task": "A", "start": 0},
            {"task_mode": "B1", "task": "B", "start": 1},
            {"task_mode": "MISSING", "task": "A", "start": 2}]}]}], "statistics": {"cost": 123}}
        self.write()

    def tearDown(self):
        self.context.stop()
        self.temp.cleanup()

    def write(self):
        (self.root / demo_sources.INPUT).write_text(json.dumps(self.inp), encoding="utf-8")
        (self.root / demo_sources.OUTPUT).write_text(json.dumps(self.out), encoding="utf-8")

    def request(self, **extra):
        return TextileRequest(source_hash=source_audit()["source_hash"], step_minutes=60,
                              power_unit="W", price_basis="kWh", currency="SOURCE",
                              confirmed=True, subset_acknowledged=True, **extra)

    def test_lineage_and_mutual_exclusion_of_reasons(self):
        audit = source_audit()
        self.assertEqual(audit["counts"], {"total": 3, "known_mode": 2, "compatible": 2,
                                          "unknown_mode": 1, "incompatible_machine": 0})
        self.assertEqual(default_selection(audit), ["c0-m0-a0", "c0-m0-a1"])
        self.assertEqual(audit["rows"][2]["pointer"], "/cell_schedules/0/machines/0/assignments/2")
        self.assertTrue(any("2 dòng có chế độ" in warning and "2 dòng đúng máy" in warning for warning in audit["warnings"]))
        self.assertTrue(any("1 dòng thiếu" in warning for warning in audit["warnings"]))

    def test_uploaded_pair_drives_solar_analysis_without_reading_repository_data(self):
        uploaded = upload_pair(json.dumps(self.inp), json.dumps(self.out), 'my-input.json', 'my-output.json')
        original_hash = uploaded['source_hash']
        self.inp['energy_sources'][1]['availability'] = [0] * 6
        self.write()
        report = optimize(TextileRequest(source_hash=original_hash, selected_ids=default_selection(uploaded), **SOURCE_DEFAULTS))
        self.assertEqual(report['status'], 'COMPLETED')
        self.assertEqual(report['manifest']['files'][demo_sources.INPUT]['file'], 'my-input.json')
        self.assertGreater(report['plans']['B2']['cost']['solar_kwh'], 0)
        for plan in report['plans'].values():
            cost = plan['cost']
            self.assertAlmostEqual(cost['energy_kwh'], cost['solar_kwh'] + cost['grid_kwh'])
            self.assertGreaterEqual(cost['electricity'], 0)

    def test_upload_validates_roles_duplicates_and_complete_solar_series(self):
        with self.assertRaises(ValueError): upload_pair(json.dumps(self.out), json.dumps(self.inp))
        with self.assertRaises(ValueError): upload_pair('{"a":1,"a":2}', json.dumps(self.out))
        self.inp['energy_sources'][1]['availability'] = [1]
        with self.assertRaisesRegex(ValueError, 'điện mặt trời'): upload_pair(json.dumps(self.inp), json.dumps(self.out))

    def test_upload_route_returns_defaults_and_cannot_substitute_bundled_files(self):
        with TestClient(app) as client:
            missing = client.post('/api/demo/studio/source/upload', json={})
            self.assertEqual(missing.status_code, 422)
            response = client.post('/api/demo/studio/source/upload', json={'input_text': json.dumps(self.inp), 'output_text': json.dumps(self.out), 'input_name': 'uploaded-input.json', 'output_name': 'uploaded-output.json'})
            self.assertEqual(response.status_code, 200, response.text)
            audit = response.json()
            self.assertEqual(audit['origin'], 'UPLOADED_FILES')
            self.assertEqual(audit['defaults'], SOURCE_DEFAULTS)
            self.assertEqual(audit['counts']['total'], 3)
            report = client.post('/api/demo/studio/textile', json={'source_hash': audit['source_hash'], 'selected_ids': audit['default_selection'], **audit['defaults']})
            self.assertEqual(report.status_code, 200, report.text)
            self.assertEqual(report.json()['manifest']['source_hash'], audit['source_hash'])

    def test_default_move_cost_is_positive_source_derived_and_symmetric(self):
        audit = source_audit()
        report = optimize(TextileRequest(source_hash=audit['source_hash'], selected_ids=default_selection(audit), **SOURCE_DEFAULTS))
        mapping = report["manifest"]["mapping"]
        policy = report["manifest"]["cost_policy"]
        self.assertEqual(policy["move_cost_mode"], "SOURCE_DERIVED_ONE_MINUTE_PROXY")
        self.assertIsNone(mapping["extra_cost_per_move"])
        self.assertGreater(policy["effective_cost_per_move"], 0)
        self.assertAlmostEqual(policy["effective_cost_per_move"],
            policy["reference_power_kw"] * policy["reference_tariff_per_kwh"] / 60)
        # Same charge applies to B0, B1 and B2, never a special B2 surcharge.
        for code in ("B0", "B1", "B2"):
            cost = report["plans"][code]["cost"]
            self.assertEqual(report["plans"][code]["verification"]["status"], "PASS")
            self.assertAlmostEqual(cost["move_cost"],cost["changed_jobs"]*policy["effective_cost_per_move"])
            self.assertAlmostEqual(cost["total"],cost["electricity"]+cost["move_cost"])
        self.assertIsNotNone(report["plans"]["B2"]["cost"])

    def test_manual_zero_move_cost_is_permitted_for_energy_only_comparison(self):
        req = self.request(solar_enabled=True, extra_cost_per_move=0)
        report = optimize(req)
        self.assertEqual(report["manifest"]["cost_policy"]["move_cost_mode"], "OPERATOR_EXPLICIT")
        self.assertEqual(report["manifest"]["mapping"]["extra_cost_per_move"],0)
        self.assertEqual(report["manifest"]["cost_policy"]["effective_cost_per_move"],0)
        self.assertEqual(report["plans"]["B2"]["cost"]["move_cost"],0)

    def test_solar_surplus_never_creates_grid_credit_or_carries_to_later_slots(self):
        from backend.textile_demo import energy
        import numpy as np
        jobs = [{'id':'J','start':0,'duration':1,'power_kw':[1]}]
        result = energy(jobs, {'J':1}, np.array([10.,10.]), np.array([100.,0.]), 60, 0)
        self.assertEqual(result['solar_kwh'], 0)
        self.assertEqual(result['grid_kwh'], 1)
        self.assertEqual(result['electricity'], 10)

    def test_more_than_eight_selected_rows_run_b1_b2_and_keep_verifier_scope(self):
        self.inp["configuration"]["time_window"] = 32
        self.inp["energy_sources"][0]["price"] = [10] * 8 + [1] * 24
        self.inp["energy_sources"][1]["availability"] = [1000] * 32
        self.out["cell_schedules"][0]["machines"][0]["assignments"] = [
            {"task_mode": "A1", "task": "A", "start": i * 2}
            for i in range(10)
        ]
        self.write()
        rows = source_audit()["rows"]
        report = optimize(self.request(selected_ids=[row["id"] for row in rows], solar_enabled=True))
        self.assertEqual(report["status"], "COMPLETED")
        self.assertEqual(report["solver"]["domain"], "ALL_FEASIBLE_INTEGER_SLOTS")
        self.assertEqual(report["solver"]["status"], "HEURISTIC_FEASIBLE")
        self.assertFalse(report["solver"]["b2_proven_optimal"])
        self.assertEqual(len(report["manifest"]["selected"]), 10)
        for code in ("B0", "B1", "B2"):
            self.assertEqual(report["plans"][code]["verification"]["status"], "PASS")
            self.assertEqual(report["plans"][code]["verification"]["job_count"], 10)
            ledger = report["plans"][code]["cost"]
            self.assertAlmostEqual(ledger["energy_kwh"], ledger["solar_kwh"] + ledger["grid_kwh"])

    def test_b2_coordinated_really_reschedules_multiple_jobs(self):
        self.inp["configuration"]["time_window"] = 26
        self.inp["energy_sources"][0]["price"] = [10] * 26
        self.inp["energy_sources"][1]["availability"] = [0] * 12 + [1000] * 14
        self.out["cell_schedules"][0]["machines"][0]["assignments"] = [
            {"task_mode": "A1", "task": "A", "start": i} for i in range(10)
        ]
        self.write()
        ids = [r["id"] for r in source_audit()["rows"]]
        report = optimize(self.request(selected_ids=ids, solar_enabled=True))
        self.assertEqual(report["solver"]["algorithm"], "SOLAR_AWARE_COORDINATED_LOCAL_SEARCH")
        self.assertEqual(report["solver"]["status"], "HEURISTIC_FEASIBLE")
        self.assertFalse(report["solver"]["b2_proven_optimal"])
        self.assertFalse(report["solver"]["b2_used_fallback"])
        self.assertGreaterEqual(report["solver"]["moves"], 2)
        b1, b2 = report["plans"]["B1"], report["plans"]["B2"]
        self.assertEqual(b1["verification"]["status"], "PASS")
        self.assertEqual(b2["verification"]["status"], "PASS")
        self.assertLess(b2["cost"]["total"], b1["cost"]["total"])
        self.assertGreaterEqual(sum(x["start_slot"] != y["start_slot"]
                                    for x, y in zip(b1["schedule"], b2["schedule"])), 2)
        for plan in (b1, b2):
            cost = plan["cost"]
            self.assertAlmostEqual(cost["energy_kwh"], cost["grid_kwh"] + cost["solar_kwh"])
            self.assertAlmostEqual(cost["total"], sum(cost["series"]["cost"]) + cost["move_cost"])

    def test_b2_can_truthfully_match_b1_when_no_improving_moves_exist(self):
        self.inp["configuration"]["time_window"] = 10
        self.inp["energy_sources"][0]["price"] = [10] * 10
        self.inp["energy_sources"][1]["availability"] = [0] * 10
        self.out["cell_schedules"][0]["machines"][0]["assignments"] = [
            {"task_mode": "A1", "task": "A", "start": i} for i in range(10)
        ]
        self.write()
        ids = [r["id"] for r in source_audit()["rows"]]
        report = optimize(self.request(selected_ids=ids, solar_enabled=True))
        self.assertEqual(report["plans"]["B2"]["verification"]["status"], "PASS")
        self.assertTrue(report["solver"]["b2_used_fallback"])
        self.assertEqual(report["solver"]["moves"], 0)
        self.assertEqual(report["plans"]["B1"]["schedule"], report["plans"]["B2"]["schedule"])
        self.assertFalse(report["solver"]["b2_proven_optimal"])

    def test_no_unit_confirmation_no_calculation(self):
        request = self.request()
        request.confirmed = False
        with self.assertRaises(ValueError):
            optimize(request)

    def test_source_edit_invalidates_old_mapping(self):
        request = self.request()
        self.inp["task_modes"][0]["power"] = [2000]
        self.write()
        with self.assertRaisesRegex(ValueError, "đã đổi"):
            optimize(request)

    def test_ambiguous_or_nonfinite_source_json_is_rejected(self):
        path = self.root / demo_sources.INPUT
        for raw in ('{"machines": [], "machines": []}', '{"value": NaN}'):
            path.write_text(raw, encoding="utf-8")
            with self.assertRaises(ValueError):
                source_audit()

    def test_unknown_mode_cannot_enter_subset(self):
        with self.assertRaises(ValueError):
            optimize(self.request(selected_ids=["c0-m0-a2"]))

    def test_solver_and_independent_ledger_agree(self):
        report = optimize(self.request(extra_cost_per_move=0))
        self.assertEqual(report["status"], "COMPLETED")
        self.assertEqual([report["plans"][code]["cost"]["total"] for code in ("B0", "B1", "B2")], [20, 11, 2])
        self.assertEqual(report["decision"]["kind"], "REVIEW_REQUIRED")
        for plan in report["plans"].values():
            self.assertEqual(plan["verification"]["status"], "PASS")
            self.assertEqual(plan["cost"]["energy_kwh"], 2)
            self.assertAlmostEqual(sum(plan["cost"]["series"]["cost"]) + plan["cost"]["move_cost"], plan["cost"]["total"])

    def test_solar_dispatch_preserves_consumption_and_accounts_grid(self):
        report = optimize(self.request(solar_enabled=True, solar_unit="W", extra_cost_per_move=0))
        best = report["plans"]["B2"]["cost"]
        self.assertEqual(best["total"], 0)
        self.assertEqual(best["energy_kwh"], 2)
        self.assertEqual(best["grid_kwh"], 0)
        self.assertEqual(best["solar_kwh"], 2)

    def test_baseline_precedence_failure_never_exports_cost(self):
        self.inp["constraints"] = [{"type": "Order", "parameter": {"first_task": "B", "second_task": "A"}}]
        self.write()
        report = optimize(self.request())
        self.assertEqual(report["status"], "REPAIRED_WITH_INVALID_BASELINE")
        self.assertFalse(report["baseline_valid"])
        self.assertIsNone(report["plans"]["B0"]["cost"])
        self.assertEqual(report["plans"]["B0"]["verification"]["status"], "FAIL")
        for candidate in ("B1", "B2"):
            self.assertEqual(report["plans"][candidate]["verification"]["status"], "PASS")
            self.assertIsNotNone(report["plans"][candidate]["cost"])
        self.assertEqual(report["decision"]["kind"], "INVALID_ORIGINAL_SCHEDULE")

    def test_duplicate_selection_rejected(self):
        with self.assertRaises(ValueError):
            optimize(self.request(selected_ids=["c0-m0-a0", "c0-m0-a0"]))

    def test_independent_verifier_detects_cross_machine_collision(self):
        jobs = [{"id": "A", "machine": "M1", "release": 0, "due": 10, "duration": 2},
                {"id": "B", "machine": "M2", "release": 0, "due": 10, "duration": 2}]
        result = verify(jobs, {"A": 0, "B": 1}, 10, [], [("A", "B")])
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["issues"][0]["code"], "TASK_COLLISION")
        self.assertEqual(verify(jobs, {"A": 0, "B": 2}, 10, [("A", "B")], [("A", "B")])["status"], "PASS")

    def test_bounds_and_job_coverage_are_independent_checks(self):
        jobs = [{"id": "A", "machine": "M1", "release": 0, "due": 10, "duration": 2}]
        self.assertEqual(verify(jobs, {}, 10, [], [])["status"], "FAIL")
        self.assertEqual(verify(jobs, {"A": -1}, 10, [], [])["status"], "FAIL")


class StudioRouteAndAITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.audit = {"source_hash": "sha256:fixture", "counts": {"total": 275, "known_mode": 108, "compatible": 91}, "warnings": []}
        self.request = ExplainRequest(kind="context", scenario="source", input_hash="sha256:fixture", consent=True)
        self.temp = tempfile.TemporaryDirectory()
        self.cache = patch.object(demo_ai, "CACHE", Path(self.temp.name))
        self.cache.start()

    def tearDown(self):
        self.cache.stop()
        self.temp.cleanup()

    def test_consent_required_before_provider_call(self):
        with patch("backend.demo_ai.chat_json") as call:
            response = self.client.post("/api/demo/studio/ai", json={"kind": "context", "scenario": "source", "consent": False})
            self.assertEqual(response.status_code, 422)
            call.assert_not_called()

    def test_analysis_lock_prevents_overlapping_replay(self):
        analysis_lock.acquire()
        try:
            self.assertEqual(self.client.post("/api/demo/studio/replay", json={}).status_code, 409)
        finally:
            analysis_lock.release()

    def test_ai_cannot_accept_client_fabricated_report(self):
        response = self.client.post("/api/demo/studio/ai", json={"kind": "report", "scenario": "synthetic", "consent": True, "input_hash": "invented"})
        self.assertEqual(response.status_code, 409)

    def test_mismatched_ai_facts_are_rejected(self):
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "test-placeholder"}), patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.chat_json", return_value={"status": "OK", "answer": {"facts": {}, "summary": "Wrong", "findings": [], "next_steps": []}}):
            self.assertEqual(explain(self.request, self.audit)["status"], "EVIDENCE_MISMATCH")

    def test_repeated_ai_request_always_calls_live_provider_never_caches_answer(self):
        facts = demo_ai.facts_for("source", self.audit)
        answer = {"facts": facts, "summary": "Cần kiểm tra chế độ và máy.", "findings": [], "next_steps": []}
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "test-placeholder"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.monotonic", side_effect=[10, 10, 20, 20]), \
             patch("backend.demo_ai.chat_json", return_value={"status": "OK", "answer": answer, "response_id": "provider-gen-id"}) as call:
            first = explain(self.request, self.audit)
            second = explain(self.request, self.audit)
            self.assertFalse(first["cached"])
            self.assertFalse(second["cached"])
            self.assertEqual(first["response_id"], "provider-gen-id")
            self.assertEqual(call.call_count, 2)
            self.assertEqual(demo_ai.calls, 2)
            self.assertEqual(list(Path(self.temp.name).glob("*.json")), [])
            self.assertEqual(call.call_args.kwargs["reasoning_effort"], "low")
            self.assertNotIn("reasoning_enabled", call.call_args.kwargs)
            self.assertEqual(call.call_args.kwargs["max_completion_tokens"], 6000)

    def test_ai_facts_omit_unverified_costs(self):
        synthetic = {
            "input_hash": "sha256:synthetic", "source_type": "SYNTHETIC",
            "decision": {"selected_plan": "B0", "kind": "MEASURE_FIRST"},
            "input_snapshot": {"jobs": [{"id": "J1"}]},
            "plans": {
                "B0": {"cost": {"total_vnd": 100}, "verification": {"status": "PASS"}},
                "B1": {"cost": {"total_vnd": 1}, "verification": {"status": "FAIL"}}
            },
        }
        self.assertEqual(demo_ai.facts_for("synthetic", synthetic)["costs_vnd"], {"B0": 100})
        textile = {
            "input_hash": "sha256:textile", "source_type": "EXTERNAL", "currency": "SOURCE",
            "decision": {"kind": "REVIEW_REQUIRED"}, "manifest": {"selected": [{"id": "op1"}]},
            "plans": {
                "B0": {"cost": {"total": 6}, "verification": {"status": "PASS"}},
                "B1": {"cost": {"total": 0}, "verification": {"status": "FAIL"}},
            },
        }
        self.assertEqual(demo_ai.facts_for("textile", textile)["costs"], {"B0": 6})

    def test_ai_upstream_429_is_failure_not_synthetic_narrative(self):
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "test-placeholder"}), \
             patch("backend.demo_ai.last_call", 0), \
             patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", return_value={
                 "status": "HTTP_ERROR", "http_status": 429, "error_category": "RATE_LIMIT",
                 "rate_limit_scope": "UPSTREAM_PROVIDER", "provider_name": "Google AI Studio"
             }) as provider:
            response = explain(self.request, self.audit)
            self.assertEqual(provider.call_count, 2)
            self.assertEqual([c.kwargs['config']['OPENROUTER_MODEL'] for c in provider.call_args_list],
                             [demo_ai.PRIMARY_MODEL, demo_ai.FALLBACK_MODEL])
            self.assertEqual(response["status"], "HTTP_ERROR")
            self.assertEqual(response["http_status"], 429)
            self.assertEqual(response["rate_limit_scope"], "UPSTREAM_PROVIDER")
            self.assertTrue(response["fallback_used"])
            self.assertEqual(len(response["attempted_models"]), 2)
            self.assertTrue(response["requires_human_review"])
            self.assertNotIn("narrative", response)

    def test_minimax_free_primary_succeeds_without_fallback(self):
        facts = demo_ai.facts_for("source", self.audit)
        answer = {"facts": facts, "summary": "Chỉ dùng số liệu đã kiểm chứng.",
                  "findings": [], "next_steps": []}
        with patch("backend.demo_ai.load_config", return_value={
                 "OPENROUTER_API_KEY": "fake-only", "OPENROUTER_MODEL": "openai/paid-model"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", return_value={"status": "OK", "answer": answer}) as client:
            result = explain(self.request, self.audit)
        self.assertEqual(result["status"], "OK")
        self.assertEqual(result["model"], demo_ai.PRIMARY_MODEL)
        self.assertFalse(result["fallback_used"])
        self.assertEqual(result["attempted_models"], [demo_ai.PRIMARY_MODEL])
        self.assertEqual(client.call_count, 1)
        self.assertTrue(client.call_args.kwargs["free_only"])
        self.assertEqual(client.call_args.kwargs["config"]["OPENROUTER_MODEL"], demo_ai.PRIMARY_MODEL)
        self.assertEqual(result["narrative"]["facts"], facts)

    def test_upstream_429_falls_back_to_xingchen_and_validates_facts(self):
        facts = demo_ai.facts_for("source", self.audit)
        primary_failure = {"status": "HTTP_ERROR", "http_status": 429,
                        "error_category": "RATE_LIMIT", "rate_limit_scope": "UPSTREAM_PROVIDER",
                        "provider_name": "Example upstream"}
        correct = {"status": "OK", "answer": {
            "facts": facts, "summary": "Có thể kiểm tra nguồn dữ liệu.",
            "findings": ["Chưa xác minh ROI thực tế."], "next_steps": []}}
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", side_effect=[primary_failure, correct]) as client:
            result = explain(self.request, self.audit)
            self.assertEqual(demo_ai.calls, 2)
        self.assertEqual(result["status"], "OK")
        self.assertEqual(result["model"], demo_ai.FALLBACK_MODEL)
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["attempted_models"], list(demo_ai.FREE_REPORT_MODELS))
        self.assertEqual(result["narrative"]["facts"], facts)
        self.assertEqual([x.kwargs["config"]["OPENROUTER_MODEL"] for x in client.call_args_list],
                         list(demo_ai.FREE_REPORT_MODELS))
        self.assertTrue(all(x.kwargs["free_only"] for x in client.call_args_list))

    def test_upstream_daily_label_still_uses_free_fallback(self):
        facts = demo_ai.facts_for("source", self.audit)
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", side_effect=[
                 {"status": "HTTP_ERROR", "http_status": 429,
                  "error_category": "DAILY_QUOTA", "rate_limit_scope": "UPSTREAM_PROVIDER"},
                 {"status": "OK", "answer": {"facts": facts, "summary": "Đủ dữ liệu để báo cáo.",
                                           "findings": [], "next_steps": []}}
             ]) as client:
            result = explain(self.request, self.audit)
        self.assertEqual(result["status"], "OK")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["model"], demo_ai.FALLBACK_MODEL)
        self.assertEqual(client.call_count, 2)

    def test_http_404_tries_other_free_model_then_reports_precise_unavailability(self):
        error = {"status": "HTTP_ERROR", "http_status": 404, "error_category": "MODEL_UNAVAILABLE"}
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", side_effect=[error, error]) as request:
            result = explain(self.request, self.audit)
            self.assertEqual(request.call_count, 2)
            self.assertEqual(demo_ai.calls, 2)
        self.assertEqual(result["status"], "HTTP_ERROR")
        self.assertEqual(result["http_status"], 404)
        self.assertEqual(result["error_category"], "MODEL_UNAVAILABLE")
        self.assertEqual(result["attempted_models"], list(demo_ai.FREE_REPORT_MODELS))
        self.assertEqual(result["model"], demo_ai.FALLBACK_MODEL)
        self.assertTrue(result["fallback_used"])
        self.assertTrue(result["free_only"])
        self.assertNotIn("narrative", result)

    def test_invalid_primary_json_falls_back_to_free_provider_and_keeps_verified_facts(self):
        facts = demo_ai.facts_for("source", self.audit)
        primary = {"status": "INVALID_RESPONSE", "error_category": "MALFORMED_JSON",
                   "finish_reason": "stop", "served_model": demo_ai.PRIMARY_MODEL}
        # New contract: the provider writes only prose; facts are injected by backend.
        backup = {"status": "OK", "answer": {
            "summary": "Nguồn có 91 dòng tương thích.",
            "findings": ["Chưa xác minh các điều kiện ngoài nguồn."],
            "next_steps": ["Xác nhận máy và chế độ trước khi dùng lịch."]},
            "response_id": "live-provider-id", "served_model": demo_ai.FALLBACK_MODEL}
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", side_effect=[primary, backup]) as client:
            result = explain(self.request, self.audit)
        self.assertEqual(result["status"], "OK")
        self.assertFalse(result["cached"])
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["narrative"]["facts"], facts)
        self.assertEqual(result["response_id"], "live-provider-id")
        self.assertEqual(result["primary_failure"]["error_category"], "MALFORMED_JSON")
        self.assertEqual(client.call_count, 2)
        self.assertTrue(all(c.kwargs["free_only"] for c in client.call_args_list))

    def test_both_invalid_free_provider_responses_fail_closed_with_specific_error(self):
        response = {"status": "INVALID_RESPONSE", "error_category": "OUTPUT_TRUNCATED",
                    "finish_reason": "length", "response_id": "sample-request"}
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", return_value=response) as client:
            result = explain(self.request, self.audit)
        self.assertEqual(client.call_count, 2)
        self.assertEqual(result["status"], "INVALID_RESPONSE")
        self.assertEqual(result["error_category"], "OUTPUT_TRUNCATED")
        self.assertEqual(result["attempted_models"], list(demo_ai.FREE_REPORT_MODELS))
        self.assertNotIn("narrative", result)

    def test_account_quota_and_auth_do_not_waste_fallback(self):
        errors = [
            {"status": "HTTP_ERROR", "http_status": 429, "error_category": "DAILY_QUOTA",
             "rate_limit_scope": "OPENROUTER_ACCOUNT"},
            {"status": "HTTP_ERROR", "http_status": 401, "error_category": "AUTH"},
            {"status": "HTTP_ERROR", "http_status": 402, "error_category": "CREDITS"},
        ]
        for response in errors:
            with self.subTest(response=response), \
                 patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
                 patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
                 patch("backend.demo_ai.chat_json", return_value=response) as client:
                result = explain(self.request, self.audit)
                self.assertEqual(result["status"], response["status"])
                self.assertFalse(result["fallback_used"])
                self.assertEqual(client.call_count, 1)

    def test_fallback_keeps_budget_and_evidence_mismatch_blocking(self):
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", demo_ai.BUDGET - 1), \
             patch("backend.demo_ai.chat_json", return_value={
                 "status": "HTTP_ERROR", "http_status": 429, "error_category": "RATE_LIMIT",
                 "rate_limit_scope": "UPSTREAM_PROVIDER"}) as client:
            result = explain(self.request, self.audit)
            self.assertEqual(client.call_count, 1)
            self.assertEqual(demo_ai.calls, demo_ai.BUDGET)
            self.assertFalse(result["fallback_used"])
        with patch("backend.demo_ai.load_config", return_value={"OPENROUTER_API_KEY": "fake-only"}), \
             patch("backend.demo_ai.last_call", 0), patch("backend.demo_ai.calls", 0), \
             patch("backend.demo_ai.chat_json", side_effect=[
                 {"status": "HTTP_ERROR", "http_status": 503, "error_category": "PROVIDER_ERROR"},
                 {"status": "OK", "answer": {
                     "facts": {}, "summary": "Sai bằng chứng", "findings": [], "next_steps": []}}
             ]) as client:
            result = explain(self.request, self.audit)
            self.assertEqual(client.call_count, 2)
            self.assertEqual(result["status"], "EVIDENCE_MISMATCH")
            self.assertNotIn("narrative", result)

    def test_free_diagnostics_reads_catalog_without_ai_generation(self):
        inventory = {"status": "OK", "models": [
            {"model": demo_ai.PRIMARY_MODEL, "endpoints": 0, "status": "NO_ENDPOINTS"},
            {"model": demo_ai.FALLBACK_MODEL, "endpoints": 0, "status": "NO_ENDPOINTS"}]}
        with patch("backend.demo_routes.free_report_endpoint_status", return_value=inventory), \
             patch("backend.demo_routes.account_free_limits", return_value={
                 "status": "OK", "free_model_daily_requests": {
                     "used": 0, "remaining": 1000, "limit": 1000}}), \
             patch("backend.demo_routes.explain") as ai:
            result = self.client.get("/api/demo/studio/ai/diagnostics")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["free_endpoints"], inventory)
        self.assertEqual(result.json()["account"]["free_model_daily_requests"]["remaining"], 1000)
        ai.assert_not_called()

    def test_private_files_remain_private(self):
        for path in ("/.env", "/S-I-JSP.zip", "/Input_JSON_Schedule_Optimization.json"):
            self.assertEqual(self.client.get(path).status_code, 404)



class ManualSchedulingAndContextTests(unittest.TestCase):
    """A manual proposal never mutates the original report and never prices a FAIL."""

    def test_manual_textile_pass_fail_and_report_context(self):
        from backend.demo_manual import ManualRequest, preview_manual
        from backend.demo_context_report import build_context_report
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        with patch.object(demo_sources, "ROOT", root):
            inp = {"task_modes": [{"id": "A1", "power": [1000]}, {"id": "B1", "power": [1000]}],
                   "machines": [{"id": "M1", "task_modes": ["A1", "B1"]}],
                   "tasks": ["A", "B"], "constraints": [], "configuration": {"time_window": 6},
                   "energy_sources": [{"id": "grid", "price": [10,10,1,1,1,1]}]}
            out = {"cell_schedules": [{"machines": [{"machine": "M1", "assignments": [
                    {"task_mode": "A1", "task": "A", "start": 0},
                    {"task_mode": "B1", "task": "B", "start": 1}]}]}]}
            (root / demo_sources.INPUT).write_text(json.dumps(inp), encoding="utf-8")
            (root / demo_sources.OUTPUT).write_text(json.dumps(out), encoding="utf-8")
            mapping = TextileRequest(source_hash=source_audit()["source_hash"], step_minutes=60,
                                     power_unit="W", price_basis="kWh", currency="SOURCE",
                                     confirmed=True, subset_acknowledged=True)
            report = optimize(mapping)
            self.assertEqual(report["status"], "COMPLETED")
            from backend.textile_demo import prepare
            rebuilt = TextileRequest.model_validate(report["manifest"]["mapping"])
            self.assertEqual(prepare(rebuilt)[-1], report["input_hash"], "A stored mapping must reproduce the original schedule hash")
            self.assertIsNone(report["manifest"]["mapping"]["extra_cost_per_move"])
            self.assertGreaterEqual(report["manifest"]["cost_policy"]["effective_cost_per_move"], 0.0)
            before = json.dumps(report, sort_keys=True)
            request = ManualRequest(input_hash=report["input_hash"], base_plan="B0",
                                    moves=[{"job_id": "c0-m0-a0", "machine_id": "M1", "start_slot": 2}])
            moved = preview_manual(request, report)
            self.assertEqual(moved["status"], "PASS")
            self.assertEqual(moved["updated_report"]["plans"]["MANUAL"]["verification"]["status"], "PASS")
            self.assertEqual(moved["updated_report"]["decision"]["kind"], "REVIEW_REQUIRED")
            self.assertNotEqual(moved["updated_report"]["input_hash"], report["input_hash"])
            self.assertEqual(before, json.dumps(report, sort_keys=True))
            invalid = preview_manual(ManualRequest(input_hash=report["input_hash"], base_plan="B0",
                            moves=[{"job_id": "c0-m0-a0", "machine_id": "M1", "start_slot": 1}]), report)
            self.assertEqual(invalid["status"], "FAIL")
            self.assertIsNone(invalid["candidate"]["cost"])
            self.assertIsNone(invalid["comparison"]["draft_cost"])
            self.assertNotIn("updated_report", invalid)
            context = build_context_report(report, "ca đêm thiếu công nhân và nguyên liệu")
            self.assertEqual(context["status"], "REVIEW_REQUIRED")
            self.assertFalse(context["engine_constraints_added"])
            self.assertTrue({"STAFFING", "INVENTORY"}.issubset({x["code"] for x in context["constraint_indicators"]}))
            with self.assertRaises(ValueError):
                preview_manual(ManualRequest(input_hash="sha256:stale", base_plan="B0",
                            moves=[{"job_id": "c0-m0-a0", "machine_id": "M1", "start_slot": 2}]), report)
        temp.cleanup()

    def test_manual_native_shift_and_verifier(self):
        from backend.demo_manual import ManualRequest, preview_manual
        from backend.analysis import analyze
        source = json.loads((Path(__file__).resolve().parents[1] / "fixtures/editable_cell.json").read_text(encoding="utf-8"))
        report = analyze(source, max_candidates=2000)
        report["input_snapshot"] = source
        self.assertEqual(report["status"], "COMPLETED")
        move = next((r for r in report["plans"]["B1"]["changes"]), None)
        self.assertIsNotNone(move)
        from datetime import datetime
        base_time = datetime.fromisoformat(source["horizon"]["start"])
        slot = int((datetime.fromisoformat(move["to"]["start"]) - base_time).total_seconds() / 1800)
        candidate = preview_manual(ManualRequest(input_hash=report["input_hash"], base_plan="B0",
                          moves=[{"job_id": move["job_id"], "machine_id": move["to"]["machine_id"],
                                  "start_slot": slot}]), report)
        self.assertEqual(candidate["status"], "PASS")
        self.assertEqual(candidate["comparison"]["draft_cost"], report["plans"]["B1"]["cost"]["total_vnd"])
        self.assertEqual(candidate["comparison"]["saving_vs_b0"], report["comparison"]["saving_vnd"])


    def test_manual_cross_machine_duration_and_invalid_cost(self):
        from backend.demo_manual import ManualRequest, preview_manual
        from backend.analysis import analyze
        from datetime import datetime, timedelta
        source = json.loads((Path(__file__).resolve().parents[1] / "fixtures/editable_cell.json").read_text(encoding="utf-8"))
        report = analyze(source, max_candidates=2000)
        report["input_snapshot"] = source
        original = json.dumps(report, sort_keys=True)
        horizon_start = datetime.fromisoformat(source["horizon"]["start"])
        j4 = next(j for j in source["jobs"] if j["id"] == "J4")
        self.assertNotEqual(j4["eligible"]["M2"]["duration_min"], j4["eligible"]["M3"]["duration_min"])
        # Late evening on M3 avoids the declared M3 runs. Duration must come from M3, not M2.
        result = preview_manual(ManualRequest(input_hash=report["input_hash"], base_plan="B0",
            moves=[{"job_id": "J4", "machine_id": "M3", "start_slot": 40}]), report)
        self.assertEqual(result["status"], "PASS", result["verification"])
        new_j4 = next(j for j in result["updated_report"]["plans"]["MANUAL"]["verification"]["jobs"] if j["job_id"] == "J4")
        self.assertEqual(datetime.fromisoformat(new_j4["start"]), horizon_start + timedelta(minutes=1200))
        self.assertEqual((datetime.fromisoformat(new_j4["end"]) - datetime.fromisoformat(new_j4["start"])).total_seconds()/60, 135)
        self.assertIsNotNone(result["comparison"]["draft_cost"])
        self.assertEqual(result["updated_report"]["manual_review"]["status"], "NEEDS_HUMAN_REVIEW")
        # A collision must be FAIL with no fabricated cost, even though the machine itself is eligible.
        invalid = preview_manual(ManualRequest(input_hash=report["input_hash"], base_plan="B0",
            moves=[{"job_id": "J4", "machine_id": "M1", "start_slot": 24}]), report)
        self.assertEqual(invalid["status"], "FAIL")
        self.assertIsNone(invalid["comparison"]["draft_cost"])
        self.assertIsNone(invalid["candidate"]["cost"])
        self.assertNotIn("updated_report", invalid)
        self.assertEqual(json.dumps(report, sort_keys=True), original)

if __name__ == "__main__":
    unittest.main()
