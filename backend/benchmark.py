"""Repeatable local engine benchmark, independent of any model or API service."""
import argparse
from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
import platform
import statistics
from time import perf_counter
from zoneinfo import ZoneInfo

from .analysis import analyze


def benchmark(repeats=3):
    raw = json.loads((Path(__file__).parent / "fixtures/editable_cell.json").read_text(encoding="utf-8"))
    keep, measure, invalid = deepcopy(raw), deepcopy(raw), deepcopy(raw)
    keep["policy"]["min_net_saving_vnd"] = 10000000
    measure["policy"]["min_net_saving_vnd"] = 157000
    invalid["current_schedule"][1]["start"] = "2026-10-19T09:00:00+07:00"
    cases = [("change", raw, "CHANGE"), ("keep", keep, "KEEP_CURRENT"),
             ("measure", measure, "MEASURE_FIRST"), ("invalid", invalid, "BASELINE_INVALID")]
    results = []
    for name, data, expected in cases:
        runs = []
        for _ in range(repeats):
            start = perf_counter()
            report = analyze(data)
            seconds = round(perf_counter() - start, 4)
            completed = report["status"] == "COMPLETED"
            invariants = {}
            if completed:
                b0, b1 = report["plans"]["B0"], report["plans"]["B1"]
                invariants = {"b0_pass": b0["verification"]["status"] == "PASS",
                              "b1_pass": b1["verification"]["status"] == "PASS",
                              "b1_not_worse": b1["cost"]["total_vnd"] <= b0["cost"]["total_vnd"],
                              "at_most_one_move": report["comparison"]["changed_assignments"] <= 1,
                              "components_reconcile": sum(report["comparison"]["saving_by_component_vnd"].values()) == report["comparison"]["saving_vnd"]}
            runs.append({"seconds": seconds, "decision": report["decision"]["kind"],
                         "expected_decision_matches": report["decision"]["kind"] == expected,
                         "invariants": invariants, "input_hash": report["input_hash"],
                         "b1_schedule": report["plans"]["B1"]["schedule"] if completed else None,
                         "comparison": report.get("comparison"), "search": report.get("search")})
            print(json.dumps({"case": name, "repeat": len(runs), "seconds": seconds, "decision": runs[-1]["decision"]}), flush=True)
        stable = all((r["b1_schedule"], r["comparison"], r["decision"], r["input_hash"]) ==
                     (runs[0]["b1_schedule"], runs[0]["comparison"], runs[0]["decision"], runs[0]["input_hash"]) for r in runs)
        results.append({"case": name, "repeatable": stable, "median_seconds": statistics.median(r["seconds"] for r in runs), "runs": runs})
    total = sum(len(c["runs"]) for c in results)
    passed = all(c["repeatable"] and all(r["expected_decision_matches"] and all(r["invariants"].values()) for r in c["runs"]) for c in results)
    return {"evaluated_at": datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat(),
            "environment": {"python": platform.python_version(), "os": platform.system()},
            "summary": {"cases": len(results), "runs": total, "all_checks_pass": passed}, "cases": results,
            "limitations": "Small designed synthetic regression/performance benchmark on this machine; no observed factory savings or industrial model-accuracy claim."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = benchmark()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"]))
    return 0 if result["summary"]["all_checks_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
