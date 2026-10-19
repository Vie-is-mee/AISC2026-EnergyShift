"""Windows Edge regression: plan selection and real mouse timeline dragging. Requires requirements-browser.txt and the API on localhost:8765."""
import json, subprocess, tempfile, time, urllib.request
from pathlib import Path
import websocket

root=Path(__file__).resolve().parents[1]
out=root/'work/ui-qa/merged-tabs';out.mkdir(parents=True,exist_ok=True)
import socket
with socket.socket() as probe:
    probe.bind(("127.0.0.1",9351))
browser=subprocess.Popen([r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe','--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=9351','--remote-allow-origins=http://localhost:9351','--user-data-dir='+tempfile.mkdtemp(prefix='energyshift-tabs-'),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
ws=None;counter=0;events=[]
def command(method,params=None):
    global counter
    counter+=1;identifier=counter
    ws.send(json.dumps({'id':identifier,'method':method,'params':params or {}}))
    while True:
        message=json.loads(ws.recv())
        if message.get('id')==identifier:
            if 'error' in message:raise RuntimeError(message['error'])
            return message.get('result',{})
        events.append(message)
def js(code):
    r=command('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True})
    if 'exceptionDetails' in r:raise AssertionError(r['exceptionDetails'])
    return r.get('result',{}).get('value')
def check(code,label):
    assert js(code),label
    print('PASS '+label,flush=True)
def wait(code):
    for i in range(150):
        if js(code):return
        time.sleep(.2)
    raise AssertionError('Timeout '+code+' '+str([e for e in events if e.get('method')=='Runtime.exceptionThrown']))
try:
    for i in range(70):
        try:
            target=json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:9351/json/new?http://127.0.0.1:8765',method='PUT')));break
        except Exception:time.sleep(.2)
    ws=websocket.create_connection(target['webSocketDebuggerUrl'],origin='http://localhost:9351',timeout=120)
    command('Runtime.enable');command('Page.enable')
    command('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
    wait('typeof sample!=="undefined" && sample && !fixtureLoading && window.InputDesk')
    js('switchMainTab("tab-gantt")')
    check('!$("btnViewB1").disabled && !$("btnViewB2").disabled','B1/B2 selectable before first analysis')
    js('selectGanttPlan("b1")')
    check('!!currentReport && activeGanttPlan==="b1" && !$("btnViewB2").disabled && document.querySelectorAll(".job-pill-b1").length===8','B1 click calculates and displays B1, leaves B2 enabled')
    js('selectGanttPlan("b2")')
    check('activeGanttPlan==="b2" && document.querySelectorAll(".job-pill-b2").length===8','B2 displays actual B2 schedule')
    js('document.querySelector(".job-pill-b2").click()')
    check('!!scheduleEditorState && !$("scheduleEditForm").hidden','Simple bar click still opens inline editor')
    js('closeScheduleEditor();selectGanttPlan("b0");window.beforeDrag=Date.parse(currentReport.plans.B0.schedule.find(a=>a.job_id==="J1").start);document.querySelector("[data-job-id=J1]").scrollIntoView({block:"center"})')
    point=js('(()=>{const e=document.querySelector("[data-job-id=J1]"),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,delta:e.parentElement.getBoundingClientRect().width/48};})()')
    command('Input.dispatchMouseEvent',{'type':'mouseMoved','x':point['x'],'y':point['y']})
    command('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','clickCount':1,'x':point['x'],'y':point['y']})
    command('Input.dispatchMouseEvent',{'type':'mouseMoved','buttons':1,'x':point['x']+point['delta'],'y':point['y']})
    command('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','clickCount':1,'x':point['x']+point['delta'],'y':point['y']})
    check('!!scheduleDraft && currentReport===null && Date.parse(scheduleDraft.current_schedule.find(a=>a.job_id==="J1").start)-beforeDrag===1800000','Real mouse drag moves job exactly 30 minutes and invalidates old results')
    check('!scheduleEditorState && $("scheduleEditForm").hidden','Drag release does not accidentally open editor')
    js('selectGanttPlan("b1")')
    check('!!currentReport && activeGanttPlan==="b1" && !$("btnViewB0").disabled && !$("btnViewB2").disabled','B1 after dragging recalculates new input and all selectors remain usable')
    js('selectGanttPlan("b0");window.beforeKey=Date.parse(currentReport.plans.B0.schedule.find(a=>a.job_id==="J1").start);document.querySelector("[data-job-id=J1]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",altKey:true,bubbles:true}))')
    check('currentReport===null && Date.parse(scheduleDraft.current_schedule.find(a=>a.job_id==="J1").start)-beforeKey===1800000','Alt+Right moves the job 30 minutes through same draft model')
    errors=[e for e in events if e.get('method')=='Runtime.exceptionThrown'];assert not errors,errors
    print('PASS No browser runtime exceptions',flush=True)
finally:
    if ws:ws.close()
    browser.terminate()
