"""Real-browser acceptance checks, called by browser_smoke.py with its isolated CDP session."""
import json
import time


def run_checks(js, click, wait, check, run, command, output):
    def value(identifier, text):
        js('document.getElementById(' + json.dumps(identifier) + ').value=' + json.dumps(text))

    click('loadFixture')
    check('document.querySelectorAll("#planInputRows tr").length === 8', 'guided_plan_has_all_eight_jobs')
    value('profileName', 'QA_INPUT_DESK')
    click('saveProfile')
    wait('document.getElementById("profileList").value === "QA_INPUT_DESK"')
    js('let qi=document.querySelector("#planInputRows input[data-field=quantity]");qi.value="999";qi.dispatchEvent(new Event("input"))')
    click('analyze')
    check('document.getElementById("deskIssues").textContent.includes("chưa áp dụng") && document.getElementById("results").hidden', 'unapplied_grid_cannot_analyze_old_input')
    click('applyPlan')
    wait('document.getElementById("deskIssues").textContent.includes("Số lượng khác")')
    check('JSON.parse(document.getElementById("dataset").value).jobs[0].quantity === 1000', 'quantity_change_cannot_silently_scale_duration')
    value('templateQuantity', '999'); value('templateReference', 'synthetic QA lot reconfirmation')
    js('document.getElementById("templateQuantity").dispatchEvent(new Event("input"))')
    click('updateTemplate'); click('applyPlan')
    wait('JSON.parse(document.getElementById("dataset").value).jobs[0].quantity === 999')
    check('Object.values(JSON.parse(document.getElementById("dataset").value).jobs[0].eligible).every(p=>p.lot_confirmation.quantity===999)', 'all_machine_lot_confirmations_updated_explicitly')
    click('loadFixture')
    # Full native table + an unmodeled column. Never drop it silently or interpret HTML.
    js('let qaRows=InputModel.rowsFrom(JSON.parse(document.getElementById("dataset").value));window.qaTable=InputModel.csv(qaRows).split("\\r\\n").map((l,i)=>l+","+(i===0?"Ghi chú":"<img src=x onerror=window.__inputInjected=1>")).join("\\r\\n");document.getElementById("tablePaste").value=window.qaTable')
    js('window.qaTable=document.getElementById("tablePaste").value')
    click('previewImport'); click('acceptImport')
    wait('document.getElementById("deskIssues").textContent.includes("cột ngoài")')
    check('!window.__inputInjected && !document.querySelector("#importBody img")', 'import_preview_treats_extra_cells_as_text')
    js('document.getElementById("keepExtras").checked=true')
    click('acceptImport'); click('applyPlan')
    wait('document.getElementById("deskStatus").textContent.includes("đủ cấu trúc")')
    check('Object.values(JSON.parse(document.getElementById("dataset").value).cost_scope.excluded_review).every(v=>v.status==="UNKNOWN")', 'new_plan_does_not_reuse_unconfirmed_cost_bounds')
    run()
    check('currentReport.decision.kind==="MEASURE_FIRST" && currentReport.input_preparation.import_source.raw_text===window.qaTable && currentReport.input_preparation.import_source.retained_unmodeled_columns[0]==="Ghi chú" && currentReport.input_preparation.input_hash===currentReport.input_hash', 'prepared_report_keeps_import_and_matching_engine_hash')
    click('previewImport')
    check('[...document.querySelectorAll("#mappingFields select")].slice(0,7).every((s,i)=>s.value===InputModel.fields[i])', 'mapping_restored_for_same_header_signature')
    backup = output / 'downloads/EnergyShift_input_workspace.json'
    if backup.exists():
        backup.unlink()
    click('downloadProfile')
    deadline = time.monotonic() + 10
    while not backup.exists() and time.monotonic() < deadline:
        time.sleep(.1)
    packet = json.loads(backup.read_text(encoding='utf-8'))
    assert packet['import_source']['raw_text'] == js('window.qaTable')
    assert len(packet['rows']) == 8
    print(json.dumps({'check': 'workspace_backup_retains_raw_and_prepared_data', 'pass': True}), flush=True)
    value('planDate', '2026-10-22')
    click('shiftPlan')
    wait('document.getElementById("deskIssues").textContent.includes("Cần xác nhận")')
    js('document.getElementById("confirmCalendar").checked=true')
    click('shiftPlan'); click('applyPlan')
    wait('JSON.parse(document.getElementById("dataset").value).horizon.start.startsWith("2026-10-22")')
    check('document.getElementById("results").hidden', 'explicit_day_shift_invalidates_old_report')
    # The draft is restored only by choice, never replaces initial input silently.
    wait('localStorage.getItem("energyshift.draft.v1")?.includes("2026-10-22")')
    command('Page.reload', {'ignoreCache': True})
    wait('window.InputDesk && document.querySelectorAll("#planInputRows tr").length===8')
    check('JSON.parse(document.getElementById("dataset").value).horizon.start.startsWith("2026-10-19")', 'reload_does_not_silently_apply_draft')
    click('restoreDraft')
    wait('document.getElementById("profileSummary").textContent.includes("2026-10-22")')
    check('document.getElementById("results").hidden && document.querySelectorAll("#planInputRows tr").length===8', 'draft_survives_reload_without_restoring_old_verdict')
    doc = command('DOM.getDocument')
    restore = command('DOM.querySelector', {'nodeId': doc['root']['nodeId'], 'selector': '#restoreProfileFile'})
    command('DOM.setFileInputFiles', {'nodeId': restore['nodeId'], 'files': [str(backup)]})
    wait('document.getElementById("profileSummary").textContent.includes("2026-10-19")')
    click('applyPlan')
    wait('!!InputDesk.evidence()?.import_source?.retained_unmodeled_columns.includes("Ghi chú")')
    check('InputDesk.evidence().import_source.raw_text.includes("<img") && document.getElementById("results").hidden', 'workspace_file_restore_keeps_source_without_restoring_verdict')
    value('profileList', 'QA_INPUT_DESK'); click('loadProfile')
    wait('document.getElementById("profileSummary").textContent.includes("2026-10-19")')
    # Structured workshop edits reject missing prices instead of turning blank into zero.
    js('let qp=document.querySelector(\'#tariffConfigRows input[data-col="3"]\');qp.value="";qp.dispatchEvent(new Event("input",{bubbles:true}))')
    click('updateWorkshop')
    wait('document.getElementById("deskIssues").textContent.includes("ô trống")')
    js('let qp2=document.querySelector(\'#tariffConfigRows input[data-col="3"]\');qp2.value="1200";qp2.dispatchEvent(new Event("input",{bubbles:true}))')
    click('updateWorkshop')
    wait('document.getElementById("deskStatus").textContent.includes("kiểm tra cấu trúc thiết lập")')
    click('applyPlan')
    wait('JSON.parse(document.getElementById("dataset").value).tariff.windows[0].vnd_per_kwh===1200')
    check('true', 'structured_workshop_validation_rejects_blank_and_accepts_explicit_price')
    # Storage denial must not prevent local analysis/preparation or produce false save confirmation.
    js('window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error("QA quota")};document.getElementById("profileName").value="QA_QUOTA"')
    click('saveProfile')
    wait('document.getElementById("memoryStatus").textContent.includes("Không lưu được")')
    js('Storage.prototype.setItem=window.qaSetItem')
    check('!document.getElementById("analyze").disabled', 'storage_failure_is_visible_and_does_not_break_engine')
    # Actual UTF-8 CSV file upload preserves CRLF/BOM rather than textarea-normalized text.
    raw = '\ufeff' + js('InputModel.csv(InputModel.rowsFrom(JSON.parse(document.getElementById("dataset").value)))')
    csv_file = output / 'input-upload.csv'
    csv_file.write_bytes(raw.encode('utf-8'))
    doc = command('DOM.getDocument')
    upload = command('DOM.querySelector', {'nodeId': doc['root']['nodeId'], 'selector': '#tableFile'})
    command('DOM.setFileInputFiles', {'nodeId': upload['nodeId'], 'files': [str(csv_file)]})
    wait('document.getElementById("tablePaste").value.includes("job_id")')
    click('previewImport'); click('acceptImport'); click('applyPlan')
    wait('InputDesk.evidence()?.import_source?.headers?.[0]==="job_id"')
    assert js('InputDesk.evidence().import_source.raw_text') == raw
    print(json.dumps({'check': 'actual_csv_upload_preserves_original_utf8_bom_and_crlf', 'pass': True}), flush=True)
    for width, height, name in [(1440, 1100, 'input-desktop.png'), (390, 844, 'input-mobile.png')]:
        command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': width == 390})
        check('document.documentElement.scrollWidth <= ' + str(width), 'input_workspace_no_page_overflow_' + str(width))
        import base64
        screenshot = command('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True})
        (output / name).write_bytes(base64.b64decode(screenshot['data']))
    click('loadFixture')
