"""Bounded strict JSON decoding shared by auxiliary demo endpoints."""
import json
from fastapi import HTTPException


async def read_json(request, *, max_bytes=512 * 1024):
    if request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
        raise HTTPException(415, "Use application/json")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > max_bytes:
            raise HTTPException(413, "Request exceeds the input size limit")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result

    def nonfinite(value):
        raise ValueError("Nonfinite JSON value")

    try:
        value = json.loads(body.decode("utf-8"), object_pairs_hook=unique, parse_constant=nonfinite)
        if not isinstance(value, dict):
            raise ValueError("Object required")
        return value
    except (ValueError, UnicodeError):
        raise HTTPException(422, "Use finite UTF-8 JSON with unique keys")
