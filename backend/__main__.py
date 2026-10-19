"""Offline readiness check: python -m backend path/to/dataset.json."""
import argparse
import json
from dataclasses import asdict
from pathlib import Path

from .validation import parse_json
from .costing import cost_schedule
from .analysis import analyze


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--baseline", action="store_true", help="Independently verify and recost B0")
    mode.add_argument("--analyze", action="store_true", help="Search B1 and evaluate economic policy")
    parser.add_argument("--b2", action="store_true", help="Coordinated CP-SAT, with --analyze")
    parser.add_argument("--b2-neighbors",type=int,choices=range(25),default=0,help="Bounded alternative order/machine domains (0..24)")
    args = parser.parse_args()
    if args.b2 and not args.analyze:
        parser.error("--b2 requires --analyze")
    if args.b2_neighbors and not args.b2:
        parser.error("--b2-neighbors requires --analyze --b2")
    try:
        result = parse_json(args.dataset.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as exc:
        print(json.dumps({"status": "BLOCKED_INVALID", "errors": [{"field": "$", "code": "READ_ERROR", "why": str(exc), "how_to_fix": "Use a readable UTF-8 JSON file"}]}))
        return 1
    if args.analyze and result.status == "READY":
        report = analyze(result.snapshot, enable_b2=args.b2, b2_neighborhood_limit=args.b2_neighbors)
        print(json.dumps(report, ensure_ascii=True, indent=2))
        return 0 if report["status"] == "COMPLETED" else 1
    if args.baseline and result.status == "READY":
        report = cost_schedule(result.snapshot, result.snapshot["current_schedule"])
        report["plan_id"] = "B0"
        report["status"] = "BASELINE_VERIFIED" if report["status"] == "COSTED" else "BASELINE_INVALID"
        print(json.dumps(report, ensure_ascii=True, indent=2))
        return 0 if report["status"] == "BASELINE_VERIFIED" else 1
    print(json.dumps(asdict(result), ensure_ascii=True, indent=2))
    return 0 if result.status == "READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
