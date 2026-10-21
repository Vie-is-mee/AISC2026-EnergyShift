"""Exercise live AI through an isolated browser, using synthetic inputs only."""
import sys
from pathlib import Path

if '--allow-live-api' not in sys.argv:
    raise SystemExit('Use --allow-live-api to send synthetic data to live AI providers.')

SMOKE = Path(__file__).with_name('demo-studio-smoke.py')
sys.path.insert(0, str(SMOKE.parent))
namespace = {'__file__': str(SMOKE), '__name__': 'live_ai_harness'}
source = SMOKE.read_text(encoding='utf-8')
exec(compile(source.split('try:\n    end = time.monotonic() + 15')[0], str(SMOKE), 'exec'), namespace)
globals().update({k: v for k, v in namespace.items() if not k.startswith('__')})

results = {}

def initialize():
    if js('location.origin')==BASE:
        js('sessionStorage.clear()')
    command('Page.navigate', {'url': BASE + '/?demo=1'})
    wait("typeof fixtureLoading!=='undefined' && !fixtureLoading && !!globalThis.DemoWorkspace && !!globalThis.AssistantIntake", 20)

def exercise(name, action):
    before=len(checks)
    try:
        action()
        results[name]={'passed':True, 'checks':checks[before:]}
    except Exception as error:
        results[name]={'passed':False, 'error':str(error), 'checks':checks[before:]}
    print(json.dumps({'flow':name, **results[name]}, ensure_ascii=True), flush=True)

try:
    end=time.monotonic()+15
    while True:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list') as response:
                target=next(item for item in json.load(response) if item.get('type')=='page')
            break
        except OSError:
            if time.monotonic()>end: raise
            time.sleep(.2)
    namespace['ws']=websocket.create_connection(target['webSocketDebuggerUrl'],origin=f'http://localhost:{port}',timeout=20)
    ws=namespace['ws']
    command('Page.enable');command('Runtime.enable');command('Network.enable')
    command('Browser.setDownloadBehavior',{'behavior':'allow','downloadPath':str(OUT)})
    command('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})

    def click(identifier):
        js('document.getElementById('+json.dumps(identifier)+').click()')

    def run():
        click('analyze')
        wait('!preparing && !pending && !document.getElementById("analyze").disabled',40)

    def intent():
        initialize()
        js("document.getElementById('intentHelp').open=true")
        from assistant_browser_checks import run_checks
        run_checks(js,click,wait,check,command,OUT,ROOT)
    exercise('intent_interpretation',intent)

    def csv_mapping():
        initialize()
        from ai_csv_browser_checks import run_checks
        run_checks(js,click,wait,check,run,command,OUT,ROOT)
    exercise('csv_mapping_and_human_review',csv_mapping)

    initialize()
    click('demoWelcomeRun')
    wait("DemoWorkspace.getScene()?.selected==='B1' && !document.getElementById('demoWelcomeRun').disabled",45)
    original_hash=js('DemoWorkspace.getScene().hash')
    js("DemoWorkspace.openMemo();document.getElementById('demoWorkspaceQuestion').value='Giải thích vì sao B1 được chọn, tách tiền điện, phí setup và chi phí ngoài mô hình cần xác nhận. Không đề xuất lịch mới.';document.getElementById('demoWorkspaceQuestion').dispatchEvent(new Event('input'));document.getElementById('demoWorkspaceConsent').checked=true;document.getElementById('demoWorkspaceConsent').dispatchEvent(new Event('change'))")
    for kind,button in [('context','demoWorkspaceContextAI'),('report','demoWorkspaceReportAI')]:
        if kind=='report': time.sleep(3.1)
        def explain(kind=kind, button=button):
            start=len(events)
            check("!document.getElementById('"+button+"').disabled",kind+'_consented_action_available')
            click(button)
            wait("!document.getElementById('"+button+"').disabled",150)
            response_events=[e for e in events[start:] if e.get('method')=='Network.responseReceived' and '/api/demo/studio/ai' in e.get('params',{}).get('response',{}).get('url','') and not e['params']['response']['url'].endswith(('status','diagnostics'))]
            payload=None
            for event in response_events:
                try:
                    raw=command('Network.getResponseBody',{'requestId':event['params']['requestId']})
                    payload=json.loads(raw['body'])
                except Exception: pass
            if payload is not None:
                results[kind+'_response']=payload
                print(json.dumps({'flow':kind+'_response','status':payload.get('status'),'model':payload.get('model'),'cached':payload.get('cached'),'http_status':payload.get('http_status'),'summary':payload.get('narrative',{}).get('summary')},ensure_ascii=True),flush=True)
            check('DemoWorkspace.getScene().hash==='+json.dumps(original_hash),kind+'_preserves_verified_schedule')
            capture('live-ai-'+kind+'-desktop.png')
            assert payload and payload.get('status')=='OK',js("document.getElementById('demoWorkspaceAIStatus').textContent")
            check("document.getElementById('demoWorkspaceAIAnswer').textContent.length>80",kind+'_narrative_rendered')
        exercise('evidence_'+kind,explain)

    errors=[e for e in events if e.get('method')=='Runtime.exceptionThrown']
    results['javascript_exceptions']=errors
    results['scope']='Live provider calls, local UI, synthetic production data; no mock model, no paid fallback.'
    destination=OUT/'live-ai-walkthrough.json'
    destination.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Evidence: '+str(destination),flush=True)
finally:
    if ws: ws.close()
    browser.terminate()
    try: browser.wait(timeout=5)
    except subprocess.TimeoutExpired: browser.kill()
    try: profile.cleanup()
    except OSError: pass
