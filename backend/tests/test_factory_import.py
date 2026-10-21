"""Factory Lab CSV/XLSX importer: explicit data only, bounded, solver never runs during preview."""
from copy import deepcopy
import csv
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from backend.app import app
from backend.factory_core import analyze_factory
from backend.factory_routing import analyze_factory_routing
from backend.factory_import import (template_bytes, inspect_spreadsheet, COLUMNS,
                                    MAX_UPLOAD_BYTES, SHEETS)

FIX = Path(__file__).resolve().parents[1] / "fixtures"
CASES = {"factory_generic_demo.json": "factory-1",
         "factory_multistage_demo.json": "factory-2",
         "factory_changeover_demo.json": "factory-1"}


def fixture(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def modify_csv(data, callback):
    content = template_bytes(data, "csv").decode("utf-8-sig")
    entries = list(csv.DictReader(io.StringIO(content)))
    callback(entries)
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(entries)
    return buf.getvalue().encode("utf-8")


def modify_xlsx(data, callback):
    book = load_workbook(io.BytesIO(template_bytes(data, "xlsx")))
    callback(book)
    buf = io.BytesIO()
    book.save(buf)
    book.close()
    return buf.getvalue()


class ImportTests(unittest.TestCase):
    def test_all_fixtures_roundtrip_csv_xlsx_with_identical_verified_b0(self):
        for name, version in CASES.items():
            source = fixture(name)
            engine = analyze_factory_routing if version == "factory-2" else analyze_factory
            source_report = engine(source)
            self.assertEqual(source_report["status"], "COMPLETED")
            for extension in ("csv", "xlsx"):
                with self.subTest(name=name, extension=extension):
                    result = inspect_spreadsheet(template_bytes(source, extension), extension)
                    self.assertEqual(result["status"], "READY_FOR_REVIEW", result)
                    self.assertEqual(result["draft"]["schema_version"], version)
                    self.assertEqual(result["manifest"]["source_type"], "SYNTHETIC")
                    self.assertTrue(result["manifest"]["sha256"].startswith("sha256:"))
                    self.assertTrue(result["review_required"])
                    self.assertNotIn("plans", result)
                    after = engine(result["draft"])
                    self.assertEqual(after["status"], "COMPLETED", after)
                    self.assertEqual(after["plans"]["B0"]["cost"]["total_vnd"],
                                     source_report["plans"]["B0"]["cost"]["total_vnd"])
                    self.assertEqual(after["plans"]["B2"]["cost"]["total_vnd"],
                                     source_report["plans"]["B2"]["cost"]["total_vnd"])

    def test_missing_capability_power_never_inferred(self):
        raw = modify_csv(fixture("factory_generic_demo.json"), lambda rows: next(
            x for x in rows if x["section"] == "Capabilities").update(average_kw=""))
        r = inspect_spreadsheet(raw, "csv")
        self.assertEqual(r["code"], "IMPORT_MAPPING_INVALID")
        self.assertIn("IMPORT_REQUIRED_CELL", [x["code"] for x in r["issues"]])
        self.assertFalse(r["ready_for_analysis"])
        self.assertNotIn("plans", r)

    def test_missing_route_edge_or_inventory_assumption_blocks(self):
        raw = modify_csv(fixture("factory_multistage_demo.json"), lambda rows: rows.__setitem__(
            slice(None), [x for x in rows if x["section"] != "Precedence"]))
        result = inspect_spreadsheet(raw, "csv")
        self.assertEqual(result["code"], "IMPORT_PREFLIGHT_BLOCKED", result)
        self.assertTrue(any(x["code"] == "ROUTE_EDGES_REQUIRED" for x in result["issues"]))
        raw = modify_csv(fixture("factory_multistage_demo.json"), lambda rows: next(
            x for x in rows if x["section"] == "Settings" and x["key"] == "buffer_assumption"
        ).update(value=""))
        self.assertEqual(inspect_spreadsheet(raw, "csv")["code"], "IMPORT_MAPPING_INVALID")

    def test_unverified_assumptions_and_invalid_baseline_block(self):
        fixture_data = fixture("factory_generic_demo.json")
        raw = modify_csv(fixture_data, lambda rows: next(
            x for x in rows if x["section"] == "Settings" and x["key"] == "setup_assumption"
        ).update(value="UNKNOWN"))
        self.assertEqual(inspect_spreadsheet(raw, "csv")["code"], "IMPORT_PREFLIGHT_BLOCKED")
        raw = modify_csv(fixture_data, lambda rows: next(
            x for x in rows if x["section"] == "Schedule").update(start="2026-10-19T10:30:00+07:00"))
        check = inspect_spreadsheet(raw, "csv")
        self.assertEqual(check["code"], "IMPORT_PREFLIGHT_BLOCKED", check)
        self.assertIn("MACHINE_OVERLAP", [x["code"] for x in check["issues"]])

    def test_unsupported_constraints_blocked_with_no_evidence(self):
        data = fixture("factory_generic_demo.json")
        raw = modify_csv(data, lambda rows: next(
            x for x in rows if x["section"] == "Settings" and x["key"] == "unsupported_constraints"
        ).update(value="finite_inventory;workforce_skills"))
        report = inspect_spreadsheet(raw, "csv")
        self.assertEqual(report["code"], "IMPORT_PREFLIGHT_BLOCKED")
        self.assertEqual(report["draft"]["unsupported_constraints"],
                         ["finite_inventory", "workforce_skills"])
        self.assertFalse(report["ready_for_analysis"])

    def test_unknown_machines_and_duplicate_keys_block(self):
        data = fixture("factory_generic_demo.json")
        raw = modify_csv(data, lambda rows: next(
            x for x in rows if x["section"] == "Capabilities").update(machine_id="UNKNOWN_MACHINE"))
        r = inspect_spreadsheet(raw, "csv")
        self.assertEqual(r["code"], "IMPORT_PREFLIGHT_BLOCKED")
        raw = modify_csv(data, lambda rows: rows.append(next(
            x.copy() for x in rows if x["section"] == "Capabilities")))
        r = inspect_spreadsheet(raw, "csv")
        self.assertEqual(r["code"], "IMPORT_MAPPING_INVALID")
        self.assertIn("IMPORT_DUPLICATE_KEY", [x["code"] for x in r["issues"]])

    def test_xlsx_header_and_excel_formula_are_never_executed(self):
        source = fixture("factory_generic_demo.json")
        raw = modify_xlsx(source, lambda wb: setattr(wb["Capabilities"]["D2"], "value", "=1+2"))
        check = inspect_spreadsheet(raw, "xlsx")
        self.assertEqual(check["code"], "IMPORT_FORMULAS_UNSUPPORTED")
        raw = modify_xlsx(source, lambda wb: setattr(wb["Machines"]["A1"], "value", "FAKE_HEADER"))
        self.assertEqual(inspect_spreadsheet(raw, "xlsx")["code"], "IMPORT_HEADER_INVALID")

    def test_csv_unknown_columns_bad_encoding_and_unknown_section(self):
        source = fixture("factory_generic_demo.json")
        raw = template_bytes(source, "csv")
        self.assertEqual(inspect_spreadsheet(b"\xff\xfe", "csv")["code"], "IMPORT_UTF8_REQUIRED")
        self.assertEqual(inspect_spreadsheet(b"section,task_id\nTasks,X\n", "csv")["code"],
                         "IMPORT_HEADER_INVALID")
        altered = raw.decode("utf-8-sig").replace("Machines,", "UnknownSheet,", 1).encode("utf-8")
        self.assertEqual(inspect_spreadsheet(altered, "csv")["code"], "IMPORT_UNKNOWN_SECTION")
        self.assertEqual(inspect_spreadsheet(b"", "csv")["code"], "IMPORT_FILE_SIZE")
        self.assertEqual(inspect_spreadsheet(b"this-is-not-a-workbook", "xlsx")["code"], "IMPORT_XLSX_INVALID")
        self.assertEqual(inspect_spreadsheet(b"x" * (MAX_UPLOAD_BYTES + 1), "csv")["code"], "IMPORT_FILE_SIZE")

    def test_orphan_setup_resource_and_unexpected_order_block(self):
        source = fixture("factory_changeover_demo.json")
        raw = modify_csv(source, lambda rows: rows.append({
            **{key: "" for key in COLUMNS}, "section": "SetupDemands",
            "machine_id": "PACK-01", "from_family": "MISSING",
            "to_family": "BOX", "resource_id": "CREW", "amount": "1"
        }))
        r = inspect_spreadsheet(raw, "csv")
        self.assertEqual(r["code"], "IMPORT_MAPPING_INVALID")
        self.assertIn("IMPORT_SETUP_DEMAND_UNKNOWN_TRANSITION", [x["code"] for x in r["issues"]])
        source = fixture("factory_generic_demo.json")
        raw = modify_csv(source, lambda rows: next(
            x for x in rows if x["section"] == "Tasks").update(work_order_id="FAKE_ORDER"))
        self.assertEqual(inspect_spreadsheet(raw, "csv")["code"], "IMPORT_MAPPING_INVALID")

    def test_preview_does_not_call_solver(self):
        source = fixture("factory_multistage_demo.json")
        with patch("backend.factory_core.solve", side_effect=AssertionError("optimizer must not run")):
            preview = inspect_spreadsheet(template_bytes(source, "xlsx"), "xlsx")
        self.assertEqual(preview["status"], "READY_FOR_REVIEW")


class ImportApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_download_and_upload_templates(self):
        for version in ("factory-1", "factory-2", "changeover"):
            for ext in ("csv", "xlsx"):
                r = self.client.get("/api/factory/import/template",
                                    params={"file_type": ext, "version": version})
                self.assertEqual(r.status_code, 200, r.text[:200])
                self.assertIn("attachment", r.headers["content-disposition"])
                report = self.client.post("/api/factory/import/preview",
                                          params={"file_type": ext},
                                          content=r.content, headers={"Content-Type": "application/octet-stream"})
                self.assertEqual(report.status_code, 200, report.text[:400])
                self.assertEqual(report.json()["status"], "READY_FOR_REVIEW", report.json())
                self.assertNotIn("plans", report.json())

    def test_reject_upload_size_and_unknown_formats(self):
        r = self.client.post("/api/factory/import/preview",
                             params={"file_type": "xlsx"}, content=b"x" * (MAX_UPLOAD_BYTES + 1))
        self.assertEqual(r.status_code, 413)
        self.assertEqual(r.json()["code"], "IMPORT_FILE_SIZE")
        r = self.client.post("/api/factory/import/preview",
                             params={"file_type": "xls"}, content=b"abc")
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["code"], "IMPORT_FILE_TYPE")
        r = self.client.get("/api/factory/import/template",
                            params={"file_type": "xls", "version": "factory-1"})
        self.assertNotEqual(r.status_code, 200)


if __name__ == "__main__":
    unittest.main()
