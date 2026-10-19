from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event, Lock
from time import monotonic, sleep
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import app
from backend.team import TeamService, TeamError
from backend.tests.test_b1_policy import small_fixture


class TeamTests(unittest.TestCase):
    def setUp(self):
        self.directory=TemporaryDirectory();self.release=Event();self.entered=Event();self.running=0;self.maximum=0;self.guard=Lock()
        def fake(snapshot,**options):
            with self.guard:self.running+=1;self.maximum=max(self.maximum,self.running)
            self.entered.set();self.release.wait(10)
            with self.guard:self.running-=1
            return {"status":"COMPLETED","run_id":"test-only","options":options}
        self.service=TeamService(Path(self.directory.name)/"private.sqlite3",analyzer=fake,capacity=3,per_workspace=2)
        self.a=self.service.create_workspace()["workspace_token"];self.b=self.service.create_workspace()["workspace_token"]
    def tearDown(self):
        self.release.set();self.service.close();self.directory.cleanup()
    def wait_done(self,token,job):
        deadline=monotonic()+10
        while monotonic()<deadline:
            result=self.service.get(token,job)
            if result["status"] not in ("QUEUED","RUNNING"):return result
            sleep(.01)
        self.fail("Queued analysis did not finish")

    def test_serial_queue_private_reports_and_capacity(self):
        first=self.service.submit(self.a,small_fixture());self.assertTrue(self.entered.wait(2))
        second=self.service.submit(self.a,small_fixture());third=self.service.submit(self.b,small_fixture())
        with self.assertRaises(TeamError) as error:self.service.submit(self.b,small_fixture())
        self.assertEqual(error.exception.status,429)
        with self.assertRaises(TeamError) as error:self.service.get(self.b,first["job_id"])
        self.assertEqual(error.exception.status,404)
        self.release.set();report=self.wait_done(self.a,first["job_id"])["report"]
        self.wait_done(self.a,second["job_id"]);self.wait_done(self.b,third["job_id"])
        self.assertEqual(self.maximum,1);self.assertEqual(report["options"]["b2_neighborhood_limit"],12)
        self.assertEqual(len(self.service.history(self.a)["jobs"]),2)
        self.assertNotIn(self.a,Path(self.service.path).read_bytes().decode("latin1"))

    def test_cancel_queued_only_and_delete_workspace(self):
        first=self.service.submit(self.a,small_fixture());self.entered.wait(2)
        second=self.service.submit(self.a,small_fixture())
        self.assertEqual(self.service.cancel(self.a,second["job_id"])["status"],"CANCELLED")
        with self.assertRaises(TeamError):self.service.cancel(self.a,first["job_id"])
        self.service.delete_workspace(self.a)
        with self.assertRaises(TeamError) as error:self.service.history(self.a)
        self.assertEqual(error.exception.status,401)

    def test_rejects_mismatched_trace_and_oversized_demo(self):
        with self.assertRaises(TeamError):self.service.submit(self.a,small_fixture(),{"input_hash":"tampered"})
        with self.assertRaises(TeamError):self.service.history("wrong-token")

    def test_api_owner_checks_and_no_credentials_in_responses(self):
        client=TestClient(app);headers={"Authorization":"Bearer "+self.a}
        with patch("backend.app.get_team",return_value=self.service):
            self.assertEqual(client.get("/api/demo/jobs").status_code,401)
            posted=client.post("/api/demo/jobs",json={"snapshot":small_fixture()},headers=headers)
            self.assertEqual(posted.status_code,202);job=posted.json()["job_id"]
            self.assertEqual(client.get("/api/demo/jobs/"+job,headers={"Authorization":"Bearer "+self.b}).status_code,404)
            self.assertEqual(client.post("/api/demo/jobs",json={"snapshot":small_fixture()},headers={**headers,"Origin":"https://foreign.invalid"}).status_code,403)
            self.assertNotIn(self.a,client.get("/api/demo/jobs",headers=headers).text)

    def test_finished_history_survives_restart_without_workspace_secret_storage(self):
        self.release.set();job=self.service.submit(self.a,small_fixture());self.wait_done(self.a,job["job_id"])
        self.service.close();self.service=TeamService(Path(self.directory.name)/"private.sqlite3")
        self.assertEqual(self.service.get(self.a,job["job_id"])["status"],"COMPLETED")

    def test_history_bound_expiry_and_interrupted_state(self):
        self.release.set()
        for _ in range(12):
            job=self.service.submit(self.a,small_fixture());self.wait_done(self.a,job["job_id"])
        self.assertLessEqual(len(self.service.history(self.a)["jobs"]),10)
        self.service.close()  # Wait for final retention cleanup before injecting a restart record.
        with self.service.db() as db:
            owner=db.execute("SELECT owner FROM workspaces ORDER BY created LIMIT 1").fetchone()[0]
            db.execute("INSERT INTO jobs(id,owner,state,created) VALUES('orphan',?,'QUEUED',0)",(owner,))
        self.service.close();self.service=TeamService(Path(self.directory.name)/"private.sqlite3")
        self.assertEqual(self.service.get(self.a,"orphan")["status"],"INTERRUPTED")
        with self.service.db() as db:db.execute("UPDATE workspaces SET created=0 WHERE owner=?",(owner,))
        with self.assertRaises(TeamError):self.service.history(self.a)

    def test_oversized_report_is_not_retained_as_a_completed_recommendation(self):
        self.service.analyzer=lambda snapshot,**options:{"oversized":"x"*(1024*1024)}
        job=self.service.submit(self.a,small_fixture());result=self.wait_done(self.a,job["job_id"])
        self.assertEqual(result["status"],"ERROR");self.assertNotIn("report",result)

    def test_deleting_running_workspace_does_not_bypass_global_capacity(self):
        self.service.submit(self.a,small_fixture());self.assertTrue(self.entered.wait(2))
        self.service.delete_workspace(self.a)
        self.service.submit(self.b,small_fixture());self.service.submit(self.b,small_fixture())
        other=self.service.create_workspace()["workspace_token"]
        with self.assertRaises(TeamError) as error:self.service.submit(other,small_fixture())
        self.assertEqual(error.exception.status,429)
