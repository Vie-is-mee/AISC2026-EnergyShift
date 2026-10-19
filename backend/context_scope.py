"""Conservative, read-only scope triage for the EnergyShift demo.

Indicators are NOT proof of an industry/constraint or a solver verdict.
Only the explicit solver/verifier registry can guarantee enforcement.
"""
from __future__ import annotations
import re

VERSION = "context-scope-1"
RULES = (
    ("PRECEDENCE", "Thứ tự / nhiều công đoạn",
     r"nhiều công đoạn|công đoạn.{0,80}(rồi|trước khi|sau đó|tiếp theo|trước–sau|trước-sau)|trước khi.{0,90}(sấy|nhuộm|đóng gói|lắp ráp|gia công|chuyển|hoàn thành)|precedence|multi.stage|phải .{0,50} trước khi",
     "Chưa hỗ trợ tổng quát quan hệ trước–sau giữa nhiều công đoạn."),
    ("STAFFING", "Nhân lực / ca làm",
     r"công nhân|nhân sự|nhân lực|thiếu người|ca đêm.{0,30}(người|công nhân)|staffing|workforce|nhân công",
     "Chưa tối ưu phân công nhân lực, công ca hoặc chi phí nhân công."),
    ("INVENTORY", "Tồn kho / nguyên vật liệu",
     r"tồn kho|nguyên liệu|vật tư|hết vật liệu|inventory|material shortage|stockout",
     "Chưa lập lịch theo biến động tồn kho nguyên vật liệu."),
    ("TRANSPORT", "Giao vận / tuyến đường",
     r"giao vận|vận chuyển|xe tải|tuyến giao|đường đi|logistics|fleet|truck route",
     "Chưa giải bài toán điều xe hoặc tối ưu tuyến đường."),
    ("PREEMPTION", "Chia nhỏ / ngắt việc",
     r"ngắt quãng|chia nhỏ.{0,30}(lô|việc|đơn)|tạm dừng.{0,30}(lô|sản xuất|công việc)|preempt|splittable job",
     "Một công việc hiện được giả định chạy liên tục trên một máy."),
    ("MULTI_MACHINE", "Một việc dùng nhiều máy đồng thời",
     r"nhiều máy đồng thời|hai máy cùng lúc|2 máy cùng lúc|một lô.{0,40}(nhiều máy|hai máy)|parallel resources",
     "Chưa biểu diễn một công việc dùng đồng thời nhiều máy."),
)


def inspect_scope(work_context: str = "", user_message: str = "") -> dict:
    combined = " ".join((work_context or "", user_message or ""))[:6000]
    findings = []
    for code, label, expression, reason in RULES:
        match = re.search(expression, combined, flags=re.I)
        if match:
            findings.append({
                "code": code,
                "label": label,
                "matched_excerpt": combined[max(0, match.start()-24): min(len(combined), match.end()+24)],
                "review_reason": reason,
                "status": "NEEDS_ENGINEER_REVIEW",
            })
    return {
        "version": VERSION,
        "status": "REVIEW_REQUIRED" if findings else "NOT_ASSESSED",
        "indicators": findings,
        "engine_constraints_added": False,
        "scope_disclaimer": (
            "Bộ phát hiện chỉ gợi ý điều kiện cần kỹ sư rà soát; không xác nhận tính đầy đủ. "
            "Không phát hiện từ khóa KHÔNG có nghĩa là solver hỗ trợ mọi điều kiện. "
            "Ngữ cảnh và phản hồi AI không tự thêm điều kiện vào lịch hoặc verifier."
        ),
    }
