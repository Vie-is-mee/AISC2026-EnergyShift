"""Safely refresh only this workspace's local EnergyShift server on port 8000.

Never stops another program or a server owned by a different working directory.
Reuses the repository's normal run-demo.py launcher (including local env setup).
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

import psutil

ROOT = Path(__file__).resolve().parents[1]
PORT = 8000


def same_server(process):
    try:
        cmd = process.cmdline()
        return (Path(process.cwd()).resolve() == ROOT.resolve()
                and any(Path(arg).name == "run-demo.py" for arg in cmd))
    except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
        return False


listeners = [c for c in psutil.net_connections(kind="tcp")
             if c.status == "LISTEN" and c.laddr.port == PORT and c.pid]
assert len({c.pid for c in listeners}) <= 1, "Unexpected multiple port owners"
to_stop = []
if listeners:
    process = psutil.Process(listeners[0].pid)
    if not same_server(process):
        raise SystemExit(f"Port {PORT} is owned by a different process. Nothing changed.")
    to_stop.append(process)
    parent = process.parent()
    if parent and same_server(parent):
        to_stop.append(parent)

for process in to_stop:
    print("Stopping verified workspace server PID", process.pid)
    try:
        process.terminate()
    except psutil.NoSuchProcess:
        pass
_, survivors = psutil.wait_procs(to_stop, timeout=7)
if survivors:
    raise SystemExit("Existing server did not terminate safely. Not starting a second one.")

flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
proc = subprocess.Popen([sys.executable, str(ROOT / "ops/run-demo.py")],
                        cwd=str(ROOT), stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        creationflags=flags)
print("Started local EnergyShift PID", proc.pid)

for attempt in range(50):
    if proc.poll() is not None:
        raise SystemExit("New server exited unexpectedly")
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/factory/example", timeout=1) as f:
            sample = json.load(f)
        req = urllib.request.Request(
            f"http://127.0.0.1:{PORT}/api/factory/analyze",
            data=json.dumps({"factory": sample, "mode": "FIXED_MACHINE"}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=8) as f:
            report = json.load(f)
        assert report["status"] == "COMPLETED", report
        assert "CP-SAT" in report["search"]["algorithm"], report.get("search")
        print("Fresh backend verified: HTTP 200, CP-SAT solver,",
              report["search"]["b2"]["status"], "B2,",
              len(report["enforced_constraints"]), "registered rules")
        break
    except (OSError, ValueError, KeyError):
        time.sleep(.2)
else:
    raise SystemExit("Server did not become healthy within readiness window")
