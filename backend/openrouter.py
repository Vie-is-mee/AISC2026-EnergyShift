"""Small backend-only OpenRouter client. Credentials never enter prompts or reports."""
import json
import os
import re
from pathlib import Path
from time import perf_counter
import urllib.error
import urllib.request


def load_config(path=None):
    path = Path(path) if path else Path(__file__).resolve().parents[1] / ".env"
    values = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() in ("OPENROUTER_API_KEY", "OPENROUTER_MODEL"):
                values[key.strip()] = value.strip().strip("\"'")
    return {key: os.environ.get(key, values.get(key, ""))
            for key in ("OPENROUTER_API_KEY", "OPENROUTER_MODEL")}


# Exact free IDs used only for step-4 reports; other AI subsystems keep separate policies.
REPORT_FREE_MODELS = ("minimax/minimax-m3.1-flash:free", "xingchen-agi/xing4.0-29b-a4b:free")


def free_report_endpoint_status():
    """Read-only model catalog check; no key, factory data or generation request.

    An endpoint count is a snapshot, not a proof that JSON-mode routing succeeds.
    Never interpret a failed catalog lookup as zero providers.
    """
    status = []
    for model in REPORT_FREE_MODELS:
        url = "https://openrouter.ai/api/v1/models/" + model + "/endpoints"
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                payload = json.load(response)
            endpoints = payload.get("data", {}).get("endpoints")
            if not isinstance(endpoints, list):
                raise ValueError("Missing endpoint inventory")
            status.append({"model": model, "endpoints": len(endpoints),
                           "status": "LISTED" if endpoints else "NO_ENDPOINTS"})
        except (OSError, ValueError, TypeError, AttributeError, KeyError):
            status.append({"model": model, "endpoints": None, "status": "UNKNOWN"})
    return {"status": "OK", "models": status,
            "note": "Public endpoint inventory only; routing, JSON parameter compatibility and rate limits may differ."}


def account_free_limits():
    """Read only the public-facing free allowance; never return financial/key metadata."""
    config = load_config()
    key = config.get("OPENROUTER_API_KEY")
    if not key:
        return {"status": "CONFIG_MISSING"}
    request = urllib.request.Request("https://openrouter.ai/api/v1/key", headers={"Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            data = json.load(response).get("data", {})
        limits = data.get("free_model_daily_requests") or {}
        safe = {k: v for k, v in limits.items() if k in ("used", "limit", "remaining") and type(v) is int and v >= 0}
        return {"status": "OK", "free_model_daily_requests": safe}
    except urllib.error.HTTPError as exc:
        return {"status": "HTTP_ERROR", "http_status": exc.code}
    except (OSError, ValueError, AttributeError, TypeError):
        return {"status": "UNAVAILABLE"}


def chat_json(messages, *, config=None, timeout=45, max_completion_tokens=1500,
              reasoning_enabled=None, reasoning_effort=None, response_schema=None, free_only=False):
    if type(max_completion_tokens) is not int or not 1 <= max_completion_tokens <= 6000:
        raise ValueError("Completion budget must be 1..6000")
    config = load_config() if config is None else config
    key, model = config.get("OPENROUTER_API_KEY", ""), config.get("OPENROUTER_MODEL", "")
    if not key or not model:
        return {"status": "CONFIG_MISSING", "latency_seconds": 0, "usage": None}
    if free_only and model not in REPORT_FREE_MODELS:
        return {"status": "FREE_MODEL_REQUIRED", "latency_seconds": 0, "usage": None}
    body = {"model": model, "messages": messages, "stream": False, "temperature": 0,
            "max_completion_tokens": max_completion_tokens, "response_format": {"type": "json_object"}}
    if free_only:
        body["provider"] = {"max_price": {"prompt": 0, "completion": 0, "request": 0},
                            "require_parameters": True}
    if reasoning_enabled is not None:
        body["reasoning"] = {"enabled": bool(reasoning_enabled), "exclude": True}
    if reasoning_effort is not None:
        if reasoning_effort not in ("minimal", "low", "medium", "high") or reasoning_enabled is False:
            raise ValueError("Reasoning effort requires enabled reasoning and a supported level")
        body.setdefault("reasoning", {"exclude": True})["effort"] = reasoning_effort
    if response_schema is not None:
        body["response_format"] = {"type":"json_schema", "json_schema":{"name":"energyshift_intake", "strict":True, "schema":response_schema}}
        body.setdefault("provider", {})["require_parameters"] = True
    request = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
              data=json.dumps(body).encode("utf-8"), method="POST",
              headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                       "User-Agent": "EnergyShift-evidence-evaluation"})
    started = perf_counter()
    response_meta = {}
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
        response_meta = {"usage": payload.get("usage"), "response_id": payload.get("id"),
                         "served_model": payload.get("model")}
        choice = payload.get("choices", [{}])[0]
        response_meta["finish_reason"] = choice.get("finish_reason")
        content = choice.get("message", {}).get("content")
        # Do not persist raw prose/errors/reasoning; benchmark only JSON facts.
        if isinstance(content, str):
            content = content.strip()
            # Accept an exact Markdown JSON envelope, never extract JSON from prose.
            if content.startswith("```json\n") and content.endswith("\n```"):
                content = content[8:-4]
            elif content.startswith("```\n") and content.endswith("\n```"):
                content = content[4:-4]
        # HTTP 200 does not imply valid JSON: free providers can truncate content.
        # Never return the raw completion, even in the error path.
        if not isinstance(content, str) or not content:
            return {"status": "INVALID_RESPONSE", "error_category": (
                "OUTPUT_TRUNCATED" if choice.get("finish_reason") == "length" else "EMPTY_CONTENT"),
                "latency_seconds": round(perf_counter() - started, 3), **response_meta}
        try:
            parsed = json.loads(content)
        except ValueError:
            return {"status": "INVALID_RESPONSE", "error_category": (
                "OUTPUT_TRUNCATED" if choice.get("finish_reason") == "length" else "MALFORMED_JSON"),
                "latency_seconds": round(perf_counter() - started, 3), **response_meta}
        if not isinstance(parsed, dict):
            return {"status": "INVALID_RESPONSE", "error_category": "NON_OBJECT_JSON",
                    "latency_seconds": round(perf_counter() - started, 3), **response_meta}
        return {"status": "OK", "latency_seconds": round(perf_counter() - started, 3),
                "usage": payload.get("usage"), "response_id": payload.get("id"),
                "served_model": payload.get("model"), "finish_reason": choice.get("finish_reason"),
                "answer": parsed}
    except urllib.error.HTTPError as exc:
        # Classify known provider failures without persisting their raw diagnostics.
        try:
            upstream = json.loads(exc.read()).get("error", {})
            message = str(upstream.get("message", "")).lower()
            metadata = upstream.get("metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}
        except (ValueError, AttributeError):
            message = ""
            metadata = {}
        source = metadata.get("limit_source")
        upstream_pool = source == "upstream_provider_shared_pool" or "rate-limited upstream" in str(metadata.get("raw", "")).lower()
        diagnostic = {}
        if exc.code == 429:
            diagnostic["rate_limit_scope"] = "UPSTREAM_PROVIDER" if upstream_pool else (
                "OPENROUTER_ACCOUNT" if "daily" in message or "per-day" in message else "UNKNOWN")
            if upstream_pool:
                diagnostic["limit_source"] = "upstream_provider_shared_pool"
                diagnostic["recovery_code"] = "WAIT_OR_CONNECT_PROVIDER"
            provider = metadata.get("provider_name")
            if isinstance(provider, str) and re.fullmatch(r"[A-Za-z0-9 ._-]{1,80}", provider) and key not in provider:
                diagnostic["provider_name"] = provider
            retry = exc.headers.get("Retry-After") if exc.headers else None
            if retry and retry.isdigit():
                diagnostic["retry_after_seconds"] = min(int(retry), 86400)
        category = ("DAILY_QUOTA" if "daily" in message or "per-day" in message
                    else "CREDITS" if "credit" in message
                    else "RATE_LIMIT" if "rate" in message or exc.code == 429
                    else "AUTH" if exc.code in (401, 403)
                    else "MODEL_UNAVAILABLE" if exc.code == 404 else "PROVIDER_ERROR")
        return {"status": "HTTP_ERROR", "http_status": exc.code,
                "error_category": category,
                **diagnostic,
                "latency_seconds": round(perf_counter() - started, 3), "usage": None}
    except OSError:
        return {"status": "TRANSPORT_ERROR",
                "latency_seconds": round(perf_counter() - started, 3), "usage": None}
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        return {"status": "INVALID_RESPONSE", "usage": None, **response_meta,
                "latency_seconds": round(perf_counter() - started, 3)}
