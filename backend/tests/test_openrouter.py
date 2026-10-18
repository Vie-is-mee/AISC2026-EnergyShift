import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from backend.evaluate_openrouter import score
from backend.openrouter import chat_json, load_config


class OpenRouterTests(unittest.TestCase):
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
