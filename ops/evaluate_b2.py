"""Actual synthetic solver evidence; no model API or network."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.analysis import analyze


def main():
    seed = json.loads((ROOT / "backend/fixtures/coordinated_cell.json").read_text())
    rows = []
    for case in ("coordinated", "incremental_too_small", "single_job_review", "unknown_overtime", "expensive_overtime", "zero_budget"):
        data = deepcopy(seed); options = {}
        if case == "incremental_too_small":
            data["policy"]["min_b2_incremental_vnd"] = 1000000
        elif case == "single_job_review":
            data["cost_scope"]["review_scope"] = "ALL_SINGLE_JOB_MOVES_IN_HORIZON"
        elif case in ("unknown_overtime", "expensive_overtime"):
            unknown = case == "unknown_overtime"
            data["cost_scope"]["excluded_review"]["LABOR_OVERTIME"].update(status="UNKNOWN" if unknown else "BOUNDED", incremental_min_vnd=None if unknown else 1000000, incremental_max_vnd=None if unknown else 1000000)
        elif case == "zero_budget":
            options["b2_time_limit_seconds"] = 0
        report = analyze(data, enable_b2=True, **options)
        rows.append({"case": case, "input_hash": report["input_hash"], "decision": report["decision"],
                     "costs_vnd": {p: report["plans"][p]["cost"]["total_vnd"] for p in ("B0", "B1", "B2")},
                     "verifiers": {p: report["plans"][p]["verification"]["status"] for p in ("B0", "B1", "B2")},
                     "solver": report["plans"]["B2"]["solver"], "origin": report["plans"]["B2"]["origin"], "economics": report["coordinated_economics"]})
    output = {"generated_at": datetime.now(timezone.utc).isoformat(), "source_type": "SYNTHETIC", "method": "Actual CP-SAT with independent verifier and exact ledger recosting", "limitations": "Constructed small cases, not industrial validation/global benchmark. No LLM call.", "cases": rows}
    (ROOT / "docs/evaluation/b2_cases.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{k: r[k] for k in ("case", "costs_vnd", "decision")} for r in rows]))


if __name__ == "__main__":
    main()
