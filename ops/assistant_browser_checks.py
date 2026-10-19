"""Opt-in browser checks with one genuine OpenRouter request; synthetic input only."""
import base64
import json


def run_checks(js, click, wait, check, command, out, root):
    js('switchMainTab("tab-dispatch");window.aiDatasetBefore=document.getElementById("dataset").value')
    click('aiSend')
    check('document.getElementById("aiStatus").textContent.includes("10") && !sessionStorage.getItem("energyshift.assistant.last.v1")', 'assistant_consent_required_before_network')
    js('document.getElementById("aiMessage").value="Tôi muốn xem lại kế hoạch khi M2 có thể cần bảo trì chiều nay. Hãy hỏi tôi thông tin cần xác nhận; chưa thay đổi lịch.";document.getElementById("aiMessage").dispatchEvent(new Event("input"));document.getElementById("aiConsent").checked=true')
    click('aiSend')
    wait('!document.getElementById("aiSend").disabled && document.getElementById("aiTrace").textContent.includes("API:")', timeout=100)
    if js('document.getElementById("aiResult").hidden'):
        failure=js('''(async()=>{const id=JSON.parse(sessionStorage.getItem("energyshift.assistant.last.v1")).id;const r=await apiFetch("/api/demo/assistant/requests/"+id,{headers:{Authorization:"Bearer "+sessionStorage.getItem("energyshift.assistant.session.v1")}});const v=await r.json();return {status:v.status,api:v.api,input_hash:v.input_hash,request_hash:v.request_hash};})()''')
        failure.update(synthetic_only=True,external_model_call=True,live_cloud_deployed=False,limitations='Provider failed: no model proposal and no completed human-review browser proof.')
        (root/'docs/evaluation/assistant_live_failure.json').write_text(json.dumps(failure,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'assistant_live_failure':failure}),flush=True)
    check('!document.getElementById("aiResult").hidden', 'assistant_real_model_proposal_received')
    check('document.getElementById("aiAccept").disabled && document.getElementById("dataset").value === window.aiDatasetBefore', 'assistant_never_auto_approves_or_changes_plan')
    js('document.getElementById("aiAcknowledged").checked=true;document.getElementById("aiAcknowledged").dispatchEvent(new Event("change"))')
    check('!document.getElementById("aiAccept").disabled', 'assistant_review_requires_explicit_acknowledgment')
    js('document.getElementById("aiReviewedSummary").value += " Cần kỹ sư xác nhận giờ bảo trì.";document.getElementById("aiReviewedSummary").dispatchEvent(new Event("input"))')
    check('document.getElementById("aiAccept").disabled && !document.getElementById("aiAcknowledged").checked', 'editing_review_requires_new_acknowledgment')
    command('Runtime.evaluate', {'expression':'document.getElementById("assistantPanel").scrollIntoView({block:"start"})'})
    shot=command('Page.captureScreenshot', {'format':'png','captureBeyondViewport':True})
    (out/'assistant-review-desktop.png').write_bytes(base64.b64decode(shot['data']))
    command('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    check('document.documentElement.scrollWidth <= 392', 'assistant_mobile_no_page_overflow')
    shot=command('Page.captureScreenshot', {'format':'png','captureBeyondViewport':True})
    (out/'assistant-review-mobile.png').write_bytes(base64.b64decode(shot['data']))
    command('Emulation.setDeviceMetricsOverride', {'width':1440,'height':1100,'deviceScaleFactor':1,'mobile':False})
    js('document.getElementById("aiAcknowledged").checked=true;document.getElementById("aiAcknowledged").dispatchEvent(new Event("change"))')
    click('aiAccept')
    wait('!document.getElementById("aiExport").disabled')
    check('document.getElementById("aiAccept").disabled && document.getElementById("dataset").value === window.aiDatasetBefore', 'human_acceptance_records_intent_without_executing')
    evidence=js('''(async()=>{const id=JSON.parse(sessionStorage.getItem("energyshift.assistant.last.v1")).id;const r=await apiFetch("/api/demo/assistant/requests/"+id,{headers:{Authorization:"Bearer "+sessionStorage.getItem("energyshift.assistant.session.v1")}});const v=await r.json();return {status:v.status,api:v.api,input_hash:v.input_hash,request_hash:v.request_hash,review_scope:v.review.scope,identity_verified:v.review.identity_verified,proposal_had_questions:v.proposal.questions.length>0,snapshot_preserved:v.input_snapshot?.metadata.source_type==="SYNTHETIC"};})()''')
    assert evidence['api']['status']=='OK' and evidence['api']['response_id'] and evidence['api']['model'], evidence
    assert evidence['snapshot_preserved'], 'Review export must preserve its exact planning snapshot'
    evidence.update(synthetic_only=True,external_model_call=True,live_cloud_deployed=False,limitations='One genuine model response validates wiring and human-review flow; not model accuracy or factory effectiveness.')
    (root/'docs/evaluation/assistant_live_smoke.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'assistant_live_proof':evidence}),flush=True)
    js('document.getElementById("aiMessage").value += " Tôi thay đổi yêu cầu.";document.getElementById("aiMessage").dispatchEvent(new Event("input"))')
    check('document.getElementById("aiResult").hidden && document.getElementById("aiAccept").disabled && document.getElementById("aiExport").disabled', 'edited_message_invalidates_accepted_intent')
    click('aiResume')
    check('document.getElementById("aiResult").hidden && document.getElementById("aiStatus").textContent.includes("khác")', 'old_approval_not_restored_to_new_message')
    js('document.getElementById("aiConsent").checked=false;switchMainTab("tab-overview")')
