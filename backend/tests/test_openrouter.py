import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from backend.evaluate_openrouter import score
from backend.openrouter import chat_json, load_config, free_report_endpoint_status, REPORT_FREE_MODELS


class OpenRouterTests(unittest.TestCase):
    def test_structured_output_requests_supported_endpoints_and_keeps_local_validation(self):
        payload={"choices":[{"message":{"content":"{}"},"finish_reason":"stop"}]}
        schema={"type":"object","properties":{},"additionalProperties":False}
        with patch("urllib.request.urlopen",return_value=io.BytesIO(json.dumps(payload).encode())) as request:
            chat_json([],config={"OPENROUTER_API_KEY":"fake-only","OPENROUTER_MODEL":"test"},response_schema=schema)
            sent=json.loads(request.call_args.args[0].data)
            self.assertEqual(sent["response_format"]["json_schema"]["schema"],schema)
            self.assertTrue(sent["provider"]["require_parameters"])

    def test_exact_json_fence_accepted_but_embedded_prose_rejected(self):
        for content,expected in [('```json\n{"summary":"ok"}\n```','OK'),('Here is a guess: {"summary":"ok"}','INVALID_RESPONSE')]:
            payload={"choices":[{"message":{"content":content},"finish_reason":"stop"}]}
            with patch("urllib.request.urlopen",return_value=io.BytesIO(json.dumps(payload).encode())):
                result=chat_json([],config={"OPENROUTER_API_KEY":"fake-only","OPENROUTER_MODEL":"test"})
                self.assertEqual(result["status"],expected)

    def test_assistant_can_bound_output_and_disable_reasoning_without_changing_defaults(self):
        payload={"choices":[{"message":{"content":"{}"},"finish_reason":"stop"}]}
        with patch("urllib.request.urlopen",return_value=io.BytesIO(json.dumps(payload).encode())) as request:
            chat_json([],config={"OPENROUTER_API_KEY":"fake-only","OPENROUTER_MODEL":"test"},max_completion_tokens=4000,reasoning_enabled=False)
            sent=json.loads(request.call_args.args[0].data)
            self.assertEqual(sent["max_completion_tokens"],4000)
            self.assertEqual(sent["reasoning"],{"enabled":False,"exclude":True})
        with self.assertRaises(ValueError):chat_json([],max_completion_tokens=999999)

    def test_mandatory_reasoning_accepts_bounded_effort_without_disabling_it(self):
        payload = {"choices": [{"message": {"content": "{}"}}]}
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(payload).encode())) as network:
            result = chat_json([], config={"OPENROUTER_API_KEY": "fake", "OPENROUTER_MODEL": REPORT_FREE_MODELS[0]},
                               free_only=True, reasoning_effort="low", max_completion_tokens=6000)
            self.assertEqual(result["status"], "OK")
            sent = json.loads(network.call_args.args[0].data)
            self.assertEqual(sent["reasoning"], {"effort": "low", "exclude": True})
            self.assertNotIn("enabled", sent["reasoning"])
        with self.assertRaises(ValueError):
            chat_json([], config={"OPENROUTER_API_KEY": "fake", "OPENROUTER_MODEL": "test"},
                      reasoning_enabled=False, reasoning_effort="low")

    def test_report_free_only_caps_all_provider_prices_and_blocks_paid_config(self):
        self.assertEqual(REPORT_FREE_MODELS,
                         ("minimax/minimax-m3.1-flash:free", "xingchen-agi/xing4.0-29b-a4b:free"))
        payload = {"choices": [{"message": {"content": "{}"}}]}
        for free_model in REPORT_FREE_MODELS:
            with patch("urllib.request.urlopen",
                       return_value=io.BytesIO(json.dumps(payload).encode())) as network:
                result = chat_json([], config={"OPENROUTER_API_KEY": "fake",
                                               "OPENROUTER_MODEL": free_model},
                                   free_only=True, reasoning_enabled=False)
                self.assertEqual(result["status"], "OK")
                sent = json.loads(network.call_args.args[0].data)
                self.assertEqual(sent["model"], free_model)
                self.assertEqual(sent["provider"]["max_price"],
                                 {"prompt": 0, "completion": 0, "request": 0})
                self.assertTrue(sent["provider"]["require_parameters"])
                self.assertEqual(sent["reasoning"], {"enabled": False, "exclude": True})
                self.assertNotIn("models", sent)
        for not_free in ("minimax/minimax-m3.1-flash", "xingchen-agi/xing4.0-29b-a4b",
                         "qwen/qwen3.8-27b:free", "nvidia/nemotron-3-nano-30b-a3b:free",
                         "openrouter/auto", "openai/gpt-5"):
            with patch("urllib.request.urlopen") as network:
                result = chat_json([], config={"OPENROUTER_API_KEY": "fake",
                                               "OPENROUTER_MODEL": not_free}, free_only=True)
                self.assertEqual(result["status"], "FREE_MODEL_REQUIRED")
                network.assert_not_called()

    def test_free_endpoint_catalog_is_read_only_and_reveals_no_available_hosts(self):
        catalog = {"data": {"endpoints": []}}
        with patch("urllib.request.urlopen",
                   side_effect=lambda *a, **kw: io.BytesIO(json.dumps(catalog).encode())) as get:
            report = free_report_endpoint_status()
        self.assertEqual(report["status"], "OK")
        self.assertEqual([x["model"] for x in report["models"]], list(REPORT_FREE_MODELS))
        self.assertEqual([x["status"] for x in report["models"]], ["NO_ENDPOINTS", "NO_ENDPOINTS"])
        self.assertEqual([x["endpoints"] for x in report["models"]], [0, 0])
        self.assertEqual(get.call_count, 2)
        for call in get.call_args_list:
            self.assertEqual(len(call.args), 1)
            self.assertTrue(call.args[0].endswith("/endpoints"))
        with patch("urllib.request.urlopen", side_effect=URLError("temporary catalog offline")):
            missing = free_report_endpoint_status()
        self.assertEqual([x["status"] for x in missing["models"]], ["UNKNOWN", "UNKNOWN"])
        self.assertEqual([x["endpoints"] for x in missing["models"]], [None, None])

    def test_http_404_is_endpoint_unavailable_not_account_quota(self):
        err = HTTPError("https://openrouter.ai/api/v1/chat/completions", 404, "not found", {},
                        io.BytesIO(b'{"error":{"message":"No matching model endpoints"}}'))
        with patch("urllib.request.urlopen", side_effect=err):
            result = chat_json([], config={"OPENROUTER_API_KEY": "fake",
                                            "OPENROUTER_MODEL": REPORT_FREE_MODELS[0]}, free_only=True)
        self.assertEqual(result["status"], "HTTP_ERROR")
        self.assertEqual(result["http_status"], 404)
        self.assertEqual(result["error_category"], "MODEL_UNAVAILABLE")
        self.assertNotIn("No matching model endpoints", json.dumps(result))

    def test_missing_config_does_not_call_network(self):
        with patch("urllib.request.urlopen") as request:
            self.assertEqual(chat_json([], config={})["status"], "CONFIG_MISSING")
            request.assert_not_called()

    def test_dotenv_parses_only_known_keys_and_env_overrides(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            path.write_text('# comment\nOPENROUTER_API_KEY="test-only"\nOPENROUTER_MODEL=sample-model\nOTHER=value\n', encoding="utf-8")
            with patch.dict(os.environ, {}, clear=True):
                config = load_config(path)
                self.assertEqual(config, {"OPENROUTER_API_KEY": "test-only", "OPENROUTER_MODEL": "sample-model"})
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "override"}, clear=True):
                self.assertEqual(load_config(path)["OPENROUTER_API_KEY"], "override")

    def test_success_usage_without_reasoning_text(self):
        payload = {"choices": [{"message": {"content": '{"decision":"CHANGE"}', "reasoning": "private reasoning"}, "finish_reason": "stop"}],
                   "usage": {"total_tokens": 100}, "model": "sample", "id": "sample-id"}
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(payload).encode())) as request:
            result = chat_json([{"role": "user", "content": "synthetic evidence"}], config={"OPENROUTER_API_KEY": "test-secret", "OPENROUTER_MODEL": "sample"})
            self.assertEqual(result["status"], "OK")
            self.assertEqual(result["usage"]["total_tokens"], 100)
            self.assertNotIn("private reasoning", json.dumps(result))
            self.assertNotIn("test-secret", request.call_args.args[0].data.decode())

    def test_http_error_body_is_not_exposed(self):
        error = HTTPError("https://openrouter.ai/api/v1/chat/completions", 401, "error", {}, io.BytesIO(b"sensitive diagnostics"))
        with patch("urllib.request.urlopen", side_effect=error):
            result = chat_json([], config={"OPENROUTER_API_KEY": "test-secret", "OPENROUTER_MODEL": "sample"})
        self.assertEqual(result["http_status"], 401)
        self.assertNotIn("sensitive", json.dumps(result))
        self.assertNotIn("test-secret", json.dumps(result))

    def test_transport_error_is_sanitized(self):
        with patch("urllib.request.urlopen", side_effect=URLError("test-secret")):
            result = chat_json([], config={"OPENROUTER_API_KEY": "test-secret", "OPENROUTER_MODEL": "sample"})
        self.assertEqual(result["status"], "TRANSPORT_ERROR")
        self.assertNotIn("test-secret", json.dumps(result))

    def test_upstream_shared_pool_429_keeps_safe_diagnostic_fields(self):
        body = {"error": {"message": "Provider returned error", "code": 429, "metadata": {
            "limit_source": "upstream_provider_shared_pool", "provider_name": "Google AI Studio",
            "raw": "model is temporarily rate-limited upstream; private test-secret",
            "remedy_hint": "private diagnostics test-secret"}}}
        error = HTTPError("https://openrouter.ai/api/v1/chat/completions", 429, "error", {}, io.BytesIO(json.dumps(body).encode()))
        with patch("urllib.request.urlopen", side_effect=error):
            result = chat_json([], config={"OPENROUTER_API_KEY": "test-secret", "OPENROUTER_MODEL": "sample"})
        self.assertEqual(result["limit_source"], "upstream_provider_shared_pool")
        self.assertEqual(result["provider_name"], "Google AI Studio")
        self.assertEqual(result["rate_limit_scope"], "UPSTREAM_PROVIDER")
        self.assertNotIn("test-secret", json.dumps(result))
        self.assertNotIn("private diagnostics", json.dumps(result))

    def test_invalid_provider_responses_are_classified_without_exposing_raw_content(self):
        samples = [
            ("", "stop", "EMPTY_CONTENT"),
            (None, "length", "OUTPUT_TRUNCATED"),
            ('{"summary":', "length", "OUTPUT_TRUNCATED"),
            ("broken secret private-output", "stop", "MALFORMED_JSON"),
            ("[]", "stop", "NON_OBJECT_JSON"),
        ]
        for body, finish_reason, category in samples:
            with self.subTest(category=category):
                payload = {"id": "provider-123", "choices": [
                    {"message": {"content": body}, "finish_reason": finish_reason}]}
                with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(payload).encode())):
                    result = chat_json([], config={"OPENROUTER_API_KEY": "fake", "OPENROUTER_MODEL": "sample"})
                self.assertEqual(result["status"], "INVALID_RESPONSE")
                self.assertEqual(result["error_category"], category)
                self.assertEqual(result["finish_reason"], finish_reason)
                self.assertEqual(result["response_id"], "provider-123")
                self.assertNotIn("private-output", json.dumps(result))

    def test_invalid_json_answer_fails_closed(self):
        with patch("urllib.request.urlopen", return_value=io.BytesIO(b'{"choices":[{"message":{"content":"not JSON"}}]}')):
            result = chat_json([], config={"OPENROUTER_API_KEY": "test-secret", "OPENROUTER_MODEL": "sample"})
        self.assertEqual(result["status"], "INVALID_RESPONSE")

    def test_invalid_answer_preserves_usage_but_not_raw_text(self):
        payload = {"model": "sample", "usage": {"total_tokens": 99}, "choices": [{"message": {"content": "bad-format-private-text"}, "finish_reason": "length"}]}
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(payload).encode())):
            result = chat_json([], config={"OPENROUTER_API_KEY": "test-secret", "OPENROUTER_MODEL": "sample"})
        self.assertEqual(result["status"], "INVALID_RESPONSE")
        self.assertEqual(result["usage"]["total_tokens"], 99)
        self.assertEqual(result["finish_reason"], "length")
        self.assertNotIn("bad-format-private-text", json.dumps(result))

    def test_exact_grade_rejects_bool_for_integer_and_extra_fields(self):
        evidence = {"status": "COMPLETED", "saving_vnd": 1, "excluded_costs": ["LABOR_OVERTIME"], "observed_factory_roi": False}
        answer = {k: v for k, v in evidence.items() if k != "status"}
        self.assertTrue(score(answer, evidence)["exact_all_fields"])
        answer["saving_vnd"] = True
        self.assertFalse(score(answer, evidence)["exact_all_fields"])
        answer["saving_vnd"] = 1
        answer["invented"] = "unsupported"
        self.assertFalse(score(answer, evidence)["exact_all_fields"])

    def test_exclusions_cannot_be_omitted_or_duplicated(self):
        evidence = {"status": "COMPLETED", "excluded_costs": ["LABOR_OVERTIME", "IDLE_ENERGY"]}
        self.assertTrue(score({"excluded_costs": list(reversed(evidence["excluded_costs"]))}, evidence)["exact_all_fields"])
        self.assertFalse(score({"excluded_costs": ["LABOR_OVERTIME", "LABOR_OVERTIME"]}, evidence)["exact_all_fields"])


if __name__ == "__main__":
    unittest.main()
