from copy import deepcopy
from datetime import datetime
import hashlib
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
from backend.assistant_csv import parse_table, preview, CSVProposal
from backend.team import TeamService, TeamError
from backend.tests.test_b1_policy import small_fixture

MAPPING=["job_id","template_id","quantity","machine_id","start","release","due","UNMODELED"]


def proposal():
    return {"summary":"Đề xuất ghép cột, giữ ghi chú ngoài mô hình.","columns":[{"column_index":i,"field":field,"rationale":"Theo tiêu đề và hồ sơ."} for i,field in enumerate(MAPPING)],"issues":[{"row_index":0,"column_index":2,"explanation":"Số lượng trống; cần rà soát định mức."}],"questions":["Ghi chú có thêm ràng buộc chưa được mô hình hóa không?"]}


class CSVAssistantTests(unittest.TestCase):
    def setUp(self):
        self.directory=TemporaryDirectory();self.team=TeamService(Path(self.directory.name)/"ai.sqlite3")
        self.token=self.team.create_workspace()["workspace_token"];self.other=self.team.create_workspace()["workspace_token"]
        self.calls=[];self.response=proposal();self.release=Event();self.release.set();self.entered=Event()
        def client(messages,**kwargs):
            self.calls.append({"messages":messages,"schema":kwargs["response_schema"]});self.entered.set();self.release.wait(4)
            return {"status":"OK","answer":deepcopy(self.response),"response_id":"csv-test-only","served_model":"fake-model","finish_reason":"stop","usage":{"total_tokens":123}}
        self.service=AssistantService(self.team,client=client,config_loader=lambda:{"OPENROUTER_API_KEY":"fake-secret-only","OPENROUTER_MODEL":"test"})
        self.raw={"kind":"CSV","snapshot":small_fixture(),"raw_text":'\ufeffWork,Route,Count,Press,Launch,Ready,Deadline,Notes\r\n" J1 ",,,M1,2026-10-19 09:30,,,"line one, comma\nline two"\r\n',"message":"Giữ mọi cột.","consent":True}

    def tearDown(self):
        self.release.set();self.service.close();self.team.close();self.directory.cleanup()

    def done(self,ident):
        end=monotonic()+5
        while monotonic()<end:
            value=self.service.get(self.token,ident)
            if value["status"] not in ("QUEUED","RUNNING"):return value
            sleep(.01)
        self.fail("CSV job did not finish")

    def submit(self):return self.done(self.service.submit(self.token,self.raw)["id"])

    def review_body(self,value):
        view=self.service.csv_preview(self.token,value["id"],{"input_hash":value["input_hash"],"request_hash":value["request_hash"],"mapping":MAPPING})
        rows=[{cell["field"]:cell["value"] or (cell["suggestion"] or {}).get("value","") for cell in cells} for cells in view["cells"]]
        return {"input_hash":value["input_hash"],"request_hash":value["request_hash"],"mapping":MAPPING,"decision":"ACCEPTED","reviewed_summary":"Đã rà soát ô lấy hồ sơ và giữ ghi chú chưa mô hình hóa.","acknowledged":True,"rows":rows,"extras_acknowledged":True,"questions_acknowledged":True}

    def test_source_is_immutable_and_profile_values_are_not_silently_filled(self):
        value=self.submit();self.assertEqual(value["status"],"AWAITING_REVIEW")
        self.assertEqual(value["csv_source"]["raw_text"],self.raw["raw_text"])
        self.assertEqual(value["csv_source"]["raw_hash"],"sha256:"+hashlib.sha256(self.raw["raw_text"].encode()).hexdigest())
        view=preview(value["input_snapshot"],value["csv_source"],MAPPING)
        self.assertEqual(view["rows"][0]["quantity"],"")
        quantity=next(c for c in view["cells"][0] if c["field"]=="quantity")
        self.assertEqual(quantity["suggestion"]["value"],"1000")
        self.assertEqual(quantity["suggestion"]["source_type"],"SYNTHETIC")
        self.assertNotIn("tariff",json.loads(self.calls[0]["messages"][1]["content"])["profile"])
        self.assertNotIn("fake-secret-only",json.dumps(self.calls))

    def test_single_job_from_full_profile_scopes_unused_rules_without_destroying_reference(self):
        fixture=Path(__file__).resolve().parents[1]/'fixtures/editable_cell.json'
        self.raw['snapshot']=json.loads(fixture.read_text(encoding='utf-8'))
        original=deepcopy(self.raw['snapshot'])
        value=self.submit();reviewed=self.service.csv_review(self.token,value['id'],self.review_body(value))
        result=reviewed['review']['result']
        self.assertTrue(result['scoped_out_reference_transitions'])
        self.assertEqual(reviewed['input_snapshot']['setup']['transitions'],original['setup']['transitions'])
        self.assertEqual(self.raw['snapshot'],original)
        self.assertEqual(len(result['snapshot']['jobs']),1)

    def test_human_review_compiles_exact_rows_preserves_extras_and_resets_cost_review(self):
        value=self.submit()
        with patch("backend.analysis.analyze") as engine:
            reviewed=self.service.csv_review(self.token,value["id"],self.review_body(value));engine.assert_not_called()
        result=reviewed["review"]["result"]
        self.assertEqual(reviewed["status"],"ACCEPTED")
        self.assertEqual(result["rows"][0]["job_id"],"J1")
        self.assertEqual(result["retained_unmodeled_columns"],["Notes"])
        self.assertEqual(reviewed["csv_source"]["rows"][0][-1],"line one, comma\nline two")
        self.assertEqual({c["origin"] for c in result["changes"]},{"CSV_TRIMMED","USER_CONFIRMED_PROFILE"})
        self.assertTrue(all(r["status"]=="UNKNOWN" for r in result["snapshot"]["cost_scope"]["excluded_review"].values()))
        self.assertEqual(result["snapshot"]["metadata"]["source_type"],"SYNTHETIC")
        self.assertFalse(reviewed["review"]["identity_verified"])
        self.assertTrue(result["prepared_input_hash"].startswith("sha256:"))

    def test_required_human_acknowledgments_and_version_guards(self):
        value=self.submit();body=self.review_body(value)
        for change in ({"extras_acknowledged":False},{"questions_acknowledged":False},{"input_hash":"wrong"},{"request_hash":"wrong"}):
            with self.subTest(change=change),self.assertRaises(TeamError):self.service.csv_review(self.token,value["id"],{**body,**change})
        for change in ({"acknowledged":False},{"acknowledged":1},{"extras_acknowledged":1}):
            with self.assertRaises(ValidationError):self.service.csv_review(self.token,value["id"],{**body,**change})
        self.assertEqual(self.service.get(self.token,value["id"])["status"],"AWAITING_REVIEW")

    def test_invalid_facts_do_not_become_an_accepted_snapshot(self):
        value=self.submit();body=self.review_body(value)
        for field,bad in [("quantity","1001"),("quantity","1.000"),("machine_id","UNKNOWN"),("start","19/10/2026 09:30"),("start","2026-02-30 09:30"),("template_id","UNKNOWN")]:
            damaged=deepcopy(body);damaged["rows"][0][field]=bad
            with self.subTest(field=field,bad=bad),self.assertRaises(TeamError):self.service.csv_review(self.token,value["id"],damaged)
        self.assertEqual(self.service.get(self.token,value["id"])["status"],"AWAITING_REVIEW")

    def test_no_dropped_rows_duplicate_mapping_or_legacy_intent_gate_bypass(self):
        value=self.submit();body=self.review_body(value)
        for update in ({"rows":[]},{"mapping":["job_id"]*8}):
            with self.assertRaises(TeamError):self.service.csv_review(self.token,value["id"],{**body,**update})
        with self.assertRaises(TeamError):self.service.review(self.token,value["id"],{k:v for k,v in body.items() if k in ("input_hash","request_hash","decision","reviewed_summary","acknowledged")})
        with self.assertRaises(TeamError):self.service.csv_review(self.other,value["id"],body)

    def test_human_corrections_are_kept_and_marked_as_human_not_ai(self):
        value=self.submit();body=self.review_body(value);body["rows"][0]["job_id"]="LOT_NEW"
        reviewed=self.service.csv_review(self.token,value["id"],body)
        changes=reviewed["review"]["result"]["changes"]
        self.assertEqual(next(c for c in changes if c["field"]=="job_id")["origin"],"HUMAN_EDIT")
        self.assertEqual(reviewed["csv_source"]["rows"][0][0]," J1 ")

    def test_reject_does_not_require_filling_missing_facts_and_cannot_be_approved_again(self):
        value=self.submit();body=self.review_body(value);body.update(decision="REJECTED",rows=[],extras_acknowledged=False,questions_acknowledged=False)
        reviewed=self.service.csv_review(self.token,value["id"],body)
        self.assertIsNone(reviewed["review"]["result"])
        with self.assertRaises(TeamError):self.service.csv_review(self.token,value["id"],{**body,"decision":"ACCEPTED"})

    def test_model_cannot_drop_columns_cite_nonexistent_cells_or_return_values(self):
        invalid=[{**proposal(),"columns":proposal()["columns"][:-1]},{**proposal(),"issues":[{"row_index":7,"column_index":0,"explanation":"no such row"}]},{**proposal(),"filled_values":{"quantity":"0"}}]
        for answer in invalid:
            self.response=answer
            self.assertEqual(self.submit()["status"],"ERROR")

    def test_hash_binds_exact_source_and_notes_without_erasing_bom(self):
        first=self.submit();self.raw["raw_text"]=self.raw["raw_text"].removeprefix("\ufeff")
        second=self.submit();self.assertNotEqual(first["request_hash"],second["request_hash"])
        self.assertEqual(first["input_hash"],second["input_hash"])
        self.raw["message"]="Ghi chú khác";third=self.submit();self.assertNotEqual(third["request_hash"],second["request_hash"])

    def test_bad_csv_and_missing_consent_never_reach_model(self):
        for raw in ['a,a\n1,2','a,b\n1','a,b\n"missing,2','a,b\na"b,2','a,b\n"a"oops,2','a,b\n,','a,b\n1,2\n\n3,4','a\n'+('x'*4097),'a\n'+'\n'.join('x' for _ in range(9)), 'a\n'+('x'*33000)]:
            with self.subTest(raw=raw[:30]),self.assertRaises(TeamError):self.service.submit(self.token,{**self.raw,"raw_text":raw})
        with self.assertRaises(ValidationError):self.service.submit(self.token,{**self.raw,"consent":False})
        self.assertFalse(self.calls)

    def test_delimiters_quotes_and_newlines_preserved(self):
        for raw,delimiter in [('A;B\r\n"x;y";z\r\n',';'),('A\tB\n"x\ny"\tz','\t')]:
            value=parse_table(raw);self.assertEqual(value["delimiter"],delimiter);self.assertEqual(value["raw_text"],raw)

    def test_cancelled_csv_never_returns_a_late_proposal(self):
        self.release.clear();value=self.service.submit(self.token,self.raw);self.entered.wait(2)
        self.service.cancel(self.token,value["id"]);self.release.set();self.service.close()
        self.assertEqual(self.service.get(self.token,value["id"])["status"],"CANCELLED")
        self.assertIsNone(self.service.get(self.token,value["id"])["proposal"])

    def test_api_csv_preview_review_and_owner_checks(self):
        client=TestClient(app);headers={"Authorization":"Bearer "+self.token}
        with patch("backend.app.get_assistant",return_value=self.service):
            response=client.post("/api/demo/assistant/requests",json=self.raw,headers=headers)
            self.assertEqual(response.status_code,202);value=self.done(response.json()["id"])
            body=self.review_body(value)
            self.assertEqual(client.post(f'/api/demo/assistant/requests/{value["id"]}/csv-review',json={**body,"acknowledged":False},headers=headers).status_code,422)
            self.assertEqual(client.post(f'/api/demo/assistant/requests/{value["id"]}/csv-review',json=body,headers={"Authorization":"Bearer "+self.other}).status_code,404)
            self.assertEqual(client.post(f'/api/demo/assistant/requests/{value["id"]}/csv-review',json=body,headers=headers).json()["status"],"ACCEPTED")


if __name__=="__main__":unittest.main()
