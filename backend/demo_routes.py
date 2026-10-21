"""Presentation routes, isolated from the established demo-3 contract."""
import json
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import ValidationError, Field
from starlette.concurrency import run_in_threadpool

from .analysis import analyze
from .demo_manual import ManualRequest, preview_manual
from .factory_core import analyze_factory
from .factory_routing import analyze_factory_routing
from .factory_import import inspect_spreadsheet, template_bytes, MAX_UPLOAD_BYTES
from .demo_context_report import build_context_report
from .demo_sources import source_audit, default_selection, upload_pair
from .demo_ai import ExplainRequest, explain, status
from .demo_registry import remember_report, get_report
from .openrouter import account_free_limits, free_report_endpoint_status
from .http_input import read_json
from .textile_demo import TextileRequest, optimize, SOURCE_DEFAULTS
from .ai_assistant import InspectRequest, ApplyRequest, PlanReportRequest, inspect_csv, apply_patches, write_plan_report, ai_status
from .validation import parse_json
from .schemas import Model

ROOT = Path(__file__).resolve().parents[1]


class ReplayRequest(Model):
    case: str = Field(default="base", pattern=r"^(base|extra_cost|unknown_cost)$")

class SourceUploadRequest(Model):
    input_text: str = Field(min_length=1, max_length=4 * 1024 * 1024)
    output_text: str = Field(min_length=1, max_length=4 * 1024 * 1024)
    input_name: str = Field(default="Input_JSON_Schedule_Optimization.json", min_length=1, max_length=160)
    output_name: str = Field(default="Output_JSON_Schedule_Optimization.json", min_length=1, max_length=160)


class FactoryContextRequest(Model):
    input_hash: str = Field(min_length=1, max_length=90)
    context: str = Field(default="", max_length=1200)


def create_router(analysis_lock, ai_lock):
    router = APIRouter()

    def failure(message, code=422):
        return JSONResponse({"status": "BLOCKED", "message": message}, status_code=code)

    def synthetic(case="base"):
        data = json.loads((ROOT / "backend/fixtures/editable_cell.json").read_text(encoding="utf-8"))
        if case != "base":
            data["cost_scope"]["excluded_review"]["LABOR_OVERTIME"].update(
                status="UNKNOWN" if case == "unknown_cost" else "BOUNDED",
                incremental_min_vnd=None if case == "unknown_cost" else 200000,
                incremental_max_vnd=None if case == "unknown_cost" else 200000,
                reference="synthetic-presentation-" + case)
        report = analyze(data, max_candidates=2000, enable_b2=True, b2_neighborhood_limit=12)
        report["input_snapshot"] = data
        report["presentation_case"] = case
        return remember_report(report)

    @router.get("/factory-lab.js")
    def factory_lab_script():
        return FileResponse(ROOT / "factory-lab.js", media_type="text/javascript")

    @router.get("/energy-chart.js")
    def energy_chart_script():
        return FileResponse(ROOT / "energy-chart.js", media_type="text/javascript")

    @router.get("/demo-studio.js")
    def studio_script():
        return FileResponse(ROOT / "demo-studio.js", media_type="text/javascript")

    @router.get("/demo-interactive-gantt.js")
    def manual_gantt_script():
        return FileResponse(ROOT / "demo-interactive-gantt.js", media_type="text/javascript")

    @router.get("/demo-studio.css")
    def studio_css():
        return FileResponse(ROOT / "demo-studio.css", media_type="text/css")

    @router.get("/demo-workspace.js")
    def workspace_script():
        return FileResponse(ROOT / "demo-workspace.js", media_type="text/javascript")

    @router.get("/demo-view-model.js")
    def view_model_script():
        return FileResponse(ROOT / "demo-view-model.js", media_type="text/javascript")

    @router.get("/ai-desk.js")
    def ai_script():
        return FileResponse(ROOT / "ai-desk.js", media_type="text/javascript")

    @router.get("/api/factory/example")
    async def factory_example():
        # Separate from textile and injection-molding demo inputs.
        return json.loads((ROOT / "backend/fixtures/factory_generic_demo.json").read_text(encoding="utf-8"))

    @router.get("/api/factory/packaging-example")
    async def factory_packaging_example():
        return json.loads((ROOT / "backend/fixtures/factory_packaging_demo.json").read_text(encoding="utf-8"))

    @router.get("/api/factory/changeover-example")
    async def factory_changeover_example():
        return json.loads((ROOT / "backend/fixtures/factory_changeover_demo.json").read_text(encoding="utf-8"))

    @router.get("/api/factory/multistage-example")
    async def factory_multistage_example():
        return json.loads((ROOT / "backend/fixtures/factory_multistage_demo.json").read_text(encoding="utf-8"))

    @router.get("/api/factory/import/template")
    async def factory_import_template(file_type: str = "xlsx", version: str = "factory-1"):
        if file_type not in ("csv", "xlsx") or version not in ("factory-1", "factory-2", "changeover"):
            return failure("Chỉ chấp nhận csv/xlsx và factory-1/factory-2/changeover.")
        fixture = {"factory-1": "factory_generic_demo.json",
                   "factory-2": "factory_multistage_demo.json",
                   "changeover": "factory_changeover_demo.json"}[version]
        factory = json.loads((ROOT / "backend/fixtures" / fixture).read_text(encoding="utf-8"))
        data = await run_in_threadpool(template_bytes, factory, file_type)
        media = ("text/csv; charset=utf-8" if file_type == "csv" else
                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        return Response(content=data, media_type=media, headers={
            "Content-Disposition": f'attachment; filename="factory-{version}-example.{file_type}"',
            "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    @router.post("/api/factory/import/preview")
    async def factory_import_preview(request: Request, file_type: str = ""):
        if file_type not in ("csv", "xlsx"):
            return JSONResponse({"status": "BLOCKED", "code": "IMPORT_FILE_TYPE",
                                 "ready_for_analysis": False}, status_code=422)
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                return JSONResponse({"status": "BLOCKED", "code": "IMPORT_FILE_SIZE",
                                     "ready_for_analysis": False}, status_code=413)
            chunks.append(chunk)
        return await run_in_threadpool(inspect_spreadsheet, b"".join(chunks), file_type)

    @router.post("/api/factory/analyze")
    async def factory_analyze(request: Request):
        try:
            payload = await read_json(request)
            allowed = {"factory", "mode", "objective_mode", "max_makespan_slack_minutes"}
            if (not isinstance(payload, dict) or
                    not {"factory", "mode"} <= set(payload) or not set(payload) <= allowed):
                return failure("Yêu cầu cần factory, mode; các trường tùy chọn: objective_mode và max_makespan_slack_minutes.")
            if not analysis_lock.acquire(blocking=False):
                return failure("Engine đang chạy một phép phân tích.", 409)
            try:
                factory = payload["factory"]
                version = factory.get("schema_version") if isinstance(factory, dict) else None
                engine = analyze_factory_routing if version == "factory-2" else analyze_factory
                return await run_in_threadpool(
                    engine, factory, mode=payload["mode"],
                    objective_mode=payload.get("objective_mode", "ENERGY"),
                    max_makespan_slack_minutes=payload.get("max_makespan_slack_minutes", 0))
            finally:
                analysis_lock.release()
        except (ValueError, TypeError, OverflowError):
            return failure("Dữ liệu factory-1 không hợp lệ; không xuất lịch hay chi phí.")

    @router.get("/api/demo/studio/source")
    async def source():
        try:
            result = await run_in_threadpool(source_audit)
            result["default_selection"] = default_selection(result)
            return result
        except (ValueError, OSError, KeyError):
            return failure("Không đọc được tệp nguồn. Kiểm tra hai JSON và ZIP ở thư mục dự án.", 503)

    @router.get("/api/demo/studio/ai/status")
    def ai_connection():
        return status()

    @router.get("/api/demo/studio/ai/diagnostics")
    async def ai_diagnostics():
        return {**status(), "account": await run_in_threadpool(account_free_limits),
                "free_endpoints": await run_in_threadpool(free_report_endpoint_status)}

    @router.post("/api/demo/studio/source/upload")
    async def upload_source(request: Request):
        try:
            settings = SourceUploadRequest.model_validate(await read_json(request, max_bytes=18 * 1024 * 1024))
            result = await run_in_threadpool(upload_pair, settings.input_text, settings.output_text,
                                             settings.input_name, settings.output_name)
            result.update(default_selection=default_selection(result), defaults=SOURCE_DEFAULTS, origin="UPLOADED_FILES")
            return result
        except ValidationError:
            return failure("Chọn đủ hai tệp JSON Input và Output; mỗi tệp tối đa 4 MiB.")
        except (ValueError, UnicodeError) as error:
            return failure(str(error))

    @router.post("/api/demo/studio/replay")
    async def replay(request: Request):
        try:
            settings = ReplayRequest.model_validate(await read_json(request))
        except ValidationError:
            return failure("Chỉ chọn base, extra_cost hoặc unknown_cost.")
        if not analysis_lock.acquire(blocking=False):
            return failure("Một phân tích đang chạy. Thử lại khi hoàn tất.", 409)
        try:
            return await run_in_threadpool(synthetic, settings.case)
        finally:
            analysis_lock.release()

    @router.post("/api/demo/studio/textile")
    async def textile(request: Request):
        raw = await read_json(request)
        try:
            settings = TextileRequest.model_validate(raw)
        except ValidationError:
            return failure("Cần chọn đơn vị, bước thời gian, tiền tệ và xác nhận phạm vi hợp lệ.")
        if not analysis_lock.acquire(blocking=False):
            return failure("Một phân tích đang chạy. Thử lại khi hoàn tất.", 409)
        try:
            report = await run_in_threadpool(optimize, settings)
            return remember_report(report)
        except (ValueError, KeyError):
            return failure("Không thể tính với lựa chọn này. Kiểm tra hash nguồn, đơn vị, dòng được chọn và xác nhận phạm vi.")
        finally:
            analysis_lock.release()

    @router.post("/api/demo/studio/context")
    async def factory_context(request: Request):
        try:
            settings = FactoryContextRequest.model_validate(await read_json(request))
            evidence = get_report(settings.input_hash)
            if evidence is None:
                return failure("Bằng chứng đã thay đổi hoặc không còn trong phiên. Chạy phân tích lại.", 409)
            return await run_in_threadpool(build_context_report, evidence, settings.context)
        except (ValidationError, ValueError):
            return failure("Ngữ cảnh không hợp lệ. Cần tối đa 1200 ký tự và một bản phân tích hiện hành.")

    @router.post("/api/demo/studio/manual")
    async def manual_move(request: Request):
        try:
            settings = ManualRequest.model_validate(await read_json(request))
            evidence = get_report(settings.input_hash)
            if evidence is None:
                return failure("Lịch đã hết hiệu lực. Hãy chạy lại phân tích.", 409)
            if not analysis_lock.acquire(blocking=False):
                return failure("Engine đang phân tích. Thử lại khi hoàn tất.", 409)
            try:
                result = await run_in_threadpool(preview_manual, settings, evidence)
                if result.get("updated_report"):
                    remember_report(result["updated_report"])
                return result
            finally:
                analysis_lock.release()
        except (ValidationError, ValueError, KeyError, TypeError, OverflowError):
            return failure("Không thể dịch lịch. Kiểm tra công việc, máy, ô thời gian và nguồn dữ liệu hiện hành.")

    @router.post("/api/demo/studio/ai")
    async def explain_evidence(request: Request):
        raw = await read_json(request)
        try:
            settings = ExplainRequest.model_validate(raw)
            if not settings.consent:
                return failure("Cần đồng ý gửi bằng chứng tới OpenRouter.")
            evidence = await run_in_threadpool(source_audit, settings.input_hash or None) if settings.scenario == "source" else get_report(settings.input_hash)
            if evidence is None:
                return failure("Bằng chứng chưa có trong phiên máy chủ. Chạy lại kịch bản trước khi gọi AI.", 409)
            if settings.scenario in ("synthetic", "core") and evidence.get("schema_version") == "textile-demo-1":
                return failure("Bằng chứng không thuộc kịch bản SYNTHETIC.")
            if settings.scenario == "textile" and evidence.get("schema_version") != "textile-demo-1":
                return failure("Bằng chứng không thuộc nhóm nguồn ngành dệt.")
            if not ai_lock.acquire(blocking=False):
                return failure("AI đang xử lý một yêu cầu. Chờ kết quả trước khi gửi tiếp.", 409)
            try:
                return await run_in_threadpool(explain, settings, evidence)
            finally:
                ai_lock.release()
        except (ValidationError, ValueError, OSError):
            return failure("Bằng chứng, yêu cầu hoặc xác nhận gửi AI chưa hợp lệ.")

    @router.get("/api/demo/ai/status")
    def legacy_ai_status():
        return ai_status()

    @router.post("/api/demo/ai/inspect")
    async def inspect(request: Request):
        raw = await read_json(request)
        try:
            settings = InspectRequest.model_validate(raw)
            if not ai_lock.acquire(blocking=False):
                return failure("AI đang bận.", 409)
            try:
                return await run_in_threadpool(inspect_csv, settings)
            finally:
                ai_lock.release()
        except (ValidationError, ValueError):
            return failure("CSV hoặc yêu cầu AI không hợp lệ.")

    @router.post("/api/demo/ai/apply")
    async def apply(request: Request):
        raw = await read_json(request)
        try:
            return apply_patches(ApplyRequest.model_validate(raw))
        except (ValidationError, ValueError):
            return failure("Bản gốc đã đổi hoặc thay đổi ô chưa được duyệt đúng cách.")

    @router.post("/api/demo/ai/report")
    async def report(request: Request):
        raw = await read_json(request)
        try:
            settings = PlanReportRequest.model_validate(raw)
            if not settings.consent:
                return failure("Cần đồng ý gửi bằng chứng tới OpenRouter.")
            gate = parse_json(json.dumps(settings.dataset))
            if gate.status != "READY":
                return failure("Đầu vào chưa qua cổng kiểm tra.")
            data = gate.snapshot
            from datetime import datetime, timedelta
            if len(data["jobs"]) > 8 or len(data["machines"]) > 3 or datetime.fromisoformat(data["horizon"]["end"]) - datetime.fromisoformat(data["horizon"]["start"]) > timedelta(hours=48):
                return failure("Vượt giới hạn demo: 8 công việc, 3 máy, 48 giờ.")
            if not ai_lock.acquire(blocking=False):
                return failure("AI đang bận.", 409)
            try:
                if not analysis_lock.acquire(blocking=False):
                    return failure("Engine đang bận.", 409)
                try:
                    analysis = await run_in_threadpool(analyze, data, max_candidates=2000, enable_b2=True, b2_neighborhood_limit=12)
                finally:
                    analysis_lock.release()
                return await run_in_threadpool(write_plan_report, analysis, settings.model)
            finally:
                ai_lock.release()
        except (ValidationError, ValueError, KeyError):
            return failure("Yêu cầu hoặc đầu vào chưa hợp lệ.")

    return router
