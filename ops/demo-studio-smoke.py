"""One bounded desktop/mobile walkthrough against the actual local API."""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request

import websocket

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work/demo-evidence"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:8000"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
profile = tempfile.TemporaryDirectory(prefix="energyshift-demo-")
# Prefer the user's Brave browser, but never use their real profile or sessions.
# ENERGYSHIFT_TEST_BROWSER allows an explicit executable override for CI/developers.
browser_candidates = ([Path(os.environ["ENERGYSHIFT_TEST_BROWSER"])]
    if os.environ.get("ENERGYSHIFT_TEST_BROWSER") else [
        Path(r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"),
        Path(r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe"),
        Path.home() / "AppData/Local/BraveSoftware/Brave-Browser/Application/brave.exe",
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    ])
browser_path = next((candidate for candidate in browser_candidates if candidate.is_file()), None)
if browser_path is None:
    raise RuntimeError("No usable Brave/Edge browser found; set ENERGYSHIFT_TEST_BROWSER.")
browser_name = "Brave" if browser_path.name.lower() == "brave.exe" else "Edge"
browser = subprocess.Popen([str(browser_path),
    "--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", "--no-proxy-server",
    f"--remote-debugging-port={port}", f"--remote-allow-origins=http://localhost:{port}",
    "--user-data-dir=" + profile.name, "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
ws = None
events, checks = [], []
counter = 0


def command(method, params=None):
    global counter
    counter += 1
    ws.send(json.dumps({"id": counter, "method": method, "params": params or {}}))
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        message = json.loads(ws.recv())
        if message.get("id") == counter:
            if "error" in message:
                raise RuntimeError(message["error"])
            return message.get("result", {})
        events.append(message)
    raise TimeoutError("CDP did not respond: " + method)


def js(code):
    response = command("Runtime.evaluate", {"expression": code, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in response:
        raise AssertionError(response["exceptionDetails"])
    return response.get("result", {}).get("value")


def wait(code, timeout=40):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if js(code):
            return
        time.sleep(.15)
    print('BROWSER_DIAGNOSTIC', ascii(js("JSON.stringify({url:location.href,ready:document.readyState,view:document.body?.dataset.view,hasStudio:!!document.getElementById('studioAudit'),fixture:typeof fixtureLoading,errors:document.getElementById('errorBox')?.textContent,status:document.getElementById('studioStatus')?.textContent,factoryStatus:document.getElementById('factoryStatus')?.textContent})")), flush=True)
    print('RUNTIME_ERRORS', json.dumps([e for e in events if e.get('method')=='Runtime.exceptionThrown'])[:3000])
    print('MANUAL_DIAGNOSTIC', ascii(js("JSON.stringify({result:document.getElementById('demoEditResult')?.textContent,hint:document.getElementById('demoEditHint')?.textContent,base:document.getElementById('demoEditBase')?.value,slot:document.getElementById('demoEditSlot')?.value,manual:DemoWorkspace.getScene()?.plans.MANUAL?.jobs,hash:DemoWorkspace.getScene()?.hash})")), flush=True)
    print('ONBOARDING_DIAGNOSTIC',ascii(js("JSON.stringify({status:document.getElementById('demoWelcomeStatus')?.textContent,working:document.getElementById('demoWelcomeRun')?.disabled,focus:document.activeElement?.id,workspace:document.getElementById('demoWorkspaceStatus')?.textContent})")),flush=True)
    capture('studio-failure.png')
    raise AssertionError("Timed out: " + code)


def check(code, name):
    if not js(code):
        raise AssertionError(name)
    checks.append(name)


def capture(name):
    data = command("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})["data"]
    (OUT / name).write_bytes(base64.b64decode(data))


try:
    end = time.monotonic() + 15
    while True:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list") as response:
                tab = next(item for item in json.load(response) if item.get("type") == "page")
            break
        except OSError:
            if time.monotonic() > end:
                raise
            time.sleep(.2)
    ws = websocket.create_connection(tab["webSocketDebuggerUrl"], origin=f"http://localhost:{port}", timeout=15)
    print(f'Connected to isolated {browser_name}: {browser_path}', flush=True)
    command("Page.enable")
    command("Runtime.enable")
    command("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": str(OUT)})
    command("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 1040, "deviceScaleFactor": 1, "mobile": False})
    command("Page.navigate", {"url": BASE + "/?demo=1"})
    print('Navigated to demo', flush=True)
    wait("document.getElementById('studioAudit') && typeof fixtureLoading!=='undefined' && document.body.dataset.view === 'tab-dispatch' && !fixtureLoading", 12)
    check("document.getElementById('tab-dispatch').classList.contains('active') && document.querySelectorAll('.tab-pane').length===6 && !document.getElementById('tab-demo') && document.querySelectorAll('.rail-item[data-tab]').length===6", "six_tabs_with_no_separate_demo_destination")
    # Upload-first experience. Synthetic replay below is an internal test fixture only.
    check("!document.getElementById('demoWelcome').checkVisibility() && !document.getElementById('demoAdvancedSetup').checkVisibility() && !DemoWorkspace.getReport()", "no_sample_onboarding_or_preset_report")
    check("document.getElementById('sourceInputFile').checkVisibility() && document.getElementById('sourceOutputFile').checkVisibility() && document.getElementById('studioAudit').disabled", "real_two_file_entry_is_primary")
    capture('onboarding-desktop.png')
    command("Emulation.setDeviceMetricsOverride", {"width":390,"height":844,"deviceScaleFactor":1,"mobile":True})
    check("document.getElementById('sourceInputFile').checkVisibility() && document.documentElement.scrollWidth<=392", "mobile_upload_visible")
    check("(()=>{const nav=document.querySelector('.mobile-quick-nav .quick-nav-item');return nav && parseFloat(getComputedStyle(nav).fontSize)>=12 && nav.getBoundingClientRect().height>=48;})()", "mobile_nav_readable")
    capture('onboarding-mobile.png')
    command("Emulation.setDeviceMetricsOverride", {"width":1440,"height":1040,"deviceScaleFactor":1,"mobile":False})

    def upload_file(selector, name):
        doc = command("DOM.getDocument")
        node = command("DOM.querySelector", {"nodeId":doc["root"]["nodeId"],"selector":selector})
        command("DOM.setFileInputFiles", {"nodeId":node["nodeId"],"files":[str(ROOT/name)]})

    upload_file('#sourceInputFile', 'Input_JSON_Schedule_Optimization.json')
    check("document.getElementById('studioAudit').disabled", "one_file_blocks_import")
    upload_file('#sourceOutputFile', 'Output_JSON_Schedule_Optimization.json')
    check("!document.getElementById('studioAudit').disabled", "two_files_allow_import")
    js("document.getElementById('studioAudit').click()")
    wait("!document.getElementById('studioPanel-textile').hidden && document.getElementById('studioRows').children.length===25 && !document.getElementById('studioAudit').disabled",25)
    check("document.getElementById('studioFunnel').textContent.includes('275') && document.getElementById('studioFunnel').textContent.includes('91') && document.getElementById('studioWarnings').textContent.includes('167')", "uploaded_source_audit_counts")
    check("document.getElementById('studioSolar').checked && document.getElementById('studioMinutes').value==='5' && !document.getElementById('studioRunTextile').disabled", "defaults_include_solar")
    capture('studio-source-desktop.png')
    js("document.getElementById('studioRunTextile').click()")
    wait("DemoWorkspace.getReport()?.status==='COMPLETED' && DemoWorkspace.isTextile() && !document.getElementById('studioRunTextile').disabled",55)
    check("document.getElementById('studioTextileResult').textContent.includes('ISOLATED') && document.querySelectorAll('#studioTextileResult svg').length===3", "textile_three_solar_load_tariff_charts")
    check("DemoWorkspace.getActiveDataset()==='textile' && DemoWorkspace.getReport().schema_version==='textile-demo-1' && Object.keys(DemoWorkspace.getReport().plans).includes('B0')", "textile_gantt_scope")
    capture('studio-textile-desktop.png')
    for name in ['dispatch','overview','gantt','loadcurve','validation','sensitivity']:
        js("window.Workspace.show('tab-"+name+"')")
        check("DemoWorkspace.isTextile() && document.getElementById('demo-view-"+name+"').textContent.length>20", 'textile_scoped_'+name)
    js("window.Workspace.show('tab-dispatch')")
    js("document.getElementById('studioExport').click()")
    artifact = OUT / 'EnergyShift-source-evidence.json'
    deadline = time.monotonic() + 10
    while not artifact.is_file() and time.monotonic() < deadline: time.sleep(.1)
    exported = json.loads(artifact.read_text(encoding='utf-8'))
    assert exported['source_audit']['counts']['compatible'] == 91
    assert exported['textile_experiment']['manifest']['mapping']['solar_enabled'] is True
    assert len(exported['textile_experiment']['manifest']['selected']) == 18
    checks.append('export_of_uploaded_source_solar_ledger')
    js("document.getElementById('studioMinutes').value='6';document.getElementById('studioMinutes').dispatchEvent(new Event('input',{bubbles:true}))")
    check("document.getElementById('studioTextileResult').children.length===0", "mapping_edit_invalidates_textile_result")
    js("DemoStudio.showStep('synthetic');document.getElementById('studioReplay').click()")
    wait("!document.getElementById('studioOpenGantt').disabled", 45)
    check("document.getElementById('studioSyntheticResult').textContent.includes('1.352.304') && document.getElementById('studioSyntheticResult').textContent.includes('132.918')", "slide_costs_recomputed")
    check("document.getElementById('studioSyntheticResult').textContent.includes('8/8 công việc') && document.getElementById('studioSyntheticResult').textContent.includes('Bằng chứng verifier thực tế')", "synthetic_verifier_scope_from_engine")
    check("document.querySelectorAll('.demo-edit-bar').length >= 8 && document.getElementById('demoEditBase').options.length >= 2", "selectable_gantt_job_bars")
    check("document.getElementById('demoEditResult').textContent===''", "loaded_schedule_clears_editor_empty_state")
    capture("studio-synthetic-desktop.png")
    for name in ['dispatch','overview','gantt','loadcurve','validation','sensitivity']:
        js("window.Workspace.show('tab-"+name+"')")
        check("document.querySelectorAll('.tab-pane.active').length===1 && document.getElementById('tab-"+name+"').classList.contains('active') && (document.getElementById('demoWorkspaceBar').checkVisibility() === (document.body.dataset.view==='tab-dispatch' && document.getElementById('demoAdvancedSetup').open))", 'distinct_function_tab_'+name)
        capture('tab-'+name+'-desktop.png')
    js("window.Workspace.show('tab-dispatch')")
    # Full report-to-AI handoff. No live provider call: the deterministic context
    # report must expose unsupported constraints, model scope, and required review.
    js("""(() => {
      document.getElementById('demoFactoryContext').value='Ca đêm thiếu công nhân và thiếu nguyên liệu.';
      document.getElementById('demoFactoryAnalyze').click();
    })()""")
    wait("document.getElementById('demoFactoryReport').textContent.includes('Các bước cần kỹ sư xác nhận')", 20)
    check("document.getElementById('demoFactoryReport').textContent.includes('Nhân lực / ca làm') && document.getElementById('demoFactoryReport').textContent.includes('Tồn kho / nguyên vật liệu') && document.getElementById('demoFactoryReport').textContent.includes('Không bổ sung ràng buộc') && document.getElementById('demoFactoryReport').textContent.includes('cần kỹ sư phê duyệt')", 'context_report_flags_unmodeled_constraints_and_review')
    check("DemoWorkspace.getScene().hash===currentReport.input_hash && !DemoWorkspace.getScene().plans.MANUAL", 'context_analysis_keeps_source_schedule_intact')
    capture('studio-context-desktop.png')
    js("document.getElementById('demoFactoryAI').click()")
    check("document.getElementById('demoWorkspaceQuestion').value==='Ca đêm thiếu công nhân và thiếu nguyên liệu.' && document.getElementById('demoWorkspaceMemo').open && !document.getElementById('demoWorkspaceConsent').checked && document.getElementById('demoFactoryReport').textContent.includes('Các bước cần kỹ sư xác nhận') && document.getElementById('demoFactoryStatus').textContent.includes('Chưa gọi mô hình')", 'ai_handoff_preserves_deterministic_report_without_provider_call')
    # Drive Chromium's real input path: do not call pointer handlers or the API directly.
    original_hash = js("DemoWorkspace.getScene().hash")
    original_report = js("JSON.stringify(DemoWorkspace.getReport())")
    js("""globalThis.__manualPublishError=null;
      globalThis.__smokeRenderReport=renderReport;
      renderReport=function(...args){try{return globalThis.__smokeRenderReport(...args);}
        catch(error){globalThis.__manualPublishError=error.stack;throw error;}};""")

    def drag_job(target_slot):
        js("window.Workspace.show('tab-gantt')")
        js("document.getElementById('demoEditGantt').scrollIntoView({block:'center',behavior:'instant'})")
        points = js("""(() => {
          const scene=DemoWorkspace.getScene();
          const bar=[...document.querySelectorAll('.demo-edit-bar')].find(b=>b.textContent==='J4');
          const track=bar.parentElement, r=track.getBoundingClientRect(), b=bar.getBoundingClientRect();
          return {x:b.left+b.width/2,y:b.top+b.height/2,
            to:r.left+TARGET/scene.horizon*r.width+b.width/2};
        })()""".replace('TARGET', str(target_slot)))
        command('Input.dispatchMouseEvent', {'type':'mouseMoved','x':points['x'],'y':points['y']})
        command('Input.dispatchMouseEvent', {'type':'mousePressed','x':points['x'],'y':points['y'],'button':'left','buttons':1,'clickCount':1})
        for step in range(1, 9):
            x = points['x'] + (points['to']-points['x'])*step/8
            command('Input.dispatchMouseEvent', {'type':'mouseMoved','x':x,'y':points['y'],'button':'left','buttons':1})
        check("!!document.querySelector('.demo-edit-ghost[data-status=REVIEW_REQUIRED]')", 'pointer_drag_preview_requires_review')
        command('Input.dispatchMouseEvent', {'type':'mouseReleased','x':points['to'],'y':points['y'],'button':'left','buttons':0,'clickCount':1})
        wait("globalThis.__manualPublishError || (!document.getElementById('demoEditRun').disabled && DemoWorkspace.getScene().plans.MANUAL?.jobs.some(j=>j.id==='J4' && j.start==="+str(target_slot)+"))", 25)
        check("!globalThis.__manualPublishError", js("globalThis.__manualPublishError") or 'manual_publish_no_render_exception')

    drag_job(16)
    manual_hash = js('DemoWorkspace.getScene().hash')
    check("DemoWorkspace.getScene().selected==='MANUAL' && currentReport.input_hash===DemoWorkspace.getScene().hash && currentReport.decision.selected_plan==='MANUAL'", 'pointer_manual_native_report_synchronized')
    check("DemoWorkspace.getScene().plans.MANUAL.verification.status==='PASS' && !document.getElementById('demoEditUndo').disabled && !document.getElementById('demoEditReset').disabled", 'pointer_manual_verified_and_history_enabled')
    check("document.getElementById('validationPlanSelect').value==='manual' && document.getElementById('validationList').textContent.includes('PASS')", 'native_verifier_selects_manual_plan')
    for tab_name in ['overview', 'gantt', 'loadcurve', 'validation']:
        js("window.Workspace.show('tab-"+tab_name+"')")
        check("document.getElementById('demoWorkspaceBar').dataset.inputHash===DemoWorkspace.getScene().hash", 'manual_shared_hash_'+tab_name)
    check("document.getElementById('demo-view-gantt').textContent.includes('MANUAL') && document.getElementById('demo-view-validation').textContent.includes(DemoWorkspace.getScene().hash) && document.getElementById('demoNativeEDA').textContent.includes('MANUAL')", 'manual_gantt_verifier_eda_rendered')
    check("getComputedStyle(document.getElementById('demo-view-validation')).display!=='none'", 'manual_native_verifier_visible')
    capture('studio-manual-desktop.png')
    manual_artifact = OUT / 'EnergyShift-analysis.json'
    if manual_artifact.exists():
        manual_artifact.unlink()
    js("document.getElementById('demoWorkspaceExport').click()")
    deadline = time.monotonic() + 10
    while not manual_artifact.exists() and time.monotonic() < deadline:
        time.sleep(.1)
    manual_evidence = json.loads(manual_artifact.read_text(encoding='utf-8'))
    assert manual_evidence['input_hash'] == manual_hash
    assert manual_evidence['report']['decision']['selected_plan'] == 'MANUAL'
    assert manual_evidence['report']['plans']['MANUAL']['verification']['status'] == 'PASS'
    assert manual_evidence['report']['manual_review']['status'] == 'NEEDS_HUMAN_REVIEW'
    assert manual_evidence['report']['plans']['MANUAL']['cost']['total_vnd'] == js('DemoWorkspace.getScene().plans.MANUAL.total')
    assert manual_evidence['report']['plans']['MANUAL']['cost']['total_vnd'] == js('currentReport.plans.MANUAL.cost.total_vnd')
    assert next(j for j in manual_evidence['report']['plans']['MANUAL']['schedule'] if j['job_id']=='J4')['start'].startswith('2026-10-19T08:00:00')
    checks.append('pointer_manual_export_matches_verified_report')
    js("document.getElementById('demoEditUndo').click()")
    check("DemoWorkspace.getScene().hash==="+json.dumps(original_hash)+" && currentReport.input_hash===DemoWorkspace.getScene().hash && !currentReport.plans.MANUAL && document.getElementById('demoEditUndo').disabled", 'pointer_undo_restores_original_native_report')
    js("window.Workspace.show('tab-dispatch')")
    drag_job(16)
    drag_job(44)
    js("document.getElementById('demoEditReset').click()")
    check("JSON.stringify(DemoWorkspace.getReport())==="+json.dumps(original_report)+" && currentReport.input_hash===DemoWorkspace.getScene().hash && document.getElementById('demoEditReset').disabled", 'pointer_reset_restores_original_report_after_multiple_moves')
    check("document.getElementById('demo-view-gantt').children.length===0 && document.getElementById('demo-view-validation').children.length===0 && !document.getElementById('demoNativeEDA').textContent.includes('MANUAL')", 'pointer_reset_removes_stale_manual_views')
    # A cross-machine move uses a different duration (J4: M2=120m, M3=135m).
    js("""(() => {
      const base=document.getElementById('demoEditBase');
      base.value='B0'; base.dispatchEvent(new Event('change',{bubbles:true}));
      const job=document.getElementById('demoEditJob');
      job.value='J4'; job.dispatchEvent(new Event('change',{bubbles:true}));
      const machine=document.getElementById('demoEditMachine');
      machine.value='M3'; machine.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('demoEditSlot').value='40';
      document.getElementById('demoEditRun').click();
    })()""")
    wait("!document.getElementById('demoEditRun').disabled && DemoWorkspace.getScene().plans.MANUAL?.jobs.some(j=>j.id==='J4' && j.machine==='M3' && j.start===40)", 25)
    check("DemoWorkspace.getScene().plans.MANUAL.jobs.find(j=>j.id==='J4').end===44.5 && currentReport.plans.MANUAL.verification.jobs.find(j=>j.job_id==='J4').end.includes('22:15:00')", 'manual_cross_machine_uses_destination_duration')
    js("document.getElementById('demoEditReset').click()")
    check("DemoWorkspace.getScene().hash==="+json.dumps(original_hash), 'cross_machine_reset_restores_original_hash')
    # Invalid eligible-machine collision must not publish MANUAL or display a draft cost.
    js("""(() => {
      const base=document.getElementById('demoEditBase');
      base.value='B0'; base.dispatchEvent(new Event('change',{bubbles:true}));
      const job=document.getElementById('demoEditJob');
      job.value='J4'; job.dispatchEvent(new Event('change',{bubbles:true}));
      const machine=document.getElementById('demoEditMachine');
      machine.value='M1'; machine.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('demoEditSlot').value='24';
      document.getElementById('demoEditRun').click();
    })()""")
    wait("document.getElementById('demoEditResult').textContent.includes('FAIL') && !document.getElementById('demoEditRun').disabled", 25)
    check("!DemoWorkspace.getScene().plans.MANUAL && DemoWorkspace.getScene().hash==="+json.dumps(original_hash)+" && !document.getElementById('demoEditResult').textContent.includes('Chi phí mô hình:')", 'manual_rejected_cross_machine_preserves_baseline_and_omits_cost')
    js("document.getElementById('studioOpenGantt').click()")
    check("document.body.dataset.view==='tab-gantt' && currentReport.decision.selected_plan==='B1'", "existing_gantt_connected")
    js("window.Workspace.show('tab-dispatch');document.getElementById('studioOpenVerifier').click()")
    check("document.body.dataset.view==='tab-validation'", "existing_verifier_connected")
    js("window.Workspace.show('tab-dispatch');DemoStudio.showStep('explain')")
    check("document.getElementById('studioAIContext').disabled", "ai_consent_gate")
    check("!!document.getElementById('studioAIDiagnostics') && !!document.getElementById('studioAIDiagnosticResult')", "ai_step4_readonly_endpoint_diagnostics_present")
    check("document.querySelector('#studioAIConsent').parentElement.textContent.includes('MiniMax M3.1 Flash Free') && document.querySelector('#studioAIConsent').parentElement.textContent.includes('Phala')", "ai_step4_consent_discloses_both_providers")
    check("document.querySelector('#demoWorkspaceConsent').parentElement.textContent.includes('MiniMax M3.1 Flash Free') && document.querySelector('#demoWorkspaceConsent').parentElement.textContent.includes('XingChen Xing4.0 Free')", "ai_workspace_consent_names_both_models")
    check("document.querySelector('#studio-explain').textContent.includes('MiniMax M3.1 Flash Free') && document.querySelector('#studio-explain').textContent.includes('XingChen Xing4.0 Free')", "ai_step4_free_models_are_disclosed")
    check("document.getElementById('studioAIConnection').textContent.includes('MiniMax M3.1 Free') || document.getElementById('studioAIConnection').textContent.includes('Chưa có khóa API')", "ai_step4_model_status_no_old_gemma")
    command("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
    js("DemoStudio.showStep('source');window.scrollTo(0,0)")
    check("document.documentElement.scrollWidth <= 392", "mobile_no_page_overflow")
    check("document.getElementById('studioPanel-source').getBoundingClientRect().right <= 392 && document.querySelector('#studio-source').getBoundingClientRect().right <= 392", "mobile_content_not_clipped")
    capture("studio-source-mobile.png")
    # Browser-level touch gate: touchCancel must keep the source immutable; touchEnd must verify MANUAL.
    js("window.Workspace.show('tab-dispatch');DemoStudio.showStep('synthetic')")
    command("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 1})
    def touch_points_for_j4(target_slot):
        js("window.Workspace.show('tab-gantt')")
        js("""(() => {
          const bar=[...document.querySelectorAll('.demo-edit-bar')].find(b=>b.textContent==='J4');
          bar.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
        })()""")
        points = js("""(() => {
          const scene=DemoWorkspace.getScene();
          const bar=[...document.querySelectorAll('.demo-edit-bar')].find(b=>b.textContent==='J4');
          const track=bar.parentElement, r=track.getBoundingClientRect(), b=bar.getBoundingClientRect();
          return {x:b.left+b.width/2,y:b.top+b.height/2,
                  to:b.left+b.width/2+(TARGET-44)*r.width/scene.horizon,
                  w:innerWidth,h:innerHeight};
        })()""".replace('TARGET', str(target_slot)))
        assert 5 < points['x'] < points['w']-5 and 5 < points['to'] < points['w']-5, points
        assert 5 < points['y'] < points['h']-5, points
        return points
    def touch_move(target_slot, cancel=False):
        p=touch_points_for_j4(target_slot)
        command("Input.dispatchTouchEvent", {"type":"touchStart","touchPoints":[{"x":p["x"],"y":p["y"],"id":1}]})
        for step in range(1,9):
            x=p["x"]+(p["to"]-p["x"])*step/8
            command("Input.dispatchTouchEvent", {"type":"touchMove","touchPoints":[{"x":x,"y":p["y"],"id":1}]})
        check("!!document.querySelector('.demo-edit-ghost[data-status=REVIEW_REQUIRED]')", "touch_drag_preview_requires_review")
        command("Input.dispatchTouchEvent", {"type":"touchCancel" if cancel else "touchEnd","touchPoints":[]})
    touch_move(40, cancel=True)
    check("DemoWorkspace.getScene().hash==="+json.dumps(original_hash)+" && !DemoWorkspace.getScene().plans.MANUAL && !document.querySelector('.demo-edit-ghost')", 'touch_cancel_leaves_original_unmodified')
    touch_move(40)
    wait("!document.getElementById('demoEditRun').disabled && DemoWorkspace.getScene().plans.MANUAL?.jobs.some(j=>j.id==='J4' && j.machine==='M2' && j.start===40)",25)
    check("DemoWorkspace.getScene().plans.MANUAL.verification.status==='PASS' && currentReport.input_hash===DemoWorkspace.getScene().hash", 'touch_drop_verified_and_native_synced')
    capture('studio-manual-touch-emulated.png')
    js("document.getElementById('demoEditUndo').click()")
    check("DemoWorkspace.getScene().hash==="+json.dumps(original_hash)+" && !DemoWorkspace.getScene().plans.MANUAL", 'touch_undo_restores_original')
    command("Emulation.setTouchEmulationEnabled", {"enabled": False})
    # Native buttons must also support real Chromium keyboard input; never call click() from JS to fake it.
    js("""(() => {
      const bar=[...document.querySelectorAll('.demo-edit-bar')].find(b=>b.textContent==='J5');
      globalThis.__keyboardProbe=null;
      document.addEventListener('keydown',event=>{
        globalThis.__keyboardProbe={key:event.key,target:event.target?.textContent||'',trusted:event.isTrusted};
      },{once:true});
      bar.focus();
    })()""")
    check("document.activeElement?.matches('.demo-edit-bar') && document.activeElement.textContent==='J5'", 'keyboard_bar_is_focusable')
    command("Input.dispatchKeyEvent", {"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13})
    command("Input.dispatchKeyEvent", {"type":"keyUp","key":"Enter","code":"Enter","windowsVirtualKeyCode":13})
    keyboard_ok="document.getElementById('demoEditJob').value==='J5' && document.activeElement?.matches('.demo-edit-bar') && document.activeElement.textContent==='J5' && DemoWorkspace.getScene().hash==="+json.dumps(original_hash)+" && !DemoWorkspace.getScene().plans.MANUAL"
    if not js(keyboard_ok):
        print("KEYBOARD_DIAGNOSTIC", js("""JSON.stringify({
          probe:globalThis.__keyboardProbe,selected:document.getElementById('demoEditJob').value,
          focus:document.activeElement?.outerHTML?.slice(0,300),hash:DemoWorkspace.getScene().hash,
          manual:!!DemoWorkspace.getScene().plans.MANUAL,originalHash:ORIGINAL
        })""".replace("ORIGINAL",json.dumps(original_hash))), flush=True)
    check(keyboard_ok, 'keyboard_selects_bar_without_publishing')
    js("""(() => {
      const bar=[...document.querySelectorAll('.demo-edit-bar')].find(b=>b.textContent==='J6');
      bar.focus();
    })()""")
    check("document.activeElement?.matches('.demo-edit-bar') && document.activeElement.textContent==='J6'", 'keyboard_space_bar_is_focusable')
    command("Input.dispatchKeyEvent", {"type":"keyDown","key":" ","code":"Space","windowsVirtualKeyCode":32})
    command("Input.dispatchKeyEvent", {"type":"keyUp","key":" ","code":"Space","windowsVirtualKeyCode":32})
    space_ok="document.getElementById('demoEditJob').value==='J6' && document.activeElement?.matches('.demo-edit-bar') && document.activeElement.textContent==='J6' && DemoWorkspace.getScene().hash==="+json.dumps(original_hash)+" && !DemoWorkspace.getScene().plans.MANUAL"
    if not js(space_ok):
        print("SPACE_DIAGNOSTIC",js("""JSON.stringify({
          selected:document.getElementById('demoEditJob').value,
          focus:document.activeElement?.outerHTML?.slice(0,300),
          hash:DemoWorkspace.getScene().hash,manual:!!DemoWorkspace.getScene().plans.MANUAL
        })"""),flush=True)
    check(space_ok, 'keyboard_space_selects_without_publishing')
    # The independent no-mold factory-1 workflow must not mutate the demo-3 scene.
    check("!!document.getElementById('factoryLab') && !!document.getElementById('factoryMode')", "generic_factory_lab_mounted")
    js("window.Workspace.show('tab-dispatch')")
    js("document.getElementById('factoryExample').click()")
    wait("document.getElementById('factoryJson').value.includes('DEMO_CNC_CELL')", 15)
    check("JSON.parse(document.getElementById('factoryJson').value).jobs.every(j=>!('mold_id' in j))", "generic_factory_does_not_invent_molds")
    check("!!document.getElementById('factorySpreadsheet') && !!document.getElementById('factoryTemplateXLSX')", "factory_csv_xlsx_import_controls_present")
    js("""(async()=> {
      const response=await fetch('/api/factory/import/template?file_type=csv&version=factory-1');
      if(!response.ok) throw Error('Missing template CSV');
      const blob=await response.blob();
      const file=new File([blob], 'synthetic-demo.csv', {type:'text/csv'});
      const dt=new DataTransfer();dt.items.add(file);
      const input=document.getElementById('factorySpreadsheet');
      input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    })()""")
    wait("!!document.getElementById('factoryImportAccept')", 15)
    check("document.getElementById('factoryImportPreview').textContent.includes('READY_FOR_REVIEW') && document.getElementById('factoryExport').disabled", "factory_csv_preview_requires_explicit_review")
    check("document.getElementById('factoryImportPreview').textContent.includes('Giá điện:') && document.getElementById('factoryImportPreview').textContent.includes('Năng lực J1')", "factory_import_reveals_tariffs_machine_profiles_and_provenance")
    command("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
    js("document.getElementById('factoryImportPreview').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-factory-csv-import-review-mobile.png")
    check("document.documentElement.scrollWidth <= window.innerWidth+2", "factory_import_review_mobile_no_horizontal_overflow")
    command("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 1040, "deviceScaleFactor": 1, "mobile": False})
    js("document.getElementById('factoryImportAccept').click()")
    check("JSON.parse(document.getElementById('factoryJson').value).schema_version==='factory-1' && !document.getElementById('factoryImportAccept') && document.getElementById('factoryExport').disabled", "factory_csv_accept_only_loads_json")
    js("""(async()=> {
      const response=await fetch('/api/factory/import/template?file_type=xlsx&version=factory-2');
      const blob=await response.blob();
      const dt=new DataTransfer();dt.items.add(new File([blob], 'multistage.xlsx'));
      const input=document.getElementById('factorySpreadsheet');
      input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    })()""")
    wait("!!document.getElementById('factoryImportAccept')", 15)
    check("document.getElementById('factoryImportPreview').textContent.includes('factory-2') && document.getElementById('factoryExport').disabled", "factory_xlsx_multistage_preview_verified")
    js("document.getElementById('factoryImportAccept').click()")
    check("JSON.parse(document.getElementById('factoryJson').value).schema_version==='factory-2' && document.getElementById('factoryExport').disabled", "factory_xlsx_accept_without_automatic_solver")
    js("""(async()=> {
      const response=await fetch('/api/factory/import/template?file_type=csv&version=factory-1');
      const content=await response.text();
      const invalid=content.split(/\\r?\\n/).filter(line=>!line.startsWith('Tariffs,')).join('\\n');
      const dt=new DataTransfer();dt.items.add(new File([invalid], 'missing-tariffs.csv'));
      const input=document.getElementById('factorySpreadsheet');
      input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    })()""")
    wait("document.getElementById('factoryImportPreview').textContent.includes('IMPORT_PREFLIGHT_BLOCKED')", 15)
    check("!document.getElementById('factoryImportAccept') && document.getElementById('factoryExport').disabled", "factory_csv_missing_tariffs_blocks_accept_and_export")
    js("document.getElementById('factoryExample').click()")
    wait("document.getElementById('factoryJson').value.includes('DEMO_CNC_CELL')", 15)
    js("document.getElementById('factoryRun').click()")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('208.000') && document.getElementById('factoryResult').querySelectorAll('.factory-lab-gantt').length===3", "factory_fixed_machine_verified_costs_and_gantt")
    check("DemoWorkspace.getActiveDataset()==='factory' && document.getElementById('demoWorkspaceScenario').value==='factory' && document.getElementById('demoActiveDataset').textContent.includes('CNC')", "factory_result_activates_dataset_scope")
    js("window.Workspace.show('tab-gantt')")
    check("document.getElementById('demo-view-gantt').textContent.includes('Factory') && document.getElementById('demo-view-gantt').querySelectorAll('.demo-operation-bar').length>0 && !document.getElementById('demoSourceSchedule').getClientRects().length", "factory_gantt_is_factory_dataset_not_prior_mold")
    check("document.getElementById('demoFactoryPlan').value===DemoWorkspace.getReport().decision.selected_plan && document.getElementById('demo-view-gantt').textContent.includes(DemoWorkspace.getReport().input_hash)", "factory_shared_gantt_tracks_selected_plan_and_hash")
    js("""(()=>{const p=document.getElementById('demoFactoryPlan');p.value='B0';p.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    check("document.getElementById('demo-view-gantt').textContent.includes('Gantt · B0') && document.getElementById('demo-view-validation').textContent.includes('B0')", "factory_plan_selector_updates_shared_gantt_and_verifier")
    check("document.querySelector('#tab-gantt .demo-view-state').textContent.includes('Factory Lab') && document.getElementById('demoActiveDataset').textContent.includes('B0')", "factory_tab_header_displays_actual_factory_scope")
    js("""(()=>{const s=document.getElementById('demoWorkspaceScenario');s.value='native';s.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    wait("DemoWorkspace.getActiveDataset()==='native' && DemoWorkspace.getScene()?.hash==="+json.dumps(original_hash), 7)
    check("DemoWorkspace.getActiveDataset()==='native' && DemoWorkspace.getScene()?.hash==="+json.dumps(original_hash)+" && !document.querySelector('#demo-view-gantt .demo-operation-bar')", "switching_to_native_restores_its_own_report")
    js("""(()=>{const s=document.getElementById('demoWorkspaceScenario');s.value='factory';s.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    check("DemoWorkspace.getActiveDataset()==='factory' && DemoWorkspace.getReport().schema_version==='factory-1' && document.getElementById('demo-view-gantt').querySelectorAll('.demo-operation-bar').length>0", "switching_back_restores_factory_gantt_without_reoptimization")
    js("window.Workspace.show('tab-dispatch')")
    js("""(() => {const sel=document.getElementById('factoryMode');sel.value='JOINT_MACHINE_TIME';sel.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    check("document.getElementById('factoryExport').disabled && !document.getElementById('factoryResult').textContent.includes('208.000')", "factory_mode_change_invalidates_old_evidence")
    check("DemoWorkspace.getActiveDataset()==='factory' && !document.getElementById('demo-view-gantt').querySelector('.demo-operation-bar') && document.getElementById('demoActiveDataset').textContent.includes('cần phân tích lại')", "factory_edits_clear_shared_gantt")
    js("document.getElementById('factoryRun').click()")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('JOINT_MACHINE_TIME') && document.getElementById('factoryResult').textContent.includes('PASS')", "factory_joint_machine_time_verified")
    check("document.getElementById('factoryResult').textContent.includes('CP-SAT') && document.getElementById('factoryResult').textContent.includes('MACHINE_NO_OVERLAP')", "factory_cp_sat_and_rule_registry_visible")
    command("Emulation.setDeviceMetricsOverride", {"width": 1365, "height": 900, "deviceScaleFactor": 1, "mobile": False})
    js("document.getElementById('factoryLab').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-generic-factory-desktop.png")
    js("document.getElementById('factoryResult').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-generic-factory-results-desktop.png")
    check("getComputedStyle(document.querySelector('.factory-lab-table')).display!=='none' && getComputedStyle(document.querySelector('.factory-lab-cards')).display==='none'", "factory_desktop_table_visible")
    command("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
    js("document.getElementById('factoryLab').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-generic-factory-mobile.png")
    js("document.getElementById('factoryResult').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-generic-factory-results-mobile.png")
    check("getComputedStyle(document.querySelector('.factory-lab-table')).display==='none' && getComputedStyle(document.querySelector('.factory-lab-cards')).display!=='none'", "factory_mobile_cards_visible")
    js("document.getElementById('factoryPackaging').click()")
    wait("document.getElementById('factoryJson').value.includes('DEMO_PACKAGING_CELL')", 15)
    js("document.getElementById('factoryRun').click()")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('PRECEDENCE') && document.getElementById('factoryResult').textContent.includes('RESOURCE_CAPACITY') && document.getElementById('factoryResult').textContent.includes('OPTIMAL')", "factory_packaging_precedence_resource_cp_sat_browser")
    js("document.getElementById('factoryResult').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-packaging-results-mobile.png")
    js("document.getElementById('factoryChangeover').click()")
    wait("document.getElementById('factoryJson').value.includes('DEMO_PACKAGING_CHANGEOVER')", 15)
    js("document.getElementById('factoryRun').click()")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('SEQUENCE_CHANGEOVER') && document.querySelectorAll('.factory-lab-setup').length>0 && document.getElementById('factoryResult').textContent.includes('Setup khai báo: 7.000')", "factory_changeover_duration_fees_crew_and_gantt_verified")
    js("document.getElementById('factoryResult').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-changeover-results-mobile.png")
    js("""(() => {const editor=document.getElementById('factoryJson');
      const input=JSON.parse(editor.value);
      input.machines[0].changeovers.transitions.pop();
      editor.value=JSON.stringify(input);
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('factoryRun').click();
    })()""")
    wait("!document.getElementById('factoryRun').disabled && document.getElementById('factoryResult').textContent.includes('CONSTRAINT_INVALID')", 15)
    check("document.getElementById('factoryExport').disabled", "factory_incomplete_changeover_matrix_blocks_evidence")
    js("document.getElementById('factoryMultistage').click()")
    wait("document.getElementById('factoryJson').value.includes('MULTISTAGE_PACKAGING_SYNTHETIC')", 15)
    check("JSON.parse(document.getElementById('factoryJson').value).schema_version==='factory-2'", "multistage_versioned_input_loaded")
    js("""(() => {const s=document.getElementById('factoryMode');s.value='FIXED_MACHINE';s.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('factoryRun').click();})()""")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('43.700')", "multistage_fixed_machine_verified")
    js("""(() => {const s=document.getElementById('factoryMode');s.value='JOINT_MACHINE_TIME';s.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    check("document.getElementById('factoryExport').disabled", "multistage_mode_change_invalidates_evidence")
    js("document.getElementById('factoryRun').click()")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('factory-2') && document.getElementById('factoryResult').textContent.includes('OPERATION_ROUTING') && document.querySelectorAll('.factory-lab-routes .factory-lab-plan-card').length===2 && document.getElementById('factoryResult').textContent.includes('35.000')", "multistage_verified_operation_costs_routes_and_gantt")
    check("DemoWorkspace.getActiveDataset()==='factory' && DemoWorkspace.getReport().schema_version==='factory-2' && document.getElementById('demo-view-gantt').querySelectorAll('.demo-operation-bar').length>0", "factory_multistage_shared_gantt_tracks_factory_2")
    js("document.querySelector('.factory-lab-routes').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-multistage-results-mobile.png")
    command("Emulation.setDeviceMetricsOverride", {"width": 1365, "height": 900, "deviceScaleFactor": 1, "mobile": False})
    js("document.querySelector('.factory-lab-routes').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-multistage-results-desktop.png")
    command("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
    js("""(() => {const editor=document.getElementById('factoryJson');
      const input=JSON.parse(editor.value);
      input.work_orders[0].precedence=[];
      editor.value=JSON.stringify(input);
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('factoryRun').click();
    })()""")
    wait("!document.getElementById('factoryRun').disabled && document.getElementById('factoryResult').textContent.includes('ROUTING_INVALID')", 15)
    check("document.getElementById('factoryExport').disabled", "multistage_missing_routing_blocks_export")
    js("document.getElementById('factoryExample').click()")
    wait("document.getElementById('factoryJson').value.includes('DEMO_CNC_CELL')", 15)
    check("document.getElementById('factoryObjective').value==='ENERGY' && !document.getElementById('factoryMakespanSlack').disabled===false", "business_objective_controls_mounted")
    js("""(() => {const s=document.getElementById('factoryObjective');s.value='PRODUCTION';s.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('factoryRun').click();})()""")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('PRODUCTION') && document.getElementById('factoryResult').textContent.includes('236.000') && document.getElementById('factoryResult').textContent.includes('120 phút')", "business_production_prioritizes_completion_even_if_cost_rises")
    js("""(() => {const s=document.getElementById('factoryObjective');s.value='COMBINED';s.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    check("document.getElementById('factoryExport').disabled && !document.getElementById('factoryMakespanSlack').disabled", "business_objective_change_invalidates_evidence")
    js("document.getElementById('factoryRun').click()")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('COMBINED') && document.getElementById('factoryResult').textContent.includes('200.000') && document.getElementById('factoryResult').textContent.includes('B0 + 0 phút')", "business_combined_no_delay_guard")
    js("""(() => {const s=document.getElementById('factoryMakespanSlack');s.value='90';s.dispatchEvent(new Event('input',{bubbles:true}));})()""")
    check("document.getElementById('factoryExport').disabled", "business_slack_change_invalidates_evidence")
    js("document.getElementById('factoryRun').click()")
    wait("!document.getElementById('factoryRun').disabled && !document.getElementById('factoryExport').disabled", 35)
    check("document.getElementById('factoryResult').textContent.includes('B0 + 90 phút') && document.getElementById('factoryResult').textContent.includes('152.000') && document.getElementById('factoryResult').textContent.includes('270 phút')", "business_combined_explicit_slack_cost_tradeoff")
    js("document.getElementById('factoryResult').scrollIntoView({block:'start',behavior:'instant'})")
    capture("studio-business-combined-mobile.png")
    js("""(() => {const s=document.getElementById('factoryMakespanSlack');s.value='17';s.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('factoryRun').click();})()""")
    wait("!document.getElementById('factoryRun').disabled && document.getElementById('factoryResult').textContent.includes('PRODUCTION_GUARD_OFF_GRID')", 15)
    check("document.getElementById('factoryExport').disabled", "business_invalid_guard_blocks_evidence")
    js("""(() => {const editor=document.getElementById('factoryJson');
      const payload=JSON.parse(editor.value);
      payload.unsupported_constraints=['workforce_capacity'];
      editor.value=JSON.stringify(payload);
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('factoryRun').click();
    })()""")
    wait("!document.getElementById('factoryRun').disabled && document.getElementById('factoryResult').textContent.includes('UNSUPPORTED_CONSTRAINTS')", 15)
    check("document.getElementById('factoryExport').disabled && DemoWorkspace.getStoredNativeReport().input_hash==="+json.dumps(original_hash), "factory_unsupported_constraint_blocks_export_and_preserves_demo3")
    errors = [event for event in events if event.get("method") == "Runtime.exceptionThrown"]
    if errors:
        raise AssertionError(errors)
    result = {"all_checks_pass": True, "checks": checks, "javascript_exceptions": len(errors),
              "browser": browser_name, "scope": f"Local {browser_name} desktop/mobile emulation; real mouse plus emulated touch and keyboard input, real source and engine; no physical-device test, no live AI"}
    (OUT / "browser-checks.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))
except Exception as error:
    failure = {"all_checks_pass": False, "checks": checks, "failure": str(error),
               "browser": browser_name, "scope": f"Local {browser_name} browser input; later checks after this failure were not reached"}
    (OUT / "browser-checks.json").write_text(json.dumps(failure, indent=2), encoding="utf-8")
    if ws:
        try:
            capture('studio-failure.png')
        except Exception:
            pass
    raise
finally:
    if ws:
        ws.close()
    browser.terminate()
    try:
        browser.wait(timeout=5)
    except subprocess.TimeoutExpired:
        browser.kill()
    try:
        profile.cleanup()
    except OSError:
        pass
