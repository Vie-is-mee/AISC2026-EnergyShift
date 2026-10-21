"""Deterministic factory context triage and evidence memo; not an LLM judgment."""
from .context_scope import inspect_scope


def build_context_report(evidence: dict, context: str) -> dict:
    context = (context or "").strip()
    if len(context) > 1200:
        raise ValueError("Ngữ cảnh tối đa 1200 ký tự.")
    kind = evidence.get("schema_version") == "textile-demo-1"
    if not evidence.get("plans"):
        raise ValueError("Cần chạy phân tích để có bằng chứng.")
    inspection = inspect_scope(context)
    plans = []
    for code, plan in evidence["plans"].items():
        cost = plan.get("cost")
        verified = plan.get("verification", {})
        cost_value = (cost.get("total") if kind else cost.get("total_vnd")) if cost else None
        plans.append({"code": code, "verification": verified.get("status", "UNKNOWN"),
                      "checked_jobs": verified.get("job_count", len(verified.get("jobs", []))),
                      "modeled_cost": cost_value})
    baseline = next((p for p in plans if p["code"] == "B0"), None)
    candidate = next((p for p in plans if p["code"] == evidence.get("decision", {}).get("selected_plan")), None)
    saving = None
    if (baseline and candidate and baseline["verification"] == "PASS" and
            candidate["verification"] == "PASS" and baseline["modeled_cost"] is not None and
            candidate["modeled_cost"] is not None):
        saving = baseline["modeled_cost"] - candidate["modeled_cost"]
    caveats = ([
        "Chỉ một nhóm công việc nguồn được chọn; các dòng thiếu chế độ và phần lịch còn lại chưa được kiểm chứng.",
        "Bước thời gian, công suất, đơn vị giá, mặt trời và nhãn tiền tệ do người dùng chọn để thí nghiệm.",
        "Chưa đủ chuỗi lô, lịch giao thật, tồn kho, nhân công, chi phí chuyển dịch hay ROI xưởng."
    ] if kind else [
        "Chi phí so sánh chỉ gồm điện chạy việc và setup/khuôn theo fixture; không phải tổng vận hành.",
        "Sai số công suất và chi phí ngoài mô hình cần rà soát theo economic_assessment.",
        "Đây là dữ liệu SYNTHETIC hoặc phạm vi demo-3, không phải đo lường nhà máy thật."
    ])
    return {
        "status": "REVIEW_REQUIRED", "input_hash": evidence["input_hash"],
        "source_type": evidence["source_type"], "factory_context": context,
        "context_provided": bool(context), "constraint_indicators": inspection["indicators"],
        "scope_note": inspection["scope_disclaimer"], "engine_constraints_added": False,
        "plans": plans, "selected_plan": evidence.get("decision", {}).get("selected_plan"),
        "decision": evidence.get("decision", {}).get("kind"),
        "modeled_saving_vs_b0": saving,
        "currency": evidence["currency"] if kind else "VND",
        "caveats": caveats,
        "recommended_next_actions": [
            "Đối chiếu các điều kiện vận hành thực tế với giới hạn verifier đang hỗ trợ.",
            "Xác nhận đơn vị, nguồn giá điện, thông số máy và mốc giao hàng trước khi ra quyết định.",
            "Phê duyệt/rà soát chi phí phát sinh, rủi ro và các công việc ngoài lịch mô phỏng."
        ],
        "human_approval_required": True
    }
