"""Offline readiness check: python -m backend path/to/dataset.json."""
import argparse
import json
from dataclasses import asdict
from pathlib import Path

from .validation import parse_json
from .costing import cost_schedule


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--baseline", action="store_true", help="Independently verify and recost B0")
    args = parser.parse_args()
    try:
        result = parse_json(args.dataset.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as exc:
        print(json.dumps({"status": "BLOCKED_INVALID", "errors": [{"field": "$", "code": "READ_ERROR", "why": str(exc), "how_to_fix": "Use a readable UTF-8 JSON file"}]}))
        return 1
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
