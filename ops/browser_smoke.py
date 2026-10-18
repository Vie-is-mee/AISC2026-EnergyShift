"""Headless Edge CDP audit against the actual localhost UI/API. No credentials."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import socket
import sys
import argparse
import time
import urllib.request
import websocket

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--input-only', action='store_true')
parser.add_argument('--base-url', default='http://127.0.0.1:8765')
args = parser.parse_args()
OUT = ROOT / 'work/ui-qa'
OUT.mkdir(parents=True, exist_ok=True)
# Never attach to or close a debugger belonging to another browser session.
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 9345))
browser = subprocess.Popen([r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--remote-debugging-port=9345', '--remote-allow-origins=http://localhost:9345',
    '--user-data-dir=' + str(OUT / 'edge-profile'), 'about:blank'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
ws = None
events = []
counter = 0


def command(method, params=None):
    global counter
    counter += 1
    identifier = counter
    ws.send(json.dumps({'id': identifier, 'method': method, 'params': params or {}}))
    while True:
        message = json.loads(ws.recv())
        if message.get('id') == identifier:
            if 'error' in message:
                raise RuntimeError(message['error'])
            return message.get('result', {})
        events.append(message)


def js(expression):
    response = command('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    if 'exceptionDetails' in response:
        raise AssertionError(response['exceptionDetails'])
    return response.get('result', {}).get('value')


def wait(expression, timeout=90):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if js(expression):
            return
        time.sleep(.2)
    raise AssertionError('Timed out: ' + expression)


def click(identifier):
    js('document.getElementById(' + json.dumps(identifier) + ').click()')


def run():
    click('analyze')
    wait('!document.getElementById("analyze").disabled')


def check(condition, label):
    assert js(condition), label
    print(json.dumps({'check': label, 'pass': True}), flush=True)


try:
    for _ in range(80):
        try:
            request = urllib.request.Request('http://127.0.0.1:9345/json/new?' + args.base_url, method='PUT')
            with urllib.request.urlopen(request, timeout=2) as response:
                target = json.load(response)
            break
        except OSError:
            time.sleep(.2)
    else:
        raise RuntimeError('Headless Edge did not start')
    ws = websocket.create_connection(target['webSocketDebuggerUrl'], origin='http://localhost:9345', timeout=120)
    command('Runtime.enable')
    command('Page.enable')
    downloads = OUT / 'downloads'
    downloads.mkdir(exist_ok=True)
    command('Browser.setDownloadBehavior', {'behavior': 'allow', 'downloadPath': str(downloads)})
    command('Network.enable')
    command('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 1100, 'deviceScaleFactor': 1, 'mobile': False})
    command('Page.reload', {'ignoreCache': True})
    wait('document.getElementById("analyze") && !document.getElementById("analyze").disabled')
    if "--input-only" not in sys.argv:
        check('document.getElementById("results").hidden', 'initial_has_no_fake_result')
        run()
        check('currentReport.decision.kind === "CHANGE" && document.getElementById("saving").textContent.includes("132.918")', 'real_default_change_and_saving')
        check('document.querySelectorAll(".rail-item[data-tab]").length===6 && document.querySelector(".rail-item.active").dataset.tab==="tab-overview"', 'reference_six_section_navigation_and_result_redirect')
        js('Workspace.show("tab-loadcurve")')
        check('!document.getElementById("tab-loadcurve").hidden && document.querySelectorAll("#loadRows tr").length===24 && document.querySelectorAll("#loadChart svg polyline").length===2', 'load_and_tariff_view_is_computed_from_current_report')
        check('Math.abs([...document.querySelectorAll("#loadRows tr")].reduce((n,r)=>n+Number(r.children[1].textContent.replaceAll(".","").replace(",",".")),0)-rational(currentReport.plans.B0.cost.total_kwh_exact))<0.2', 'hourly_energy_display_reconciles_with_engine_ledger')
        js('Workspace.show("tab-gantt")')
        check('!document.getElementById("tab-gantt").hidden && document.getElementById("tab-overview").hidden', 'navigation_shows_only_selected_report_section')
        js('Workspace.show("tab-dispatch")')
        check('!document.getElementById("advancedInput").open && document.querySelectorAll("#planInputRows tr:first-child td[data-field]").length===7 && getComputedStyle(document.querySelector("#planInputRows td[data-field=template_id]")).display==="none"', 'daily_input_is_compact_with_advanced_fields_preserved')
        click('themeToggle')
        check('document.documentElement.dataset.theme==="dark"', 'reference_theme_toggle_works')
        wait('getComputedStyle(document.body).color==="rgb(248, 250, 252)"')
        screenshot = command('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True})
        (OUT / 'workspace-dark.png').write_bytes(base64.b64decode(screenshot['data']))
        click('themeToggle')
        js('Workspace.show("tab-overview")')
        check('document.querySelectorAll("#jobRows tr").length === 8 && document.querySelectorAll(".live-track").length === 6', 'all_jobs_and_machine_plan_tracks_render')
        check('document.getElementById("results").dataset.runId === currentReport.run_id && document.getElementById("hashMeta").textContent.includes(currentReport.input_hash)', 'same_run_and_hash')
        run_id = js('currentReport.run_id')
        input_hash = js('currentReport.input_hash')
        click('export')
        downloaded = downloads / ('EnergyShift_' + run_id + '.json')
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not downloaded.exists():
            time.sleep(.1)
        packet = json.loads(downloaded.read_text(encoding='utf-8'))
        assert packet['run_id'] == run_id and packet['input_hash'] == input_hash
        print(json.dumps({'check': 'export_packet_matches_visible_run', 'pass': True}), flush=True)
        screenshot = command('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True})
        (OUT / 'desktop.png').write_bytes(base64.b64decode(screenshot['data']))
        command('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 844, 'deviceScaleFactor': 1, 'mobile': True})
        click('menuToggle')
        check('document.body.classList.contains("mobile-nav-open") && document.getElementById("menuToggle").getAttribute("aria-expanded")==="true"', 'reference_mobile_menu_opens')
        click('closeMenu')
        wait('getComputedStyle(document.getElementById("mainRail")).visibility==="hidden"')
        check('document.documentElement.scrollWidth <= 390', 'mobile_no_page_overflow')
        screenshot = command('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True})
        (OUT / 'mobile.png').write_bytes(base64.b64decode(screenshot['data']))
        command('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 1100, 'deviceScaleFactor': 1, 'mobile': False})
        click('unknownCost')
        check('document.getElementById("results").hidden && currentReport === null', 'editing_invalidates_report')
        run()
        check('currentReport.decision.kind === "MEASURE_FIRST" && document.getElementById("netRange").textContent.includes("Chưa đủ")', 'unknown_cost_has_no_fake_net_range')
        click('loadFixture'); click('extraCost'); run()
        check('currentReport.decision.kind === "KEEP_CURRENT"', 'extra_cost_changes_actual_verdict')
        check('document.getElementById("netRange").dataset.tone === "negative"', 'negative_net_is_not_colored_positive')
        click('loadFixture')
        js('let d=JSON.parse(document.getElementById("dataset").value);d.jobs[0].quantity=1000000;document.getElementById("dataset").value=JSON.stringify(d);document.getElementById("dataset").dispatchEvent(new Event("input"))')
        run()
        check('document.getElementById("results").hidden && document.getElementById("errors").textContent.includes("LOT_CONFIRMATION_MISMATCH")', 'quantity_error_no_savings')
        click('loadFixture')
        js('let d2=JSON.parse(document.getElementById("dataset").value);d2.current_schedule[1].start="2026-10-19T09:00:00+07:00";document.getElementById("dataset").value=JSON.stringify(d2);document.getElementById("dataset").dispatchEvent(new Event("input"))')
        run()
        check('document.getElementById("results").hidden && document.getElementById("errors").textContent.includes("MACHINE_OVERLAP")', 'invalid_baseline_no_economic_result')
        click('loadFixture'); click('analyze')
        js('document.getElementById("dataset").dispatchEvent(new Event("input"))')
        wait('!document.getElementById("analyze").disabled')
        check('document.getElementById("results").hidden && document.getElementById("status").textContent.includes("bỏ kết quả cũ")', 'stale_response_discarded')
        click('loadFixture')
        js('let d3=JSON.parse(document.getElementById("dataset").value);d3.cost_scope.excluded_review.LABOR_OVERTIME.reference="<img src=x onerror=window.__injected=1>";document.getElementById("dataset").value=JSON.stringify(d3);document.getElementById("dataset").dispatchEvent(new Event("input"))')
        run()
        check('!window.__injected && document.getElementById("reviewRows").textContent.includes("<img") && !document.querySelector("#reviewRows img")', 'evidence_reference_is_text_not_html')
        document = command('DOM.getDocument')
        upload = command('DOM.querySelector', {'nodeId': document['root']['nodeId'], 'selector': '#upload'})
        command('DOM.setFileInputFiles', {'nodeId': upload['nodeId'], 'files': [str(ROOT / 'backend/fixtures/editable_cell.json')]})
        wait('document.getElementById("results").hidden && document.getElementById("dataset").value.includes("editable-cell-01") && !document.getElementById("dataset").value.includes("<img")')
        check('currentReport === null && JSON.parse(document.getElementById("dataset").value).schema_version === "demo-3"', 'upload_replaces_input_and_invalidates_result')
    from input_browser_checks import run_checks
    run_checks(js, click, wait, check, run, command, OUT)
    failures = [e for e in events if e.get('method') == 'Runtime.exceptionThrown']
    assert not failures, 'Browser JavaScript exception'
    summary = {'browser': 'headless Microsoft Edge via CDP', 'all_checks_pass': True, 'base_url': args.base_url, 'scope': 'input-only' if '--input-only' in sys.argv else 'full-regression',
               'javascript_exceptions': len(failures),
               'screenshots': (['work/ui-qa/desktop.png','work/ui-qa/mobile.png','work/ui-qa/workspace-dark.png'] if '--input-only' not in sys.argv else []) + ['work/ui-qa/input-desktop.png','work/ui-qa/input-mobile.png'],
               'flows': (['default CHANGE','unknown MEASURE','extra-cost KEEP','quantity invalid','baseline invalid','stale response','untrusted reference as text','JSON export roundtrip','JSON file upload','six-section reference navigation','computed hourly kWh versus ledger','compact daily fields','light/dark theme','mobile navigation'] if '--input-only' not in sys.argv else []) + ['profile persistence','draft recovery','CSV mapping memory','extra-column preservation','explicit lot reconfirmation','new plan cost reset','day shift confirmation','structured workshop fields','storage denied','input desktop/mobile','workspace file restore','CSV file BOM/CRLF preservation','one-click prepare and analyze','visible primary action'],
               'source_sha256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['index.html','app.js','live.css','backend/app.py','input-model.js','input-desk.js','api-client.js','deployment-config.js','workspace.css','workspace.js']},
               'limitations': 'One local browser run, synthetic data. Does not certify all browsers or industrial operation.'}
    (ROOT / ('docs/evaluation/input_ui_qa.json' if '--input-only' in sys.argv else 'docs/evaluation/live_ui_qa.json')).write_text(json.dumps(summary, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(summary), flush=True)
finally:
    if ws:
        try:
            command('Browser.close')
        except Exception:
            pass
        ws.close()
    try:
        browser.wait(timeout=5)
    except subprocess.TimeoutExpired:
        browser.terminate()
