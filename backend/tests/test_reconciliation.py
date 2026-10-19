from copy import deepcopy
from fractions import Fraction
import unittest
from fastapi.testclient import TestClient
from backend.app import app
from backend.reconciliation import reconcile
from backend.tests.test_b1_policy import small_fixture


def packet():
    data=small_fixture()
    return {"snapshot":data,"executed_schedule":data["current_schedule"],"executed_schedule_confirmed":True,
            "observations":[{"machine_id":"M1","start":"2026-10-19T09:30:00+07:00","end":"2026-10-19T10:30:00+07:00","kwh":18.0,"scope":"RUN_ONLY","source_type":"SYNTHETIC","reference":"constructed-test-meter"}]}


class ReconciliationTests(unittest.TestCase):
    def test_exact_error_and_coverage_not_savings(self):
        raw=packet();before=deepcopy(raw);r=reconcile(raw);m=r["metrics"]
        self.assertEqual(r["status"],"RECONCILED")
        self.assertEqual(Fraction(m["mae_kwh_exact"]),2)
        self.assertEqual(Fraction(m["bias_kwh_exact"]),2)
        self.assertEqual(Fraction(m["wape_pct_exact"]),Fraction(100,9))
        self.assertEqual(Fraction(m["modeled_run_energy_coverage_pct_exact"]),100)
        self.assertEqual(r["source_type"],"SYNTHETIC")
        self.assertNotIn("saving_vnd",r)
        self.assertEqual(raw,before)

    def test_total_machine_and_plant_are_not_scored(self):
        for scope in ("TOTAL_MACHINE","TOTAL_PLANT"):
            raw=packet();raw["observations"][0].update(scope=scope,machine_id=None if scope=="TOTAL_PLANT" else "M1")
            r=reconcile(raw);self.assertEqual(r["status"],"NOT_COMPARABLE");self.assertIsNone(r["metrics"])

    def test_partial_coverage_and_zero_denominator(self):
        raw=packet();raw["observations"][0].update(end="2026-10-19T10:00:00+07:00",kwh=0.0)
        m=reconcile(raw)["metrics"];self.assertEqual(Fraction(m["modeled_run_energy_coverage_pct_exact"]),50);self.assertIsNone(m["wape_pct_exact"])

    def test_overlap_missing_attestation_and_invalid_schedule_fail(self):
        raw=packet();raw["observations"].append(deepcopy(raw["observations"][0]))
        with self.assertRaises(ValueError):reconcile(raw)
        raw=packet();raw["executed_schedule_confirmed"]=False
        with self.assertRaises(ValueError):reconcile(raw)
        raw=packet();raw["executed_schedule"][0]["start"]="2026-10-19T23:30:00+07:00"
        with self.assertRaises(ValueError):reconcile(raw)

    def test_machine_horizon_and_offset_are_checked(self):
        for update in ({"machine_id":"NO"},{"start":"2026-10-18T09:30:00+07:00"},{"start":"2026-10-19T02:30:00+00:00","end":"2026-10-19T03:30:00+00:00"}):
            raw=packet();raw["observations"][0].update(update)
            with self.assertRaises(ValueError):reconcile(raw)

    def test_measured_label_is_declared_not_authenticated_and_hash_changes(self):
        raw=packet();a=reconcile(raw);raw["observations"][0]["source_type"]="MEASURED";b=reconcile(raw)
        self.assertEqual(b["source_type"],"USER_SUPPLIED_MEASURED");self.assertIn("not authenticated",b["intervals"][0]["note"]);self.assertNotEqual(a["observation_hash"],b["observation_hash"])

    def test_api_rejects_duplicate_keys_and_foreign_origin(self):
        client=TestClient(app)
        self.assertEqual(client.post("/api/demo/reconcile",json=packet()).status_code,200)
        self.assertEqual(client.post("/api/demo/reconcile",content='{"a":1,"a":2}',headers={"Content-Type":"application/json"}).status_code,422)
        self.assertEqual(client.post("/api/demo/reconcile",json=packet(),headers={"Origin":"https://foreign.invalid"}).status_code,403)
