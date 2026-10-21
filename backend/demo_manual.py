"""Manual what-if schedule drafts. Strictly server-owned snapshots and independent recosting.

Never change the source fixture, original reports or the factory's approved schedule.
"""
from copy import deepcopy
from datetime import datetime, timedelta
import hashlib
import json

from pydantic import Field

from .costing import cost_schedule
from .schemas import Model
from .textile_demo import TextileRequest, prepare, verify, energy


class JobMove(Model):
    job_id: str = Field(min_length=1, max_length=120)
    start_slot: int = Field(ge=0, le=2000)
    machine_id: str = Field(min_length=1, max_length=120)


class ManualRequest(Model):
    input_hash: str = Field(min_length=1, max_length=90)
    base_plan: str = Field(pattern=r"^(B0|B1|B2|MANUAL)$")
    moves: list[JobMove] = Field(min_length=1, max_length=8)


def preview_manual(request: ManualRequest, evidence: dict) -> dict:
    if request.input_hash != evidence.get("input_hash"):
        raise ValueError("Bằng chứng đã đổi; cần chạy lại trước khi dịch lịch.")
    if evidence.get("status") != "COMPLETED":
        raise ValueError("Chưa có phân tích hoàn chỉnh để sửa lịch.")
    if len({move.job_id for move in request.moves}) != len(request.moves):
        raise ValueError("Không được khai báo trùng công việc.")
    base = evidence.get("plans", {}).get(request.base_plan)
    if not base or base.get("cost") is None or base.get("verification", {}).get("status") != "PASS":
        raise ValueError("Chỉ được dùng lịch gốc đã kiểm chứng PASS.")

    textile = evidence.get("schema_version") == "textile-demo-1"
    if textile:
        experiment = TextileRequest.model_validate(evidence["manifest"]["mapping"])
        jobs, price, solar, horizon, manifest, original_hash = prepare(experiment)
        if original_hash != evidence.get("original_engine_hash", evidence["input_hash"]):
            raise ValueError("Nguồn hoặc ánh xạ đã đổi; không dùng lại lịch cũ.")
        base_schedule = {j["job_id"]: j["start_slot"] for j in base["schedule"]}
        by_job = {j["id"]: j for j in jobs}
        candidate = dict(base_schedule)
        for move in request.moves:
            if move.job_id not in by_job or move.machine_id != by_job[move.job_id]["machine"]:
                raise ValueError("Ngành dệt chỉ dịch thời gian trên máy tương thích đã khai báo.")
            candidate[move.job_id] = move.start_slot
        if candidate == base_schedule:
            raise ValueError("Không có thay đổi thời gian để kiểm chứng.")
        check = verify(jobs, candidate, horizon, manifest["precedence"], manifest["collisions"])
        cost = energy(jobs, candidate, price, solar, experiment.step_minutes,
                      manifest["cost_policy"]["effective_cost_per_move"]) if check["status"] == "PASS" else None
        plan = {"schedule": [{"job_id": j["id"], "task": j["task"],
                             "machine_id": j["machine"], "start_slot": candidate[j["id"]],
                             "end_slot": candidate[j["id"]] + j["duration"],
                             "original_start_slot": j["start"]} for j in jobs],
                "verification": check, "cost": cost}
        baseline = evidence["plans"]["B0"].get("cost")
        comparable = baseline["total"] if baseline else None
        measured = cost["total"] if cost else None
        currency = evidence["currency"]
    else:
        snapshot = evidence.get("input_snapshot")
        if not snapshot:
            raise ValueError("Thiếu dữ liệu gốc của lịch.")
        horizon = datetime.fromisoformat(snapshot["horizon"]["start"])
        schedule = base["schedule"]
        base_schedule = {item["job_id"]: dict(item) for item in schedule}
        by_job = {job["id"]: job for job in snapshot["jobs"]}
        candidate = deepcopy(base_schedule)
        for move in request.moves:
            job = by_job.get(move.job_id)
            if job is None or move.machine_id not in job["eligible"]:
                raise ValueError("Công việc hoặc máy không hợp lệ.")
            candidate[move.job_id] = {"job_id": move.job_id, "machine_id": move.machine_id,
                                       "start": (horizon + timedelta(minutes=30 * move.start_slot)).isoformat()}
        if candidate == base_schedule:
            raise ValueError("Không có thay đổi công việc để kiểm chứng.")
        evaluated = cost_schedule(snapshot, list(candidate.values()))
        check, cost = evaluated["verification"], evaluated["cost"]
        plan = {"schedule": sorted(candidate.values(), key=lambda a: a["job_id"]),
                "verification": check, "cost": cost}
        baseline = evidence["plans"]["B0"].get("cost")
        comparable = baseline["total_vnd"] if baseline else None
        measured = cost["total_vnd"] if cost else None
        currency = "VND"
    changes = []
    for move in request.moves:
        if textile:
            old = base_schedule[move.job_id]
            new = candidate[move.job_id]
            if old != new:
                changes.append({"job_id": move.job_id, "from_slot": old, "to_slot": new,
                                "machine_id": move.machine_id})
        elif candidate[move.job_id] != base_schedule[move.job_id]:
            changes.append({"job_id": move.job_id, "from": base_schedule[move.job_id],
                            "to": candidate[move.job_id]})
    plan["changes"] = changes
    comparison = {"baseline_cost": comparable, "draft_cost": measured,
                  "saving_vs_b0": comparable - measured if comparable is not None and measured is not None else None,
                  "currency": currency, "only_modeled_cost": True,
                  "review_required": True}
    result = {"status": "PASS" if check["status"] == "PASS" else "FAIL",
              "input_hash": evidence["input_hash"], "base_plan": request.base_plan,
              "verification": check, "comparison": comparison, "candidate": plan,
              "review_required": True,
              "message": "Lịch thử nghiệm PASS trong phạm vi khai báo; cần phê duyệt ngoài hệ thống." if cost
                         else "Lịch đề xuất vi phạm ràng buộc; không được xuất chi phí."}
    if cost is not None:
        updated = deepcopy(evidence)
        source_hash = updated.get("original_engine_hash", evidence["input_hash"])
        proof = {"source": evidence["input_hash"], "base": request.base_plan,
                 "schedule": plan["schedule"]}
        draft_hash = "sha256:" + hashlib.sha256(json.dumps(proof, sort_keys=True).encode()).hexdigest()
        updated["origin_input_hash"] = evidence["input_hash"]
        updated["original_engine_hash"] = source_hash
        updated["input_hash"] = draft_hash
        updated["plans"]["MANUAL"] = plan
        updated["decision"] = {"kind": "REVIEW_REQUIRED" if textile else "MEASURE_FIRST",
                               "selected_plan": "MANUAL",
                               "reason_codes": ["UNAPPROVED_MANUAL_DRAFT"],
                               "reason": "Lịch thử nghiệm chưa được phê duyệt. Chi phí ngoài mô hình và các điều kiện xưởng cần rà soát."}
        updated["manual_review"] = {"origin_hash": evidence["input_hash"],
                                    "base_plan": request.base_plan, "changes": changes,
                                    "status": "NEEDS_HUMAN_REVIEW"}
        result["updated_report"] = updated
    return result
