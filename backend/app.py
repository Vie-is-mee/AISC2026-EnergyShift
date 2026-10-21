"""Demo API with explicit local/Render origins. Never serve the repository."""
from dataclasses import asdict
from datetime import datetime, timedelta
import json
from pathlib import Path
import subprocess
import os
import tempfile
from collections import defaultdict, deque
from time import monotonic
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.cors import CORSMiddleware

from .analysis import analyze
from .validation import parse_json
from .deployment import allowed_hosts, allowed_origins, build_sha
from .http_input import read_json
from .reconciliation import reconcile
from pydantic import ValidationError
from .team import TeamService, TeamError
from .schemas import Model
from .assistant import AssistantService
from .demo_registry import remember_report

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ID = "editable-cell"
FIXTURE_FILES = {"editable-cell": "editable_cell.json", "coordinated-cell": "coordinated_cell.json"}
MAX_BYTES = 512 * 1024
analysis_lock = Lock()
ai_lock = Lock()
team_lock = Lock()
team_service = None
assistant_service = None
workspace_requests = defaultdict(deque)
FRONTEND_ORIGINS = allowed_origins()
app = FastAPI(title="EnergyShift demo", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts())
app.add_middleware(CORSMiddleware, allow_origins=FRONTEND_ORIGINS,
                   allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type", "Authorization"], allow_credentials=False)

from .demo_routes import create_router
app.include_router(create_router(analysis_lock, ai_lock))


def error(status, code, why, field="$", fix="Correct the input and try again"):
    return JSONResponse({"status": "BLOCKED_INVALID", "errors": [
        {"field": field, "code": code, "why": why, "how_to_fix": fix}]}, status_code=status)


@app.middleware("http")
async def local_headers(request, call_next):
    origin = request.headers.get("origin")
    if request.method in ("POST", "DELETE") and origin and origin not in FRONTEND_ORIGINS and origin not in (
            "http://" + request.headers.get("host", ""), "https://" + request.headers.get("host", "")):
        return error(403, "FOREIGN_ORIGIN", "Browser origin is not configured for this demo")
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"
    return response


@app.get("/")
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/app.js")
def javascript():
    return FileResponse(ROOT / "app.js", media_type="text/javascript")


@app.get("/live.css")
def stylesheet():
    return FileResponse(ROOT / "live.css", media_type="text/css")


@app.get("/workspace.css")
def workspace_stylesheet():
    return FileResponse(ROOT / "workspace.css", media_type="text/css")


@app.get("/workspace.js")
def workspace_script():
    return FileResponse(ROOT / "workspace.js", media_type="text/javascript")


@app.get("/input-model.js")
def input_model_script():
    return FileResponse(ROOT / "input-model.js", media_type="text/javascript")


@app.get("/input-desk.js")
def input_desk_script():
    return FileResponse(ROOT / "input-desk.js", media_type="text/javascript")


@app.get("/deployment-config.js")
def deployment_config():
    return FileResponse(ROOT / "deployment-config.js", media_type="text/javascript")


@app.get("/api-client.js")
def api_client_script():
    return FileResponse(ROOT / "api-client.js", media_type="text/javascript")


@app.get("/assistant.js")
def assistant_script():
    return FileResponse(ROOT / "assistant.js", media_type="text/javascript")


@app.get("/ai-csv-import.js")
def ai_csv_script():
    return FileResponse(ROOT / "ai-csv-import.js", media_type="text/javascript")


@app.get("/api/demo/health")
def health():
    sha = build_sha()
    if not sha:
        try:
            sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=2).stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            sha = "UNKNOWN"
    return {"status": "OK", "mode": "HOSTED_SYNTHETIC_DEMO" if build_sha() else "LOCAL_SYNTHETIC_DEMO", "schema_version": "demo-3",
            "build_sha": sha or "UNKNOWN", "analysis_busy": analysis_lock.locked()}


@app.get("/api/demo/fixtures")
def fixtures():
    return [{"id": FIXTURE_ID, "name": "Cụm ép phun giả lập · 8 công việc / 3 máy", "source_type": "SYNTHETIC"},
            {"id": "coordinated-cell", "name": "Phối hợp hai lô · kiểm chứng B2", "source_type": "SYNTHETIC"}]


@app.get("/api/demo/fixtures/{fixture_id}")
def fixture(fixture_id: str):
    if fixture_id not in FIXTURE_FILES:
        return error(404, "FIXTURE_NOT_FOUND", "Unknown fixture ID")
    return json.loads((ROOT / "backend/fixtures" / FIXTURE_FILES[fixture_id]).read_text(encoding="utf-8"))


@app.post("/api/demo/validate")
@app.post("/api/demo/analyze")
async def analyze_request(request: Request):
    if request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
        return error(415, "JSON_REQUIRED", "Use application/json")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BYTES:
            return error(413, "INPUT_TOO_LARGE", "Maximum input is 512 KiB")
    try:
        gate = parse_json(body.decode("utf-8"))
    except UnicodeError:
        return error(422, "INVALID_ENCODING", "JSON must use UTF-8")
    if gate.status != "READY":
        return JSONResponse(asdict(gate), status_code=422)
    data = gate.snapshot
    horizon_minutes = (datetime.fromisoformat(data["horizon"]["end"]) - datetime.fromisoformat(data["horizon"]["start"])) / timedelta(minutes=1)
    if len(data["jobs"]) > 8 or len(data["machines"]) > 3 or horizon_minutes > 48 * 60:
        return error(422, "DEMO_LIMIT", "Local demo supports up to 8 jobs, 3 machines and 48 hours")
    if request.url.path == "/api/demo/validate":
        return {"status": "READY", "input_hash": gate.input_hash, "snapshot": data,
                "note": "Data contract only; schedule verification runs during analysis"}
    if not analysis_lock.acquire(blocking=False):
        return error(409, "ANALYSIS_BUSY", "An analysis is running; wait for it to finish")
    try:
        report = await run_in_threadpool(analyze, data, max_candidates=2000, enable_b2=True, b2_neighborhood_limit=12)
        report["input_snapshot"] = data
        if report.get("status") == "COMPLETED":
            remember_report(report)
        return report
    except Exception:
        return JSONResponse({"status": "ERROR", "errors": [{"code": "ANALYSIS_ERROR", "why": "Analysis failed; no recommendation was produced"}]}, status_code=500)
    finally:
        analysis_lock.release()


@app.post("/api/demo/reconcile")
async def reconcile_request(request: Request):
    raw = await read_json(request)
    try:
        return await run_in_threadpool(reconcile, raw)
    except ValidationError as exc:
        return error(422, "MEASUREMENT_SCHEMA", "; ".join(".".join(map(str,e["loc"]))+": "+e["msg"] for e in exc.errors(include_input=False,include_url=False)))
    except ValueError as exc:
        return error(422, "MEASUREMENT_INVALID", str(exc))


class QueuedInput(Model):
    snapshot: dict
    input_preparation: dict | None = None


def get_team():
    global team_service
    if os.environ.get("ENERGYSHIFT_TEAM_DEMO_ENABLED", "1") != "1":
        raise TeamError(503, "Team demo is disabled by the server")
    with team_lock:
        if team_service is None:
            path=os.environ.get("ENERGYSHIFT_TEAM_DB", str(Path(tempfile.gettempdir())/"energyshift-team-demo.sqlite3"))
            team_service=TeamService(path,analysis_lock=analysis_lock)
        return team_service


def workspace_token(request):
    authorization=request.headers.get("authorization", "")
    return authorization[7:] if authorization.startswith("Bearer ") else ""


def team_error(exc):
    response=error(exc.status,"TEAM_DEMO",exc.message)
    if exc.status==429:response.headers["Retry-After"]="3"
    return response


def get_assistant():
    global assistant_service
    team = get_team()
    with team_lock:
        if assistant_service is None:
            assistant_service = AssistantService(team)
    return assistant_service


@app.post("/api/demo/assistant/requests", status_code=202)
async def assistant_submit(request: Request):
    raw = await read_json(request)
    try:
        return await run_in_threadpool(get_assistant().submit, workspace_token(request), raw)
    except TeamError as exc:
        return team_error(exc)
    except ValidationError:
        return error(422, "ASSISTANT_SCHEMA", "Yêu cầu trợ lý sai cấu trúc hoặc chưa xác nhận gửi dữ liệu.")


@app.get("/api/demo/assistant/requests/{ident}")
async def assistant_get(ident: str, request: Request):
    try:
        return await run_in_threadpool(get_assistant().get, workspace_token(request), ident)
    except TeamError as exc:
        return team_error(exc)


@app.post("/api/demo/assistant/requests/{ident}/review")
async def assistant_review(ident: str, request: Request):
    raw = await read_json(request)
    try:
        return await run_in_threadpool(get_assistant().review, workspace_token(request), ident, raw)
    except TeamError as exc:
        return team_error(exc)
    except ValidationError:
        return error(422, "ASSISTANT_REVIEW", "Cần rà soát nội dung, xác nhận và gửi đúng phiên bản để duyệt.")


@app.post("/api/demo/assistant/requests/{ident}/cancel")
async def assistant_cancel(ident: str, request: Request):
    raw = await read_json(request)
    if raw:
        return error(422,"ASSISTANT_CANCEL","Use an empty JSON object")
    try:
        return await run_in_threadpool(get_assistant().cancel, workspace_token(request), ident)
    except TeamError as exc:
        return team_error(exc)


@app.post("/api/demo/assistant/requests/{ident}/csv-preview")
async def assistant_csv_preview(ident: str, request: Request):
    raw = await read_json(request)
    try:
        return await run_in_threadpool(get_assistant().csv_preview,workspace_token(request),ident,raw)
    except TeamError as exc:
        return team_error(exc)
    except ValidationError:
        return error(422,"CSV_PREVIEW_SCHEMA","Ghép cột hoặc phiên bản xem trước không hợp lệ.")


@app.post("/api/demo/assistant/requests/{ident}/csv-review")
async def assistant_csv_review(ident: str, request: Request):
    raw = await read_json(request)
    try:
        return await run_in_threadpool(get_assistant().csv_review,workspace_token(request),ident,raw)
    except TeamError as exc:
        return team_error(exc)
    except ValidationError:
        return error(422,"CSV_REVIEW_SCHEMA","Bảng/ghép cột/đồng ý rà soát không hợp lệ; chưa thay đổi kế hoạch.")


@app.post("/api/demo/workspaces")
async def create_workspace(request: Request):
    await read_json(request)
    now=monotonic();ip=request.client.host if request.client else "unknown"
    with team_lock:
        for key in list(workspace_requests):
            if not workspace_requests[key] or workspace_requests[key][-1] < now-60:del workspace_requests[key]
        recent=workspace_requests[ip]
        while recent and recent[0] < now-60:recent.popleft()
        if len(recent)>=8 or len(workspace_requests)>512:return team_error(TeamError(429,"Too many workspace creations; retry later"))
        recent.append(now)
    try:return await run_in_threadpool(get_team().create_workspace)
    except TeamError as exc:return team_error(exc)


@app.post("/api/demo/jobs",status_code=202)
async def submit_job(request: Request):
    raw=await read_json(request)
    try:
        data=QueuedInput.model_validate(raw)
        return await run_in_threadpool(get_team().submit,workspace_token(request),data.snapshot,data.input_preparation)
    except ValidationError:return error(422,"JOB_SCHEMA","Use snapshot and optional matching input_preparation")
    except TeamError as exc:return team_error(exc)


@app.get("/api/demo/jobs")
async def job_history(request: Request):
    try:return await run_in_threadpool(get_team().history,workspace_token(request))
    except TeamError as exc:return team_error(exc)


@app.get("/api/demo/jobs/{job_id}")
async def get_job(request: Request,job_id: str):
    try:return await run_in_threadpool(get_team().get,workspace_token(request),job_id)
    except TeamError as exc:return team_error(exc)


@app.post("/api/demo/jobs/{job_id}/cancel")
async def cancel_job(request: Request,job_id: str):
    await read_json(request)
    try:return await run_in_threadpool(get_team().cancel,workspace_token(request),job_id)
    except TeamError as exc:return team_error(exc)


@app.delete("/api/demo/workspaces/current")
async def remove_workspace(request: Request):
    try:return await run_in_threadpool(get_team().delete_workspace,workspace_token(request))
    except TeamError as exc:return team_error(exc)
