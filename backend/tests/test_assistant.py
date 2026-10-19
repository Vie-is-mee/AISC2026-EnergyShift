from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event
from time import monotonic, sleep
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend.app import app
from backend.assistant import AssistantService
from backend.team import TeamService, TeamError
from backend.tests.test_b1_policy import small_fixture


def answer():
    return {"summary":"Bạn muốn rà soát lịch bảo trì M1.","observations":[{"text":"Lô J1 có trong kế hoạch giả lập.","source":"SNAPSHOT","job_ids":["J1"]}],"questions":["Bạn xác nhận ngày và giờ bảo trì nào?"],"next_steps":["Kỹ sư xác nhận thời gian trước khi đổi lịch."]}


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.directory=TemporaryDirectory()
        self.team=TeamService(Path(self.directory.name)/"private.sqlite3")
        self.token=self.team.create_workspace()["workspace_token"]
        self.other=self.team.create_workspace()["workspace_token"]
        self.calls=[]
        self.release=Event();self.release.set();self.entered=Event()
        self.response={"status":"OK","answer":answer(),"response_id":"provider-test-only","served_model":"test-model","latency_seconds":.01,"usage":{"total_tokens":12,"private":"do not store"}}
        def client(messages,**kwargs):
            self.calls.append(messages);self.entered.set();self.release.wait(5)
            return deepcopy(self.response)
        self.service=AssistantService(self.team,client=client,config_loader=lambda:{"OPENROUTER_API_KEY":"fake-secret-only","OPENROUTER_MODEL":"test"})
        self.raw={"snapshot":small_fixture(),"message":"M1 bảo trì; hãy hỏi thông tin còn thiếu.","consent":True}

    def tearDown(self):
        self.release.set();self.service.close();self.team.close();self.directory.cleanup()

    def done(self,ident):
        end=monotonic()+6
        while monotonic()<end:
            value=self.service.get(self.token,ident)
            if value["status"] not in ("QUEUED","RUNNING"):return value
            sleep(.01)
        self.fail("AI intake did not finish")

    def submit(self):return self.done(self.service.submit(self.token,self.raw)["id"])

    def review(self,value,**changes):
        return {"input_hash":value["input_hash"],"request_hash":value["request_hash"],"decision":"ACCEPTED","reviewed_summary":"Đã đọc; cần hỏi lại giờ bảo trì.","acknowledged":True,**changes}

    def test_real_client_boundary_intent_review_no_automatic_schedule_change(self):
        original=deepcopy(self.raw)
        with patch("backend.analysis.analyze") as solver:
            value=self.submit()
            self.assertEqual(value["status"],"AWAITING_REVIEW")
            self.assertEqual(len(self.calls),1);solver.assert_not_called()
            self.assertIn('"snapshot"',self.calls[0][1]["content"])
            self.assertNotIn("fake-secret-only",json.dumps(self.calls))
            checked=self.service.review(self.token,value["id"],self.review(value))
        self.assertEqual(checked["status"],"ACCEPTED")
        self.assertFalse(checked["review"]["identity_verified"])
        self.assertEqual(checked["review"]["scope"],"INTENT_ONLY_NO_DATA_OR_SCHEDULE_CHANGE")
        self.assertEqual(self.raw,original)
        self.assertNotIn("private",checked["api"]["usage"])
        self.assertNotIn(self.token,json.dumps(checked))

    def test_no_consent_or_invalid_snapshot_never_calls_model(self):
        for field,value in [("consent",False),("consent",1),("consent","true"),("snapshot",{}),("message","hi")]:
            with self.subTest(field=field),self.assertRaises((ValidationError,TeamError)):
                self.service.submit(self.token,{**self.raw,field:value})
        self.assertFalse(self.calls)

    def test_missing_config_fails_without_fallback(self):
        self.service.config_loader=lambda:{}
        with self.assertRaises(TeamError) as exc:self.service.submit(self.token,self.raw)
        self.assertEqual(exc.exception.status,503);self.assertFalse(self.calls)

    def test_foreign_owner_and_version_mismatch_cannot_review(self):
        value=self.submit()
        with self.assertRaises(TeamError):self.service.get(self.other,value["id"])
        with self.assertRaises(TeamError):self.service.review(self.other,value["id"],self.review(value))
        for key in ("input_hash","request_hash"):
            with self.assertRaises(TeamError):self.service.review(self.token,value["id"],self.review(value,**{key:"wrong"}))
        with self.assertRaises(ValidationError):self.service.review(self.token,value["id"],self.review(value,acknowledged=False))
        with self.assertRaises(ValidationError):self.service.review(self.token,value["id"],self.review(value,acknowledged=1))
        self.assertEqual(self.service.get(self.token,value["id"])["status"],"AWAITING_REVIEW")
        rejected=self.service.review(self.token,value["id"],self.review(value,decision="REJECTED"))
        self.assertEqual(rejected["status"],"REJECTED")
        with self.assertRaises(TeamError):self.service.review(self.token,value["id"],self.review(value))

    def test_cancel_inflight_discards_late_response_and_blocks_early_review(self):
        self.release.clear()
        value=self.service.submit(self.token,self.raw);self.assertTrue(self.entered.wait(2))
        with self.assertRaises(TeamError):self.service.review(self.token,value["id"],self.review(value))
        with self.assertRaises(TeamError):self.service.submit(self.token,self.raw)
        self.service.cancel(self.token,value["id"]);self.release.set();self.service.close()
        self.assertEqual(self.service.get(self.token,value["id"])["status"],"CANCELLED")
        self.assertIsNone(self.service.get(self.token,value["id"])["proposal"])

    def test_quota_survives_new_workspace_and_prevents_network(self):
        self.service.daily_limit=1
        self.submit()
        self.token=self.other
        result=self.submit()
        self.assertEqual(result["status"],"ERROR");self.assertEqual(len(self.calls),1)
        self.assertIn("ngân sách",result["error"])

    def test_invalid_model_output_and_credential_echo_are_not_retained(self):
        for value in [{**answer(),"schedule":[]},{**answer(),"observations":[{"text":"bad","source":"SNAPSHOT","job_ids":["UNKNOWN"]}]},{**answer(),"summary":"fake-secret-only"}]:
            self.response["answer"]=value
            result=self.submit()
            self.assertEqual(result["status"],"ERROR");self.assertIsNone(result["proposal"])
            self.assertNotIn("fake-secret-only",json.dumps(result))

    def test_provider_failure_is_visible_without_generated_fallback(self):
        self.response={"status":"HTTP_ERROR","http_status":429,"error_category":"RATE_LIMIT","usage":None}
        value=self.submit()
        self.assertEqual(value["status"],"ERROR");self.assertEqual(value["api"]["http_status"],429)
        self.assertIsNone(value["proposal"])

    def test_delete_workspace_cascades_assistant_data(self):
        value=self.submit();self.team.delete_workspace(self.token)
        with self.team.db() as db:self.assertIsNone(db.execute("SELECT id FROM assistant_requests WHERE id=?",(value["id"],)).fetchone())
        with self.assertRaises(TeamError):self.service.get(self.token,value["id"])

    def test_restart_retains_review_and_interrupts_unfinished_work(self):
        value=self.submit();self.service.review(self.token,value["id"],self.review(value))
        self.service.close()
        with self.team.db() as db:
            db.execute("UPDATE assistant_requests SET state='RUNNING' WHERE id=?",(value["id"],))
        self.service=AssistantService(self.team)
        self.assertEqual(self.service.get(self.token,value["id"])["status"],"INTERRUPTED")

    def test_http_guards_and_review_schema(self):
        client=TestClient(app);headers={"Authorization":"Bearer "+self.token}
        with patch("backend.app.get_assistant",return_value=self.service):
            self.assertEqual(client.post("/api/demo/assistant/requests",json=self.raw).status_code,401)
            self.assertEqual(client.post("/api/demo/assistant/requests",json={**self.raw,"consent":False},headers=headers).status_code,422)
            self.assertEqual(client.post("/api/demo/assistant/requests",json=self.raw,headers={**headers,"Origin":"https://foreign.invalid"}).status_code,403)
            response=client.post("/api/demo/assistant/requests",json=self.raw,headers=headers)
            self.assertEqual(response.status_code,202)
            value=self.done(response.json()["id"])
            self.assertEqual(client.post(f'/api/demo/assistant/requests/{value["id"]}/review',json=self.review(value),headers=headers).json()["status"],"ACCEPTED")
            self.assertEqual(client.get(f'/api/demo/assistant/requests/{value["id"]}',headers={"Authorization":"Bearer "+self.other}).status_code,404)


if __name__=="__main__":unittest.main()
