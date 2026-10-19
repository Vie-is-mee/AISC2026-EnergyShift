"""One explicit live model call plus actual CSV upload, human review and engine trace."""
import base64
import csv
import io
import json


def run_checks(js,click,wait,check,run,command,out,root):
    js('loadFixture("editable-cell")')
    wait('!fixtureLoading && JSON.parse(document.getElementById("dataset").value).jobs.length===8')
    js('switchMainTab("tab-dispatch");document.getElementById("importSettings").open=true;window.csvDatasetBefore=document.getElementById("dataset").value')
    # Upload bytes rather than pasting: a textarea normalizes CRLF, while the raw-file path must not.
    row=js('InputModel.rowsFrom(InputDesk.csvContext().snapshot)[0]')
    buffer=io.StringIO(newline='');writer=csv.writer(buffer,lineterminator='\r\n')
    writer.writerow(['Work order','Routing','Units','Equipment','Launch','Ready','Deadline','Notes'])
    writer.writerow([' '+row['job_id']+' ','','',row['machine_id'],row['start'],'','','Operator note, not a modeled constraint'])
    raw='\ufeff'+buffer.getvalue()
    source=out/'ai-csv-live-source.csv';source.write_bytes(raw.encode('utf-8'))
    doc=command('DOM.getDocument');node=command('DOM.querySelector',{'nodeId':doc['root']['nodeId'],'selector':'#tableFile'})
    command('DOM.setFileInputFiles',{'nodeId':node['nodeId'],'files':[str(source)]})
    wait('(()=>{try{return InputDesk.csvContext().raw_text.length>0;}catch{return false;}})()')
    js('window.csvRawBefore=InputDesk.csvContext().raw_text')
    assert js('window.csvRawBefore')==raw, 'Raw upload must preserve BOM/CRLF'
    click('aiCSVStart')
    check('document.getElementById("aiCSVStatus").textContent.includes("đồng ý") && document.getElementById("aiCSVResult").hidden', 'csv_model_requires_consent')
    js('document.getElementById("aiCSVConsent").checked=true')
    click('aiCSVStart')
    wait('!document.getElementById("aiCSVStart").disabled && document.getElementById("aiCSVTrace").textContent.includes("API")',timeout=120)
    if js('document.getElementById("aiCSVResult").hidden'):
        failure=js('({trace:document.getElementById("aiCSVTrace").textContent,status:document.getElementById("aiCSVStatus").textContent})')
        (root/'docs/evaluation/ai_csv_live_failure.json').write_text(json.dumps(failure,ensure_ascii=True,indent=2)+'\n',encoding='utf-8')
        raise AssertionError('Live CSV model did not produce a usable proposal: '+json.dumps(failure,ensure_ascii=True))
    check('document.getElementById("dataset").value===window.csvDatasetBefore && document.getElementById("aiCSVAccept").disabled', 'csv_ai_does_not_apply_or_approve')
    expected=['job_id','template_id','quantity','machine_id','start','release','due','UNMODELED']
    js('window.csvProposalMappingMatched=JSON.stringify([...document.querySelectorAll("#aiCSVMapping select")].map(s=>s.value))===JSON.stringify('+json.dumps(expected)+')')
    js('([...document.querySelectorAll("#aiCSVMapping select")]).forEach((s,i)=>{s.value='+json.dumps(expected)+'[i];s.dispatchEvent(new Event("change"));})')
    click('aiCSVPreview')
    wait('!document.getElementById("aiCSVStart").disabled && document.querySelectorAll("#aiCSVReviewRows tr").length===1')
    check('document.querySelector("#aiCSVReviewRows input[data-field=quantity]").value===""', 'csv_missing_quantity_not_auto_filled')
    for field in ['template_id','quantity','release','due']:
        js('document.querySelector("#aiCSVReviewRows input[data-field='+field+']").closest("td").querySelector("button").click()')
    js('document.getElementById("aiCSVAck").checked=true;document.getElementById("aiCSVAck").dispatchEvent(new Event("change"))')
    check('document.getElementById("aiCSVAccept").disabled', 'csv_unmodeled_columns_require_separate_ack')
    js('document.getElementById("aiCSVExtras").checked=true;document.getElementById("aiCSVExtras").dispatchEvent(new Event("change"));document.getElementById("aiCSVQuestionsAck").checked=true;document.getElementById("aiCSVQuestionsAck").dispatchEvent(new Event("change"));document.getElementById("aiCSVAck").checked=true;document.getElementById("aiCSVAck").dispatchEvent(new Event("change"))')
    js('document.querySelector("#aiCSVReviewRows input[data-field=quantity]").value="1001";document.querySelector("#aiCSVReviewRows input[data-field=quantity]").dispatchEvent(new Event("input"))')
    check('!document.getElementById("aiCSVAck").checked && document.getElementById("aiCSVAccept").disabled', 'csv_cell_edit_resets_human_ack')
    js('document.getElementById("aiCSVAck").checked=true;document.getElementById("aiCSVAck").dispatchEvent(new Event("change"))')
    click('aiCSVAccept')
    wait('!document.getElementById("aiCSVStart").disabled')
    check('document.getElementById("aiCSVStatus").textContent.includes("Số lượng") && document.getElementById("dataset").value===window.csvDatasetBefore', 'csv_backend_rejects_quantity_guess_without_changing_plan')
    js('document.querySelector("#aiCSVReviewRows input[data-field=quantity]").closest("td").querySelector("button").click()')
    js('document.getElementById("aiCSVPanel").scrollIntoView({block:"start"})')
    command('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})
    (out/'ai-csv-desktop.png').write_bytes(base64.b64decode(command('Page.captureScreenshot',{'format':'png','captureBeyondViewport':True})['data']))
    command('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    check('document.documentElement.scrollWidth<=392','csv_mobile_no_page_overflow')
    (out/'ai-csv-mobile.png').write_bytes(base64.b64decode(command('Page.captureScreenshot',{'format':'png','captureBeyondViewport':True})['data']))
    command('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})
    js('document.getElementById("aiCSVAck").checked=true;document.getElementById("aiCSVAck").dispatchEvent(new Event("change"))')
    click('aiCSVAccept')
    wait('!document.getElementById("aiCSVStart").disabled')
    staged=js('({status:document.getElementById("aiCSVStatus").textContent,rows:document.querySelectorAll("#planInputRows tr").length,export_disabled:document.getElementById("aiCSVExport").disabled})')
    print(json.dumps({'csv_handoff_state':staged},ensure_ascii=True),flush=True)
    assert staged['rows']==1 and not staged['export_disabled'], staged
    wait('!document.getElementById("aiCSVExport").disabled && document.querySelectorAll("#planInputRows tr").length===1')
    check('currentReport===null && document.getElementById("dataset").value===window.csvDatasetBefore', 'csv_approval_stages_rows_without_silently_running_engine')
    js('window.csvReviewId=document.getElementById("aiCSVTrace").textContent.match(/^Lượt ([a-z0-9]+) /)[1]')
    evidence=js('''(async()=>{const v=await AssistantIntake.request("/"+window.csvReviewId);window.csvPreparedHash=v.review.result.prepared_input_hash;return {status:v.status,kind:v.kind,api:v.api,raw_hash:v.csv_source.raw_hash,input_hash:v.input_hash,request_hash:v.request_hash,prepared_input_hash:v.review.result.prepared_input_hash,source_preserved:v.csv_source.raw_text===window.csvRawBefore,changes:v.review.result.changes.map(c=>({field:c.field,origin:c.origin})),unmodeled_columns:v.review.result.retained_unmodeled_columns,manual_mapping_review:true,proposal_mapping_matched_expected:window.csvProposalMappingMatched,review_scope:v.review.scope};})()''')
    run()
    check('currentReport?.input_preparation?.import_source?.ai_review?.id===window.csvReviewId && currentReport.input_hash===window.csvPreparedHash', 'csv_review_trace_and_prepared_hash_match_real_engine_report')
    check('currentReport.input_preparation.import_source.raw_text===window.csvRawBefore', 'csv_bom_crlf_source_preserved_in_report')
    is_live=evidence['api']['model']!='TEST_DOUBLE_NOT_A_MODEL'
    evidence.update(synthetic_only=True,external_model_call=is_live,live_cloud_deployed=False,engine_trace_matches=True,limitations='One live CSV example verifies wiring and review, not model mapping accuracy or factory validation.' if is_live else 'Explicit QA test double; no API call and no model-quality claim.')
    assert evidence['api']['status']=='OK' and evidence['api']['response_id'] and evidence['source_preserved'], evidence
    destination=root/'docs/evaluation/ai_csv_live_smoke.json' if is_live else root/'work/evaluation/ai_csv_mock_smoke.json'
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'csv_model_proof':evidence}),flush=True)
