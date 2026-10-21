"""Additional browser probes layered on the established real-input smoke harness."""
from pathlib import Path
import json

smoke = Path(__file__).with_name('demo-studio-smoke.py')
source = smoke.read_text(encoding='utf-8')

source = source.replace(
    '    js("document.getElementById(\'studioExport\').click()")',
    '''    for name in ['dispatch','overview','gantt','loadcurve','validation','sensitivity']:
        js("window.Workspace.show('tab-"+name+"')")
        check("DemoWorkspace.isTextile() && getComputedStyle(document.getElementById('demo-view-"+name+"')).display!=='none' && document.getElementById('demo-view-"+name+"').textContent.length>20", 'extra_textile_tab_'+name)
    js("window.Workspace.show('tab-dispatch')")
    js("document.getElementById('studioExport').click()")''', 1)

source = source.replace(
    '    js("document.getElementById(\'demoEditUndo\').click()")',
    '''    extra = js("""(() => {
      const findings=[];
      function probe(name, work){try{findings.push({name,pass:!!work()});}
        catch(error){findings.push({name,pass:false,error:error.stack});}}
      probe('manual_native_memo',()=>{showDecisionMemo();return document.getElementById('memoContent').textContent.includes('MANUAL');});
      probe('manual_publish_rollback',()=>{
        const previous=DemoWorkspace.getScene().hash, real=renderReport;
        let injected=false, caught=false;
        renderReport=function(...args){if(!injected){injected=true;throw Error('EXPECTED_RENDER_FAULT');}return real(...args);};
        try{const draft=structuredClone(DemoWorkspace.getReport());draft.input_hash='sha256:EXPECTED_RENDER_FAULT';DemoWorkspace.publishManual(draft);}
        catch(error){caught=error.message==='EXPECTED_RENDER_FAULT';}
        finally{renderReport=real;}
        return caught && DemoWorkspace.getScene().hash===previous && currentReport.input_hash===previous;
      });
      return findings;
    })()""")
    print('EXTRA_MANUAL_PROBES', json.dumps(extra), flush=True)
    (OUT / 'extra-manual-probes.json').write_text(json.dumps(extra,indent=2),encoding='utf-8')
    js("document.getElementById('demoEditUndo').click()")''', 1)

source = source.replace(
    '    # A cross-machine move uses a different duration',
    '''    missing = js("""(() => {
      const select=document.getElementById('validationPlanSelect'),previous=select.value;
      try{select.value='manual';renderValidation();return {pass:true};}
      catch(error){return {pass:false,error:error.stack};}
      finally{select.value=previous;renderValidation();}
    })()""")
    print('EXTRA_MISSING_MANUAL_PROBE',json.dumps(missing),flush=True)
    (OUT / 'extra-missing-manual-probe.json').write_text(json.dumps(missing,indent=2),encoding='utf-8')
    # A cross-machine move uses a different duration''', 1)

source = source.replace('browser-checks.json', 'browser-extra-checks.json')
exec(compile(source, str(smoke), 'exec'), {'__file__': str(smoke), '__name__': '__main__'})
out = smoke.parents[1] / 'work/demo-evidence'
manual = json.loads((out / 'extra-manual-probes.json').read_text(encoding='utf-8'))
missing = json.loads((out / 'extra-missing-manual-probe.json').read_text(encoding='utf-8'))
summary = {'all_checks_pass': all(p['pass'] for p in manual) and missing['pass'],
           'manual_probes': manual, 'select_manual_without_draft': missing}
(out / 'extra-probes-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print('EXTRA_PROBES_OVERALL', json.dumps(summary), flush=True)
if not summary['all_checks_pass']:
    raise SystemExit(1)
