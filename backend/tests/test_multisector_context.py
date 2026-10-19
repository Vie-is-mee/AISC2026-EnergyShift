"""Context compatibility checks: no solver mutation, review hashes are context-bound."""
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic, sleep

from pydantic import ValidationError
from backend.assistant import AssistantService
from backend.team import TeamService
from backend.tests.test_b1_policy import small_fixture


class WorkContextTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.team = TeamService(Path(self.tmp.name) / "checks.sqlite3")
        self.owner = self.team.create_workspace()["workspace_token"]
        self.sent = []

        def fake_client(messages, **kwargs):
            self.sent.append(json.loads(messages[1]["content"]))
            if "csv_source" in self.sent[-1]:
                headers = self.sent[-1]["csv_source"]["headers"]
                mapping = ("job_id", "template_id", "quantity", "machine_id", "start", "release", "due")
                answer = {"summary": "Bảng cần kỹ sư rà soát.",
                          "columns": [{"column_index": i, "field": target, "rationale": "Kiểm tra tiêu đề và hồ sơ"}
                                      for i, target in enumerate(mapping[:len(headers)])],
                          "issues": [], "questions": ["Có điều kiện đặc thù nào chưa hỗ trợ không?"]}
            else:
                answer = {"summary": "Đọc mô tả cơ sở.", "observations": [],
                          "questions": ["Có trình tự nhiều công đoạn cần kiểm tra không?"],
                          "next_steps": ["Kỹ sư xác nhận phạm vi ràng buộc."]}
            return {"status": "OK", "answer": answer, "response_id": "local-test",
                    "served_model": "mock", "finish_reason": "stop"}

        self.service = AssistantService(self.team, client=fake_client,
                                        config_loader=lambda: {"OPENROUTER_API_KEY": "placeholder-value", "OPENROUTER_MODEL": "mock"})

    def tearDown(self):
        self.service.close()
        self.team.close()
        self.tmp.cleanup()

    def wait(self, record):
        end = monotonic() + 6
        while monotonic() < end:
            obj = self.service.get(self.owner, record["id"])
            if obj["status"] not in ("QUEUED", "RUNNING"):
                return obj
            sleep(.01)
        self.fail("AI request timed out")

    def test_intent_context_is_recorded_and_does_not_become_solver_data(self):
        fixture = small_fixture()
        first = self.wait(self.service.submit(self.owner, {
            "snapshot": fixture, "message": "Máy M1 không sẵn sàng sau 15 giờ.",
            "work_context": "Xưởng dệt may một công đoạn; có yêu cầu thứ tự chưa mô hình hóa.",
            "consent": True}))
        self.assertEqual(first["status"], "AWAITING_REVIEW")
        self.assertIn("multi-stage precedence/routing", self.sent[-1]["solver_scope"]["not_modeled"])
        self.assertEqual(self.sent[-1]["work_context"], first["work_context"])
        self.assertNotIn("work_context", first["input_snapshot"])
        other = self.wait(self.service.submit(self.owner, {
            "snapshot": fixture, "message": "Máy M1 không sẵn sàng sau 15 giờ.",
            "work_context": "Xưởng nhựa, cùng lịch nhưng ngữ cảnh khác.", "consent": True}))
        self.assertEqual(first["input_hash"], other["input_hash"])
        self.assertNotEqual(first["request_hash"], other["request_hash"])
        with self.assertRaises(ValidationError):
            self.service.submit(self.owner, {
                "snapshot": fixture, "message": "Máy M1 không sẵn sàng sau 15 giờ.",
                "work_context": "a" * 1201, "consent": True})

    def test_csv_receives_same_context_without_sending_tarrifs(self):
        fixture = small_fixture()
        record = self.wait(self.service.submit(self.owner, {
            "kind": "CSV", "snapshot": fixture,
            "raw_text": "Work,Route,Count,Press,Launch,Ready,Deadline\nJ1,,,,,,\n",
            "message": "Giữ dữ liệu gốc.", "work_context": "Công việc lắp ráp từng lô",
            "consent": True}))
        self.assertEqual(record["status"], "AWAITING_REVIEW")
        evidence = self.sent[-1]
        self.assertEqual(evidence["work_context"], "Công việc lắp ráp từng lô")
        self.assertNotIn("tariff", evidence["profile"])
        self.assertIn("solver_scope", evidence)
        self.assertEqual(record["input_snapshot"]["metadata"]["source_type"], fixture["metadata"]["source_type"])
        self.assertNotIn("work_context", record["input_snapshot"])


if __name__ == "__main__":
    unittest.main()
