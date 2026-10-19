"""Conservative scope triage tests for multi-industry intake."""
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic, sleep

from backend.context_scope import inspect_scope
from backend.assistant import AssistantService
from backend.team import TeamService
from backend.tests.test_b1_policy import small_fixture


class ScopeTriageTests(unittest.TestCase):
    def test_known_unmodeled_operations_produce_review_alerts(self):
        cases = {
            "PRECEDENCE": "Công đoạn may phải xong trước khi đóng gói.",
            "STAFFING": "Ca này thiếu ba công nhân.",
            "INVENTORY": "Nguyên liệu chỉ về kho lúc 13h.",
            "TRANSPORT": "Cần xếp thêm xe tải đi giao.",
            "PREEMPTION": "Cho phép chia nhỏ lô J1.",
            "MULTI_MACHINE": "Một lô cần hai máy cùng lúc.",
        }
        for code, description in cases.items():
            with self.subTest(code=code):
                report = inspect_scope(description)
                self.assertEqual(report["status"], "REVIEW_REQUIRED")
                self.assertIn(code, {f["code"] for f in report["indicators"]})
                self.assertFalse(report["engine_constraints_added"])

    def test_no_keyword_does_not_mean_verified_supported(self):
        info = inspect_scope("Gia công cơ khí theo đơn hàng, sản xuất chính xác.")
        self.assertEqual(info["status"], "NOT_ASSESSED")
        self.assertIn("KHÔNG", info["scope_disclaimer"])
        self.assertEqual(info["indicators"], [])
        one_step = inspect_scope("Xưởng may một công đoạn, máy M1 chạy liên tục.")
        self.assertEqual(one_step["status"], "NOT_ASSESSED")

    def test_single_record_exposes_scope_trace_in_intent_and_csv(self):
        with TemporaryDirectory() as folder:
            team = TeamService(Path(folder) / "scope.sqlite3")
            owner = team.create_workspace()["workspace_token"]
            requests = []

            def client(messages, **kwargs):
                evidence = json.loads(messages[1]["content"])
                requests.append(evidence)
                if "csv_source" in evidence:
                    heads = evidence["csv_source"]["headers"]
                    mapping = ["job_id", "template_id", "quantity", "machine_id", "start", "release", "due"]
                    answer = {"summary": "Cần xác minh trước khi nhập.", "columns":
                              [{"column_index": i, "field": mapping[i], "rationale": "Tên cột dự kiến"}
                               for i in range(len(heads))],
                              "issues": [], "questions": ["Đơn hàng nhiều công đoạn có thuộc mô hình không?"]}
                else:
                    answer = {"summary": "Chờ kỹ sư xác nhận.",
                              "observations": [], "questions": ["Công đoạn trước–sau có bắt buộc không?"],
                              "next_steps": ["Rà soát ràng buộc chưa hỗ trợ."]}
                return {"status": "OK", "answer": answer, "response_id": "test-id",
                        "served_model": "local-test", "finish_reason": "stop"}

            service = AssistantService(team, client=client, config_loader=lambda: {
                "OPENROUTER_API_KEY": "synthetic-placeholder", "OPENROUTER_MODEL": "test"})
            try:
                cases = [
                    {"snapshot": small_fixture(), "message": "Cần đổi lịch theo tình huống máy hỏng.",
                     "work_context": "Có công đoạn may rồi đóng gói.", "consent": True},
                    {"kind": "CSV", "snapshot": small_fixture(),
                     "raw_text": "Work,Route,Count,Press,Launch,Ready,Deadline\nJ1,,,,,,\n",
                     "message": "Chọn đúng tên cột.", "work_context": "Doanh nghiệp có tồn kho nguyên liệu.",
                     "consent": True},
                ]
                for index, request in enumerate(cases):
                    response = service.submit(owner, request)
                    end = monotonic() + 5
                    while monotonic() < end:
                        rec = service.get(owner, response["id"])
                        if rec["status"] not in ("QUEUED", "RUNNING"):
                            break
                        sleep(.01)
                    self.assertEqual(rec["status"], "AWAITING_REVIEW")
                    self.assertEqual(rec["scope_review"]["status"], "REVIEW_REQUIRED")
                    self.assertFalse(rec["scope_review"]["engine_constraints_added"])
                    self.assertNotIn("work_context", rec["input_snapshot"])
                    self.assertEqual(rec["scope_review"], requests[index]["scope_review"])
            finally:
                service.close()
                team.close()


if __name__ == "__main__":
    unittest.main()
