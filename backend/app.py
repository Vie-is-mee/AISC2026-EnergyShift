"""Local-only demo API. Serve only explicitly public assets, never the repository."""
from dataclasses import asdict
from datetime import datetime, timedelta
import json
from pathlib import Path
import subprocess
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .analysis import analyze
from .validation import parse_json

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ID = "editable-cell"
MAX_BYTES = 512 * 1024
analysis_lock = Lock()
app = FastAPI(title="EnergyShift local demo", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])


def error(status, code, why, field="$", fix="Correct the input and try again"):
    return JSONResponse({"status": "BLOCKED_INVALID", "errors": [
        {"field": field, "code": code, "why": why, "how_to_fix": fix}]}, status_code=status)


@app.middleware("http")
async def local_headers(request, call_next):
    origin = request.headers.get("origin")
    if request.method == "POST" and origin and origin not in (
            "http://" + request.headers.get("host", ""), "https://" + request.headers.get("host", "")):
        return error(403, "FOREIGN_ORIGIN", "Only this local page may submit browser requests")
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


@app.get("/input-model.js")
def input_model_script():
    return FileResponse(ROOT / "input-model.js", media_type="text/javascript")


@app.get("/input-desk.js")
def input_desk_script():
    return FileResponse(ROOT / "input-desk.js", media_type="text/javascript")


@app.get("/api/demo/health")
def health():
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return {"status": "OK", "mode": "LOCAL_SYNTHETIC_DEMO", "schema_version": "demo-3",
            "build_sha": sha or "UNKNOWN", "analysis_busy": analysis_lock.locked()}


@app.get("/api/demo/fixtures")
def fixtures():
    return [{"id": FIXTURE_ID, "name": "Cụm ép phun giả lập · 8 công việc / 3 máy", "source_type": "SYNTHETIC"}]


@app.get("/api/demo/fixtures/{fixture_id}")
def fixture(fixture_id: str):
    if fixture_id != FIXTURE_ID:
        return error(404, "FIXTURE_NOT_FOUND", "Unknown fixture ID")
    return json.loads((ROOT / "backend/fixtures/editable_cell.json").read_text(encoding="utf-8"))


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
        report = await run_in_threadpool(analyze, data, max_candidates=2000)
        report["input_snapshot"] = data
        return report
    except Exception:
        return JSONResponse({"status": "ERROR", "errors": [{"code": "ANALYSIS_ERROR", "why": "Analysis failed; no recommendation was produced"}]}, status_code=500)
    finally:
        analysis_lock.release()
