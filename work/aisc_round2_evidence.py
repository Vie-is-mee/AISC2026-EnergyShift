"""AISC Round 2 DATA-01: read-only fixture analysis and traceable evidence export.

The source fixtures and application code are never modified. Outputs are synthetic evidence.
"""
from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.analysis import analyze

OUTPUT = ROOT / "work" / "aisc_round2"
FIXTURES = {
    "main_8_jobs": ROOT / "backend" / "fixtures" / "editable_cell.json",
    "small_2_jobs": ROOT / "backend" / "fixtures" / "coordinated_cell.json",
}


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rational(value: str | int | float) -> float:
    return float(Fraction(str(value)))


def plan_info(plan: dict) -> dict:
    cost = plan.get("cost")
    verifier = plan.get("verification") or {}
    out = {
        "status": plan.get("status"),
        "verification": verifier.get("status"),
        "solver_status": plan.get("solver_status"),
        "assignments": plan.get("schedule"),
        "cost_vnd": None if not cost else cost.get("total_vnd"),
        "component_vnd": {} if not cost else cost.get("by_component", {}),
        "by_machine_vnd": {} if not cost else cost.get("by_machine", {}),
        "by_job": {} if not cost else cost.get("by_job", {}),
        "electricity_by_band_vnd": {} if not cost else cost.get("electricity_by_band", {}),
        "kwh_by_band": {} if not cost else {
            k: rational(v) for k, v in cost.get("kwh_by_band_exact", {}).items()
        },
        "total_kwh": None if not cost else rational(cost.get("total_kwh_exact", 0)),
    }
    if cost:
        components = list(cost.get("by_component", {}).values())
        out["components_reconcile"] = sum(components) == cost.get("total_vnd")
        out["machines_reconcile"] = sum(cost.get("by_machine", {}).values()) == cost.get("total_vnd")
        out["jobs_reconcile"] = sum(
            row.get("total_vnd", 0) for row in cost.get("by_job", {}).values()
        ) == cost.get("total_vnd")
    return out


def run_case(name: str, path: Path) -> dict:
    raw_bytes = path.read_bytes()
    snapshot = json.loads(raw_bytes.decode("utf-8-sig"))
    report = analyze(snapshot, enable_b2=True, b2_neighborhood_limit=12)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / (name + ".json")).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    summary = {
        "case": name,
        "fixture_path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "fixture_sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "dataset_id": snapshot["metadata"]["dataset_id"],
        "source_type": snapshot["metadata"]["source_type"],
        "plant_alias": snapshot["metadata"]["plant_alias"],
        "job_count": len(snapshot["jobs"]),
        "machine_count": len(snapshot["machines"]),
        "horizon": snapshot["horizon"],
        "run_id": report.get("run_id"),
        "input_hash": report.get("input_hash"),
        "status": report.get("status"),
        "decision": report.get("decision"),
        "cost_scope": report.get("cost_scope"),
        "search": report.get("search"),
        "comparison": report.get("comparison"),
        "plans": {key: plan_info(val) for key, val in report.get("plans", {}).items()},
    }
    if summary["status"] != "COMPLETED":
        raise RuntimeError(f"{name}: analysis not completed: {summary['status']}")
    for key, p in summary["plans"].items():
        if p["verification"] != "PASS":
            raise RuntimeError(f"{name}: {key} did not pass verifier ({p['verification']})")
        for test in ("components_reconcile", "machines_reconcile", "jobs_reconcile"):
            if not p.get(test):
                raise RuntimeError(f"{name}: {key} failed accounting test {test}")
    if summary["source_type"] != "SYNTHETIC":
        raise RuntimeError("This evaluation is explicitly intended for synthetic fixtures")
    return summary


def main() -> int:
    summaries = {}
    for name, path in FIXTURES.items():
        print(f"Running {name}...", flush=True)
        summaries[name] = run_case(name, path)
        item = summaries[name]
        print(
            f"{name}: {item['status']} decision={item['decision'].get('kind')} "
            + " / ".join(
                f"{p}={item['plans'][p]['cost_vnd']} VND"
                for p in ("B0", "B1", "B2")
            ),
            flush=True,
        )

    manifest = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "AISC26 Round 2 slide evidence. All data synthetic; not factory savings.",
        "python": platform.python_version(),
        "code_sha256": {
            p: file_sha(ROOT / p)
            for p in (
                "backend/analysis.py",
                "backend/b1.py",
                "backend/b2.py",
                "backend/costing.py",
                "backend/verifier.py",
                "backend/risk.py",
            )
        },
        "cases": summaries,
    }
    (OUTPUT / "data01_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Saved evidence to " + str(OUTPUT), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
