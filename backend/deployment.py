"""Explicit deployment settings; no dotenv loading or secret handling."""
import os
import re
from urllib.parse import urlsplit


def allowed_origins():
    origins = []
    for value in os.getenv("ENERGYSHIFT_ALLOWED_ORIGINS", "").split(","):
        value = value.strip().rstrip("/")
        if not value:
            continue
        url = urlsplit(value)
        local = url.hostname in ("localhost", "127.0.0.1")
        if (url.scheme != "https" and not (local and url.scheme == "http")) or not url.hostname or url.username or url.password or url.path or url.query or url.fragment or "*" in value:
            raise ValueError("ENERGYSHIFT_ALLOWED_ORIGINS requires exact HTTPS origins, without paths or wildcards")
        # Validate malformed ports as well.
        _ = url.port
        origins.append(value)
    return list(dict.fromkeys(origins))


def allowed_hosts():
    hosts = ["127.0.0.1", "localhost", "testserver"]
    hostname = os.getenv("RENDER_EXTERNAL_HOSTNAME", "").strip()
    if hostname:
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", hostname):
            raise ValueError("RENDER_EXTERNAL_HOSTNAME must contain only a hostname")
        hosts.append(hostname.lower())
    return hosts


def build_sha():
    return os.getenv("RENDER_GIT_COMMIT", "").strip()[:40]
