"""One optional REAL provider call on synthetic EnergyShift data.

Usage: python ops/sector_ai_live.py --case plastic --allow-live-api
       python ops/sector_ai_live.py --case textile --allow-live-api
No private customer data, solver execution, or changes to factory profiles.
Only sanitized evaluation metadata is saved under work/aisc_round2.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.openrouter import chat_json, load_config
from backend.assistant import SYSTEM, SOLVER_SCOPE, Proposal
from backend.context_scope import inspect_scope
from backend.validation import validate_input


CASES = {
    "plastic": {
        "work_context": (
            "Xưởng ép phun nhựa một công đoạn, sử dụng máy và khuôn đã khai báo. "
            "Mỗi lô chạy liên tục trên một máy phù hợp, cần xem xét giá điện theo giờ."
        ),
        "user_message": (
            "Máy M1 dự kiến bảo trì từ 13:00 đến 15:00 ngày 19/10/2026. "
            "Tôi muốn hỏi cần xác minh gì trước khi đề xuất điều chỉnh J1, "
            "không được giả định chi phí mới chưa đo."
        ),
    },
    "textile": {
        "work_context": (
            "Một cơ sở dệt may có công đoạn nhuộm trước khi sấy, "
            "và việc bố trí công nhân theo ca. "
            "Chú ý dữ liệu lịch gửi kèm CHỈ là fixture giả lập kiểm tra luồng AI, "
            "không phải dữ liệu nhà máy dệt."
        ),
        "user_message": (
            "Nếu đơn J1 bắt buộc nhuộm xong trước khi sấy và ca đêm thiếu công nhân, "
            "những thông tin hoặc ràng buộc nào chưa thể áp dụng bằng bộ giải hiện tại? "
            "Chỉ tư vấn bước xác minh, không đề xuất lịch đã kiểm chứng."
        ),
    },
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", required=True, choices=sorted(CASES))
    parser.add_argument("--allow-live-api", action="store_true")
    parser.add_argument("--free-router", action="store_true", help="Temporarily use OpenRouter's free model router; do not edit .env")
    args = parser.parse_args()
    if not args.allow_live_api:
        parser.error("A live external API call requires --allow-live-api.")
    config = load_config()
    if not config.get("OPENROUTER_API_KEY") or not config.get("OPENROUTER_MODEL"):
        print("CONFIG_MISSING; no external call made")
        return 2
    if args.free_router:
        config["OPENROUTER_MODEL"] = "openrouter/free"
    if not (config["OPENROUTER_MODEL"].endswith(":free") or config["OPENROUTER_MODEL"] == "openrouter/free"):
        print("Non-free model configured; refusing live API call without separate approval.")
        return 3

    fixture = ROOT / "backend" / "fixtures" / "coordinated_cell.json"
    data = json.loads(fixture.read_text(encoding="utf-8"))
    gate = validate_input(data)
    if gate.status != "READY" or gate.snapshot["metadata"]["source_type"] != "SYNTHETIC":
        print("Fixture not ready or not synthetic. Nothing sent.")
        return 4

    case = CASES[args.case]
    scope_review = inspect_scope(case["work_context"], case["user_message"])
    evidence = {"snapshot": gate.snapshot, "user_message": case["user_message"],
                "work_context": case["work_context"], "solver_scope": SOLVER_SCOPE,
                "scope_review": scope_review}
    reply = chat_json(
        [{"role": "system", "content": SYSTEM},
         {"role": "user", "content": json.dumps(evidence, ensure_ascii=False)}],
        config=config, timeout=70, max_completion_tokens=1600,
        response_schema=Proposal.model_json_schema()
    )
    output = {
        "case": args.case,
        "source_type": "SYNTHETIC",
        "fixture": "backend/fixtures/coordinated_cell.json",
        "fixture_sha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
        "model_requested": config["OPENROUTER_MODEL"],
        "model_reported": reply.get("served_model"),
        "status": reply.get("status"),
        "http_status": reply.get("http_status"),
        "error_category": reply.get("error_category"),
        "latency_seconds": reply.get("latency_seconds"),
        "finish_reason": reply.get("finish_reason"),
        "tokens_used": (reply.get("usage") or {}).get("total_tokens"),
        "scope_review": scope_review,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "review_level": "SINGLE_REAL_MODEL_SMOKE_NOT_A_QUALITY_BENCHMARK",
        "ai_proposal": None,
        "contract_valid": False,
    }
    if reply.get("status") == "OK":
        try:
            proposal = Proposal.model_validate(reply.get("answer"))
            job_ids = {j["id"] for j in gate.snapshot["jobs"]}
            if any(set(item.job_ids) - job_ids for item in proposal.observations):
                raise ValueError("Referenced nonexistent job")
            output["ai_proposal"] = proposal.model_dump()
            output["contract_valid"] = True
        except (ValueError, TypeError) as exc:
            output["contract_failure_type"] = type(exc).__name__
    dest = ROOT / "work" / "aisc_round2"
    dest.mkdir(parents=True, exist_ok=True)
    suffix = "_free_router" if args.free_router else ""
    (dest / f"sector_ai_{args.case}{suffix}.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: output[k] for k in (
        "case", "status", "model_requested", "latency_seconds", "error_category",
        "contract_valid", "tokens_used", "review_level"
    )}, ensure_ascii=False))
    return 0 if output["contract_valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
