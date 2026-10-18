"""Two-origin local deployment rehearsal; never contacts Render/Vercel or uses credentials."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from threading import Thread
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


class RehearsalHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        # Rehearse the actual Vercel CSP, replacing only its remote backend origin.
        config = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
        for header in config['headers'][0]['headers']:
            self.send_header(header['key'], header['value'].replace('https://*.onrender.com', 'http://127.0.0.1:8767'))
        super().end_headers()


class RehearsalServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # CDP's immediate reload can abort an in-flight static response.
        if not isinstance(sys.exception(), (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            super().handle_error(request, client_address)


def main():
    # Do not attach to or stop services belonging to other processes.
    for port in [8766, 8767]:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    env = dict(os.environ, ENERGYSHIFT_ALLOWED_ORIGINS='http://127.0.0.1:8766')
    backend = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8767'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    server = None
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen('http://127.0.0.1:8767/api/demo/health', timeout=1) as response:
                    assert json.load(response)['status'] == 'OK'
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Rehearsal backend did not start')
        with tempfile.TemporaryDirectory(prefix='energyshift-static-') as directory:
            # Exercise the actual static builder, then point the test artifact at the isolated backend.
            code = "require('./ops/build-static.cjs').build(process.argv[1], {ENERGYSHIFT_API_BASE_URL:'https://rehearsal.onrender.com'})"
            subprocess.run(['node', '-e', code, directory], cwd=ROOT, check=True)
            Path(directory, 'deployment-config.js').write_text('window.ENERGYSHIFT_CONFIG=Object.freeze({apiBaseUrl:"http://127.0.0.1:8767"});\n', encoding='utf-8')
            server = RehearsalServer(('127.0.0.1', 8766), partial(RehearsalHandler, directory=directory))
            Thread(target=server.serve_forever, daemon=True).start()
            subprocess.run([sys.executable, 'ops/browser_smoke.py', '--input-only', '--base-url', 'http://127.0.0.1:8766'], cwd=ROOT, check=True)
            packet = json.loads((ROOT / 'docs/evaluation/input_ui_qa.json').read_text(encoding='utf-8'))
            packet.update(topology='Static allowlisted build on :8766 -> actual FastAPI on :8767, real browser CORS/preflight', live_cloud_deployed=False)
            packet['built_artifact_sha256'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in Path(directory).iterdir()}
            packet['test_overrides'] = 'Only generated API base URL and CSP connect origin are changed to localhost; other Vercel headers are used verbatim.'
            packet['limitations'] = 'Local two-origin rehearsal, not a live Vercel/Render deployment or cold-start/performance certification.'
            (ROOT / 'docs/evaluation/cloud_rehearsal.json').write_text(json.dumps(packet, indent=2) + '\n', encoding='utf-8')
    finally:
        if server:
            server.shutdown()
            server.server_close()
        backend.terminate()
        try:
            backend.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend.kill()
            backend.wait(timeout=5)


if __name__ == '__main__':
    main()
