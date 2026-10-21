"""Real two-file upload, solar accounting, six-tab walkthrough and guide screenshots."""
from pathlib import Path
import sys

SMOKE=Path(__file__).with_name('demo-studio-smoke.py')
namespace={'__file__':str(SMOKE),'__name__':'source_files_harness'}
exec(compile(SMOKE.read_text(encoding='utf-8').split('try:\n    end = time.monotonic() + 15')[0],str(SMOKE),'exec'),namespace)
globals().update({k:v for k,v in namespace.items() if not k.startswith('__')})
GUIDE=ROOT/'docs/demo-guide-images'
GUIDE.mkdir(parents=True,exist_ok=True)
DOWNLOADS=Path(tempfile.mkdtemp(prefix='source-files-',dir=OUT))

def shot(name,selector=None):
    if selector:
        js('document.querySelector('+json.dumps(selector)+').scrollIntoView({block:"center",behavior:"instant"})')
        rect=js('(()=>{const r=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return {x:Math.max(0,r.x-12)+scrollX,y:Math.max(0,r.y-12)+scrollY,width:Math.min(innerWidth-Math.max(0,r.x-12),r.width+24),height:r.height+24,scale:1};})()')
        params={'format':'png','clip':rect,'captureBeyondViewport':True}
    else: params={'format':'png','captureBeyondViewport':False}
    (GUIDE/name).write_bytes(base64.b64decode(command('Page.captureScreenshot',params)['data']))

def upload(selector,path):
    doc=command('DOM.getDocument')
    node=command('DOM.querySelector',{'nodeId':doc['root']['nodeId'],'selector':selector})
    command('DOM.setFileInputFiles',{'nodeId':node['nodeId'],'files':[str(path)]})

try:
    end=time.monotonic()+15
    while True:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list') as response:
                target=next(item for item in json.load(response) if item.get('type')=='page')
            break
        except OSError:
            if time.monotonic()>end:raise
            time.sleep(.2)
    namespace['ws']=websocket.create_connection(target['webSocketDebuggerUrl'],origin=f'http://localhost:{port}',timeout=20)
    ws=namespace['ws']
    command('Page.enable');command('Runtime.enable');command('Network.enable')
    command('Browser.setDownloadBehavior',{'behavior':'allow','downloadPath':str(DOWNLOADS)})
    command('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})
    command('Page.navigate',{'url':BASE+'/'})
    wait("typeof fixtureLoading!=='undefined' && !!globalThis.DemoWorkspace && !!globalThis.DemoStudio && !fixtureLoading",20)
    check("!DemoWorkspace.getReport() && !document.getElementById('dataset').value && document.getElementById('studioAudit').disabled",'no_preset_dataset_or_analysis_on_start')
    check("document.querySelectorAll('.rail-item[data-tab]').length===6 && document.getElementById('sourceInputFile').checkVisibility() && !document.getElementById('demoWelcome').checkVisibility() && !document.getElementById('demoAdvancedSetup').checkVisibility()",'six_tabs_and_real_file_entry_without_sample_buttons')
    check("!document.getElementById('studioMinutes').checkVisibility() && !document.getElementById('studioUnitsConfirmed').checkVisibility()",'parameter_panel_removed')
    request_urls=[e['params']['request']['url'] for e in events if e.get('method')=='Network.requestWillBeSent']
    assert not any('/api/demo/fixtures' in u or u.endswith('/api/demo/studio/source') or '/studio/replay' in u for u in request_urls),request_urls
    checks.append('no_automatic_repository_dataset_requests')
    shot('input-start.png')
    shot('01-input-file.png','#sourceInputFile')
    upload('#sourceInputFile',ROOT/'Input_JSON_Schedule_Optimization.json')
    check("document.getElementById('studioAudit').disabled",'single_file_cannot_start_import')
    shot('02-output-file.png','#sourceOutputFile')
    upload('#sourceOutputFile',ROOT/'Output_JSON_Schedule_Optimization.json')
    check("!document.getElementById('studioAudit').disabled",'two_files_enable_import')
    shot('03-import-button.png','#studioAudit')
    js("document.getElementById('studioAudit').click()")
    wait("!document.getElementById('studioAudit').disabled && !document.getElementById('studioPanel-textile').hidden",25)
    check("document.getElementById('studioFunnel').textContent.includes('275') && document.getElementById('studioFunnel').textContent.includes('91') && document.getElementById('studioSelectedCount').textContent.includes('18 / 91')",'uploaded_source_audit_and_selected_scope')
    js("document.getElementById('studioSelectionCount').value='12';document.getElementById('studioSelectionCount').dispatchEvent(new Event('input',{bubbles:true}))")
    check("document.getElementById('studioSelectedCount').textContent.includes('12 / 91') && !document.getElementById('studioRunTextile').disabled",'user_can_select_twelve_rows')
    js("document.getElementById('studioSelectAll').click()")
    check("document.getElementById('studioSelectedCount').textContent.includes('91 / 91')",'user_can_select_all_eligible_rows')
    js("document.getElementById('studioSelectionCount').value='92';document.getElementById('studioSelectionCount').dispatchEvent(new Event('input',{bubbles:true}))")
    check("document.getElementById('studioRunTextile').disabled && document.getElementById('studioStatus').dataset.error==='true'",'out_of_range_count_blocks_analysis')
    js("document.getElementById('studioClearSelection').click()")
    check("document.getElementById('studioSelectedCount').textContent.includes('0 / 91') && document.getElementById('studioRunTextile').disabled",'empty_selection_blocks_analysis')
    js("document.getElementById('studioSelectionCount').value='8';document.getElementById('studioSelectCount').click()")
    check("document.getElementById('studioSelectedCount').textContent.includes('8 / 91')",'user_can_restore_eight_rows')
    check("document.getElementById('studioSolar').checked && document.getElementById('studioMinutes').value==='5' && document.getElementById('studioPower').value==='W' && document.getElementById('studioPrice').value==='Wh' && !document.getElementById('studioRunTextile').disabled",'defaults_and_solar_ready_without_parameter_steps')
    # Deliberately poison legacy hidden fields: uploaded defaults must be authoritative.
    js("document.getElementById('studioCurrency').value='';document.getElementById('studioMinutes').value='';document.getElementById('studioUnitsConfirmed').checked=false;document.getElementById('studioScopeConfirmed').checked=false")
    shot('04-analyze-button.png','#studioRunTextile')
    shot('input-after-import.png')
    js("document.getElementById('studioRunTextile').click()")
    wait("DemoWorkspace.getReport()?.status==='COMPLETED' && !document.getElementById('studioRunTextile').disabled",50)
    check("document.body.dataset.view==='tab-gantt' && DemoWorkspace.isTextile() && currentReport===null",'analysis_opens_uploaded_source_gantt_not_fixture')
    check("(()=>{const track=document.querySelector('#demo-view-gantt .demo-machine-track'),bar=document.querySelector('#demo-view-gantt .demo-operation-bar'),ruler=document.querySelectorAll('#demo-view-gantt .demo-gantt-ruler span'),zoom=document.querySelector('#demo-view-gantt .demo-gantt-zoom input');return track && track.getBoundingClientRect().height>=65 && bar.getBoundingClientRect().height>=45 && ruler.length===5 && zoom.value==='3';})()", 'enlarged_gantt_lanes_ruler_and_default_zoom')
    check("(()=>{const ruler=document.querySelector('#demo-view-gantt .demo-gantt-ruler'),marks=ruler.querySelectorAll('span'),end=marks[marks.length-1],rr=ruler.getBoundingClientRect(),er=end.getBoundingClientRect();return getComputedStyle(end).whiteSpace==='nowrap' && er.right<=rr.right+2 && er.left>=rr.left && er.height<32 && end.textContent.includes('1152');})()", 'gantt_final_1152_slot_label_unclipped_and_single_line')
    report=js('DemoWorkspace.getReport()')
    assert report['manifest']['mapping']['solar_enabled'] is True
    policy=report['manifest']['cost_policy']
    assert policy['move_cost_mode']=='SOURCE_DERIVED_ONE_MINUTE_PROXY',policy
    assert policy['effective_cost_per_move']>0
    assert abs(policy['effective_cost_per_move']-policy['reference_power_kw']*policy['reference_tariff_per_kwh']/60)<1e-10
    checks.append('source_derived_nonzero_coordination_proxy_is_auditable')
    import hashlib
    for name in ('Input_JSON_Schedule_Optimization.json','Output_JSON_Schedule_Optimization.json'):
        assert report['manifest']['files'][name]['sha256']=='sha256:'+hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
    checks.append('report_hashes_match_exact_uploaded_bytes')
    for code,p in report['plans'].items():
        cost=p['cost'];assert p['verification']['status']=='PASS'
        assert abs(cost['energy_kwh']-cost['solar_kwh']-cost['grid_kwh'])<1e-8
        assert cost['electricity']>=0 and all(v>=0 for v in cost['series']['grid_kw'])
        assert all(abs(load-grid-solar)<1e-8 for load,grid,solar in zip(cost['series']['load_kw'],cost['series']['grid_kw'],cost['series']['solar_used_kw']))
    assert report['plans']['B2']['cost']['solar_kwh']>0
    checks.append('solar_grid_energy_balance_and_nonnegative_grid_cost')
    shot('05-decision-tab.png',".rail-nav [data-tab='tab-overview']")
    js("Workspace.show('tab-overview');document.getElementById('tab-overview').scrollIntoView({block:'start',behavior:'instant'})")
    shot('decision-result.png')
    for number,name in [(6,'gantt'),(7,'loadcurve'),(8,'validation'),(9,'sensitivity')]:
        selector=".rail-nav [data-tab='tab-"+name+"']"
        shot(f'{number:02d}-{name}-tab.png',selector)
        js("Workspace.show('tab-"+name+"')")
        check("document.querySelectorAll('.tab-pane.active').length===1 && document.getElementById('demo-view-"+name+"').textContent.length>20",'uploaded_source_view_'+name)
        shot(name+'-result.png')
    check("document.getElementById('demo-view-loadcurve').textContent.includes('Điện mặt trời dùng') && document.getElementById('demo-view-loadcurve').textContent.includes('Điện lưới')",'solar_results_are_visible_in_energy_tab')
    js("Workspace.show('tab-loadcurve')")
    check("(()=>{const chart=document.querySelector('#demo-view-loadcurve .studio-plot'),grid=document.querySelector('#demo-view-loadcurve .demo-chart-grid');return chart && chart.getBoundingClientRect().height>=340 && grid && getComputedStyle(grid).gridTemplateColumns.split(' ').length===1;})()", 'full_width_large_electricity_line_charts')
    # All source series are retained; only the 24h presentation bins change.
    check("(()=>{const cards=[...document.querySelectorAll('#demo-view-loadcurve .energy-explorer')];return cards.length>=2 && cards.every(c=>c.dataset.energyDay==='1' && c.dataset.energyResolution==='15' && c.dataset.energyDisplayedBuckets==='96' && c.dataset.energyOriginalSamples==='1152') && document.getElementById('demo-view-loadcurve').textContent.includes('Đơn vị chi phí nguồn (chưa xác minh)');})()", 'energy_explorer_defaults_24_hour_window_source_unit')
    base_energy=js("DemoWorkspace.getReport().plans.B1.cost.energy_kwh")
    js("document.querySelector('#demo-view-loadcurve .energy-explorer-nav-button:last-child').click()")
    check("[...document.querySelectorAll('#demo-view-loadcurve .energy-explorer')].every(c=>c.dataset.energyDay==='2' && c.dataset.energyDisplayedBuckets==='96')", 'all_electricity_charts_navigate_to_day_two_together')
    js("(()=>{const s=document.querySelector('#demo-view-loadcurve .energy-explorer-resolution select');s.value='15';s.dispatchEvent(new Event('change',{bubbles:true}));})()")
    check("[...document.querySelectorAll('#demo-view-loadcurve .energy-explorer')].every(c=>c.dataset.energyResolution==='15' && c.dataset.energyDisplayedBuckets==='96')", 'fifteen_minute_energy_view_preserves_raw_series')
    js("(()=>{const s=document.querySelector('#demo-view-loadcurve .energy-explorer-resolution select');s.value='5';s.dispatchEvent(new Event('change',{bubbles:true}));})()")
    check("[...document.querySelectorAll('#demo-view-loadcurve .energy-explorer')].every(c=>c.dataset.energyResolution==='5' && c.dataset.energyDisplayedBuckets==='288')", 'five_minute_energy_detail')
    js("document.querySelectorAll('#demo-view-loadcurve .energy-explorer-day')[3].click()")
    check("[...document.querySelectorAll('#demo-view-loadcurve .energy-explorer')].every(c=>c.dataset.energyDay==='4')", 'fourth_day_navigation_with_real_source')
    js("document.querySelector('#demo-view-loadcurve .energy-explorer svg rect[tabindex]').focus()")
    check("document.querySelector('#demo-view-loadcurve .energy-explorer-inspect').textContent.includes('đỉnh')", 'keyboard_accessible_peak_and_average_tooltip')
    check("DemoWorkspace.getReport().plans.B1.cost.energy_kwh==="+str(base_energy), 'energy_navigation_never_changes_backend_kwh')
    js("Workspace.show('tab-validation');Workspace.show('tab-loadcurve')")
    check("document.querySelector('#demo-view-loadcurve .energy-explorer').dataset.energyDay==='4' && document.querySelector('#demo-view-loadcurve .energy-explorer').dataset.energyResolution==='5'", 'chart_day_and_resolution_survive_tab_switch')
    js("(()=>{const s=document.querySelector('#demo-view-loadcurve .energy-explorer-resolution select');s.value='60';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#demo-view-loadcurve .energy-explorer-day').click()})()")
    check("document.querySelector('#demo-view-loadcurve .energy-explorer').dataset.energyDisplayedBuckets==='24'",'explicit_hourly_view_available')
    js("Workspace.show('tab-dispatch')")
    check("(()=>{const chart=document.querySelector('#studioTextileResult .studio-plot');return chart && parseFloat(getComputedStyle(chart).height)>=340;})()", 'large_import_analysis_charts')
    js('showDecisionMemo()')
    check("document.body.dataset.view==='tab-overview' && document.getElementById('demoWorkspaceMemo').open",'header_memo_uses_uploaded_source')
    check("document.querySelector('#demoWorkspaceMemo .ai-live-hero h2') && document.querySelector('#demoWorkspaceMemo .ai-live-evidence').open && document.querySelector('#demoWorkspaceAILivePanel').dataset.aiState==='idle'",'live_ai_workspace_hero_engine_evidence_idle_state')
    check("document.querySelectorAll('#demoWorkspaceMemo .ai-live-suggestions button').length===3 && document.getElementById('demoWorkspaceReportAI').getBoundingClientRect().height>=54",'live_ai_prominent_suggestions_and_actions')
    js("document.querySelector('#demoWorkspaceMemo [data-ai-prompt-for]').click()")
    check("document.getElementById('demoWorkspaceQuestion').value.includes('So sánh B1 và B2') && document.querySelector('[data-ai-count-for=demoWorkspaceQuestion]').textContent.startsWith(String(document.getElementById('demoWorkspaceQuestion').value.length)) && document.querySelector('#demoWorkspaceAILivePanel').dataset.aiState==='idle'",'live_ai_suggestions_fill_question_without_generating_answer')
    check("!document.getElementById('demoWorkspaceAIAnswer').textContent.includes('B2 đã thay đổi') && document.getElementById('demoWorkspaceReportAI').disabled",'live_ai_never_scripts_answer_or_sends_without_consent')
    shot('10-memo-button.png','#btnExportMemo')
    shot('11-ai-consent.png',"label:has(#demoWorkspaceConsent)")
    # Do not send any source data externally in this local presentation walkthrough.
    check("document.getElementById('demoWorkspaceReportAI').disabled",'ai_requires_explicit_consent')
    js("document.getElementById('demoWorkspaceConsent').checked=true;document.getElementById('demoWorkspaceConsent').dispatchEvent(new Event('change'))")
    shot('12-ai-report-button.png','#demoWorkspaceReportAI')
    js("document.getElementById('demoWorkspaceConsent').checked=false;document.getElementById('demoWorkspaceConsent').dispatchEvent(new Event('change'))")
    js("document.querySelector('#demoNextSteps button:last-child').click()")
    destination=DOWNLOADS/'EnergyShift-analysis.json'
    wait("!document.getElementById('demoWorkspaceExport').disabled")
    deadline=time.monotonic()+8
    while not destination.is_file() and time.monotonic()<deadline:time.sleep(.1)
    assert destination.is_file()
    exported=json.loads(destination.read_text(encoding='utf-8'))
    assert exported['report']['input_hash']==report['input_hash']
    checks.append('downloaded_report_keeps_uploaded_source_and_solar_mapping')
    shot('13-export-button.png','#demoNextSteps button:last-child')
    command('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    for name in ['dispatch','overview','gantt','loadcurve','validation','sensitivity']:
        js("Workspace.show('tab-"+name+"')")
        check('document.documentElement.scrollWidth<=392','mobile_no_page_overflow_'+name)
    js("Workspace.show('tab-loadcurve');document.querySelector('#demo-view-loadcurve .energy-explorer').scrollIntoView({block:'start',behavior:'instant'})")
    check("(()=>{const c=document.querySelector('#demo-view-loadcurve .energy-explorer'),nav=c.querySelector('.energy-explorer-nav'),sel=c.querySelector('select');const sc=c.querySelector('.energy-explorer-plot-scroll');return c.getBoundingClientRect().width<=390 && nav.getBoundingClientRect().width<=390 && sel.getBoundingClientRect().height>=40 && sc.scrollWidth>sc.clientWidth && c.dataset.energyDisplayedBuckets==='24' && document.documentElement.scrollWidth<=392;})()", 'mobile_energy_explorer_controls_fit_390px')
    shot('energy-explorer-mobile.png')
    js("Workspace.show('tab-dispatch')")
    shot('input-mobile.png')
    # Count changes must immediately become the analyzed scope, without a separate Apply click.
    command('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})
    js("Workspace.show('tab-dispatch')")
    for job_count in (32,12,50,91,18):
        js("document.getElementById('studioSelectionCount').value="+json.dumps(str(job_count))+";document.getElementById('studioSelectionCount').dispatchEvent(new Event('input',{bubbles:true}))")
        check("document.getElementById('studioSelectedCount').textContent.includes("+json.dumps(str(job_count)+' / 91')+") && !document.getElementById('studioRunTextile').disabled", 'count_input_auto_select_'+str(job_count))
        check("!DemoWorkspace.getReport() && document.getElementById('demoWorkspaceExport').disabled",'count_edit_clears_previous_'+str(job_count))
        js("document.getElementById('studioRunTextile').click()")
        wait("DemoWorkspace.getReport()?.plans?.B0?.schedule?.length==="+str(job_count)+" && !document.getElementById('studioRunTextile').disabled",60)
        actual=js('DemoWorkspace.getReport()')
        if job_count==18:
            b2=actual['plans']['B2']['cost']
            assert b2['total']>0 and b2['move_cost']>0 and b2['changed_jobs']>0, b2
            assert abs(b2['total']-b2['electricity']-b2['move_cost'])<1e-9
            js("Workspace.show('tab-overview')")
            check("document.getElementById('demo-view-overview').textContent.includes('quy ước mô phỏng') && document.getElementById('demo-view-overview').textContent.includes('B2 có chi phí mua điện lưới = 0')", 'b2_positive_source_cost_and_transparent_cost_formula_visible')
            js("Workspace.show('tab-dispatch')")
        assert all(len(p['schedule'])==job_count for p in actual['plans'].values())
        assert actual['manifest']['selected'] and len(actual['manifest']['selected'])==job_count
        check("DemoWorkspace.getScene().count==="+str(job_count)+" && document.querySelectorAll('#demo-view-gantt .demo-operation-bar').length==="+str(job_count), 'gantt_matches_exact_selected_count_'+str(job_count))
        assert actual['solver']['status']=='HEURISTIC_FEASIBLE'
        assert actual['solver']['algorithm']=='SOLAR_AWARE_COORDINATED_LOCAL_SEARCH'
        assert actual['solver']['b2_proven_optimal'] is False
        assert actual['plans']['B2']['verification']['status']=='PASS'
        assert actual['plans']['B1']['verification']['status']=='PASS'
        assert actual['plans']['B2']['cost']['total'] < actual['plans']['B1']['cost']['total']
        b1_starts={j['job_id']:j['start_slot'] for j in actual['plans']['B1']['schedule']}
        moved=sum(j['start_slot']!=b1_starts[j['job_id']] for j in actual['plans']['B2']['schedule'])
        assert moved>=2, (job_count,moved)
        js("Workspace.show('tab-gantt');document.getElementById('demo-view-gantt').querySelectorAll('button')[2].click()")
        check("document.querySelectorAll('#demo-view-gantt .demo-operation-bar--b2-changed').length==="+str(moved)+" && document.getElementById('demo-view-gantt').textContent.includes('B2 so với B1')", 'b2_gantt_highlights_verified_coordinated_changes_'+str(job_count))
        if job_count==91:
            assert actual['status']=='REPAIRED_WITH_INVALID_BASELINE',actual['status']
            assert actual['plans']['B0']['verification']['status']=='FAIL'
            assert actual['plans']['B0']['cost'] is None
            assert all(actual['plans'][code]['verification']['status']=='PASS' for code in ('B1','B2'))
            check("document.getElementById('demo-view-overview').textContent.includes('không công bố tiết kiệm so B0') && document.getElementById('studioStatus').dataset.error==='false'", 'invalid_baseline_honest_repair_'+str(job_count))
            js("Workspace.show('tab-gantt');document.querySelector('#demo-view-gantt button').click()")
            check("document.querySelectorAll('#demo-view-gantt .demo-operation-bar').length==="+str(job_count), 'invalid_b0_gantt_keeps_all_jobs_'+str(job_count))
            js("document.getElementById('demo-view-gantt').querySelectorAll('button')[1].click()")
            check("document.querySelectorAll('#demo-view-gantt .demo-operation-bar').length==="+str(job_count), 'repaired_b1_gantt_keeps_all_jobs_'+str(job_count))
            for tab_name in ('dispatch','overview','gantt','loadcurve','validation','sensitivity'):
                js("Workspace.show('tab-"+tab_name+"')")
                check("document.getElementById('demo-view-"+tab_name+"').textContent.length>25", 'all_six_tabs_render_repaired_91_'+tab_name)
            check("document.getElementById('demo-view-overview').textContent.includes('Không so sánh B0 không hợp lệ') && document.getElementById('demo-view-sensitivity').textContent.includes('không so sánh B0')", 'invalid_baseline_never_fabricates_savings')
        if job_count==91:
            js("const z=document.querySelector('#demo-view-gantt .demo-gantt-zoom input');z.value='4';z.dispatchEvent(new Event('input',{bubbles:true}))")
            check("document.querySelector('#demo-view-gantt .demo-gantt-rows').style.width==='400%'",'large_gantt_zoom')
            command('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
            check("document.documentElement.scrollWidth<=392", 'large_gantt_mobile_no_page_overflow')
            command('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})
        js("Workspace.show('tab-dispatch')")
    # Changing either file invalidates the previous report before another calculation.
    replacement=DOWNLOADS/'updated-input.json'
    replacement.write_bytes((ROOT/'Input_JSON_Schedule_Optimization.json').read_bytes())
    upload('#sourceInputFile',replacement)
    check("!DemoWorkspace.getReport() && document.getElementById('demoWorkspaceExport').disabled && document.getElementById('studioRunTextile').disabled",'replacing_file_clears_old_evidence_and_export')
    errors=[e for e in events if e.get('method')=='Runtime.exceptionThrown']
    assert not errors,errors
    result={'all_checks_pass':True,'checks':checks,'javascript_exceptions':len(errors),'report':report}
    (OUT/'source-files-walkthrough.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'all_checks_pass':True,'checks':checks,'javascript_exceptions':0,'costs':{code:p['cost'] for code,p in report['plans'].items()}},default=str)[:1600],flush=True)
finally:
    if ws:ws.close()
    browser.terminate()
    try:browser.wait(timeout=5)
    except subprocess.TimeoutExpired:browser.kill()
    try:profile.cleanup()
    except OSError:pass
