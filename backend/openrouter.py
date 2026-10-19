"""Small backend-only OpenRouter client. Credentials never enter prompts or reports."""
import json
import os
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


def chat_json(messages, *, config=None, timeout=45, max_completion_tokens=1500, reasoning_enabled=None, response_schema=None):
    if type(max_completion_tokens) is not int or not 1 <= max_completion_tokens <= 6000:
        raise ValueError("Completion budget must be 1..6000")
    config = load_config() if config is None else config
    key, model = config.get("OPENROUTER_API_KEY", ""), config.get("OPENROUTER_MODEL", "")
    if not key or not model:
        return {"status": "CONFIG_MISSING", "latency_seconds": 0, "usage": None}
    body = {"model": model, "messages": messages, "stream": False, "temperature": 0,
            "max_completion_tokens": max_completion_tokens, "response_format": {"type": "json_object"}}
    if reasoning_enabled is not None:
        body["reasoning"] = {"enabled": bool(reasoning_enabled), "exclude": True}
    if response_schema is not None:
        body["response_format"] = {"type":"json_schema", "json_schema":{"name":"energyshift_intake", "strict":True, "schema":response_schema}}
        body["provider"] = {"require_parameters": True}
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
        parsed = json.loads(content) if isinstance(content, str) else None
        if not isinstance(parsed, dict):
            raise ValueError("Expected a JSON object")
        return {"status": "OK", "latency_seconds": round(perf_counter() - started, 3),
                "usage": payload.get("usage"), "response_id": payload.get("id"),
                "served_model": payload.get("model"), "finish_reason": choice.get("finish_reason"),
                "answer": parsed}
    except urllib.error.HTTPError as exc:
        # Classify known provider failures without persisting their raw diagnostics.
        try:
            message = json.loads(exc.read()).get("error", {}).get("message", "").lower()
        except (ValueError, AttributeError):
            message = ""
        category = ("DAILY_QUOTA" if "daily" in message or "per-day" in message
                    else "CREDITS" if "credit" in message
                    else "RATE_LIMIT" if "rate" in message or exc.code == 429
                    else "AUTH" if exc.code in (401, 403) else "PROVIDER_ERROR")
        return {"status": "HTTP_ERROR", "http_status": exc.code,
                "error_category": category,
                "latency_seconds": round(perf_counter() - started, 3), "usage": None}
    except OSError:
        return {"status": "TRANSPORT_ERROR",
                "latency_seconds": round(perf_counter() - started, 3), "usage": None}
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        return {"status": "INVALID_RESPONSE", "usage": None, **response_meta,
                "latency_seconds": round(perf_counter() - started, 3)}
