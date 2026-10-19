"""Headless Edge CDP audit against the actual localhost UI/API. No credentials."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import socket
import sys
import argparse
import tempfile
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
    '--user-data-dir=' + tempfile.mkdtemp(prefix='edge-b2-', dir=OUT), 'about:blank'],
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
    before = js('revision') if identifier == 'loadFixture' else None
    js('document.getElementById(' + json.dumps(identifier) + ').click()')
    if before is not None:
        wait('!fixtureLoading && revision > ' + str(before))


def run():
    click('analyze')
    wait('!preparing && !pending && !document.getElementById("analyze").disabled')


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
    check('currentReport === null && !document.getElementById("plansGrid").children.length', 'initial_has_no_fake_result')
    run()
    check('currentReport.status === "COMPLETED" && currentReport.plans.B2.verification.status === "PASS"', 'real_backend_B2_independently_verified')
    check('referencePlan() === currentReport.decision.selected_plan && document.getElementById("chartSelectedLabel").textContent.includes(referencePlan())', 'selected_plan_consistent_across_views')
    check('document.querySelectorAll("#plansGrid .plan-card").length === 3', 'three_real_plan_cards')
    check('document.querySelectorAll(".rail-item").length === 6', 'approved_six_section_navigation_retained')
    js('switchMainTab("tab-gantt")')
    check('document.getElementById("tab-gantt").classList.contains("active") && !document.getElementById("tab-overview").classList.contains("active") && document.querySelectorAll(".gantt-job-pill").length === 16', 'actual_gantt_and_navigation')
    js('toggleAppTheme()')
    check('document.documentElement.dataset.theme === "light"', 'approved_theme_toggle')
    js('toggleAppTheme();switchMainTab("tab-overview")')
    screenshot = command('Page.captureScreenshot', {'format':'png', 'captureBeyondViewport':True})
    (OUT / 'workspace-dark.png').write_bytes(base64.b64decode(screenshot['data']))
    js('document.getElementById("scenarioSelect").value="coordinated-cell";document.getElementById("scenarioSelect").dispatchEvent(new Event("change"))')
    wait('JSON.parse(document.getElementById("dataset").value).jobs.length === 2')
    run()
    check('currentReport.decision.selected_plan === "B2" && currentReport.plans.B2.cost.total_vnd < currentReport.plans.B1.cost.total_vnd', 'coordinated_sample_selects_actual_B2')
    check('document.getElementById("kpiTotalCost").textContent === money(currentReport.plans.B2.cost.total_vnd)', 'displayed_B2_cost_matches_report')
    js('showDecisionMemo()')
    check('document.getElementById("memoModal").classList.contains("open") && document.getElementById("memoContent").textContent.includes(currentReport.input_hash)', 'memo_preserves_report_trace')
    js('closeModal()')
    click('unknownCost'); run()
    check('currentReport.decision.kind === "MEASURE_FIRST" && currentReport.decision.selected_plan === "B0"', 'unknown_cost_blocks_recommendation')
    click('extraCost'); run()
    check('currentReport.decision.kind === "KEEP_CURRENT"', 'high_cost_keeps_baseline')
    js('window.originalApiFetch=apiFetch;window.releaseResponse=null;apiFetch=async(...args)=>{const response=await originalApiFetch(...args);await new Promise(resolve=>window.releaseResponse=resolve);return response;};revalidateDashboard();void 0')
    wait('typeof window.releaseResponse === "function"')
    js('clearResult();window.releaseResponse()')
    wait('!pending')
    check('currentReport === null && !document.getElementById("plansGrid").children.length', 'late_response_cannot_restore_invalidated_report')
    js('apiFetch=window.originalApiFetch;let invalid=JSON.parse(document.getElementById("dataset").value);invalid.current_schedule[0].start="2026-10-19T23:30:00+07:00";setDataset(invalid)')
    run()
    check('currentReport === null && !document.getElementById("errors").hidden', 'invalid_baseline_has_visible_error_without_costs')
    js('document.getElementById("scenarioSelect").value="editable-cell";document.getElementById("scenarioSelect").dispatchEvent(new Event("change"))')
    wait('JSON.parse(document.getElementById("dataset").value).jobs.length === 8')
    from input_browser_checks import run_checks
    run_checks(js, click, wait, check, run, command, OUT)
    failures = [e for e in events if e.get('method') == 'Runtime.exceptionThrown']
    assert not failures, failures
    summary = {'browser':'headless Microsoft Edge via CDP','all_checks_pass':True,'base_url':args.base_url,'javascript_exceptions':len(failures),
               'scope':'verified B2 on approved cockpit plus existing input persistence/import/lot checks',
               'screenshots':['work/ui-qa/workspace-dark.png','work/ui-qa/input-desktop.png','work/ui-qa/input-mobile.png'],
               'source_sha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['index.html','app.js','workspace.css','input-desk.js','backend/b2.py']},
               'limitations':'Local browser and synthetic inputs; no certification of factory operation or live cloud.'}
    (ROOT / 'docs/evaluation/b2_ui_qa.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary),flush=True)

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
