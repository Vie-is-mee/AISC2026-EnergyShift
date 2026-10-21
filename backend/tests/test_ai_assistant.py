"""AI does not invent production facts or apply unreviewed/stale CSV changes."""
import json
import unittest
from copy import deepcopy
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend.app import app, ai_lock
from backend.ai_assistant import (InspectRequest, ApplyRequest, audit_csv, inspect_csv,
                                  apply_patches, source_hash, parse_csv, write_plan_report)

CSV = 'job_id,template_id,quantity,machine_id,start,release,due,notes\r\n J1 ,J1,1000.0,M1,2026-10-19 08:00,2026-10-19T00:00,2026-10-20T00:00,"note, one"\r\n'
FAKE_CONFIG = {'OPENROUTER_API_KEY':'TEST_ONLY_NEVER_REAL','OPENROUTER_MODEL':'openrouter/free'}


class CsvAssistantTests(unittest.TestCase):
    def test_rules_audit_every_row_without_network(self):
        with patch('backend.ai_assistant.chat_json') as call:
            result = inspect_csv(InspectRequest(csv_text=CSV))
        call.assert_not_called()
        self.assertEqual(result['row_count'],1)
        self.assertEqual(result['rows'][0][-1],'note, one')
        self.assertEqual(result['source_hash'],source_hash(CSV))
        self.assertFalse(result['engine_ready'])
        self.assertIn('1000', [p['after'] for p in result['suggestions']])

    def test_alias_headers_and_quoted_delimiters(self):
        text='"Mã lô";"Số lượng";"ghi;chú"\nJ1;1000;"a ""quote"""'
        result=audit_csv(text)
        self.assertEqual(result['delimiter'],';')
        self.assertEqual(result['rows'][0][-1],'a "quote"')
        self.assertIn('job_id',[p['after'] for p in result['suggestions']])

    def test_malformed_quotes_and_ragged_rows_are_rejected(self):
        for text in ['a,b\n"never closes,1','a,b\n"x"oops,1','a,b\n1,2,3','a,b\nnot"quoted,1']:
            with self.subTest(text=text),self.assertRaises(ValueError):parse_csv(text)

    def test_duplicates_missing_facts_and_ambiguous_dates_are_reported(self):
        text=CSV.replace('1000.0','').replace('2026-10-19 08:00','03/04/2026 08:00')+CSV.splitlines()[1]
        result=audit_csv(text)
        codes={f['code'] for f in result['findings']}
        self.assertTrue({'MISSING_VALUE','INVALID_DATE','DUPLICATE_JOB'}<=codes)
        self.assertFalse(any(p['row']==1 and p['column']==2 for p in result['suggestions']))

    def test_large_audit_never_silently_drops_rows(self):
        text=CSV.splitlines()[0]+'\n'+'\n'.join(CSV.splitlines()[1].replace(' J1 ',f' J{i} ') for i in range(12))
        result=audit_csv(text)
        self.assertEqual(result['row_count'],12)
        self.assertIn('ENGINE_LIMIT',{f['code'] for f in result['findings']})

    def test_apply_requires_approval_and_matching_original_hash(self):
        result=audit_csv(CSV)
        for overrides in [dict(approved=False),dict(source_hash='sha256:'+'0'*64)]:
            args=dict(csv_text=CSV,source_hash=result['source_hash'],patches=result['suggestions'],approved=True)
            args.update(overrides)
            with self.assertRaises(ValueError):apply_patches(ApplyRequest(**args))

    def test_reviewed_apply_preserves_unknown_columns_and_row_order(self):
        result=audit_csv(CSV)
        applied=apply_patches(ApplyRequest(csv_text=CSV,source_hash=result['source_hash'],patches=result['suggestions'],approved=True))
        self.assertEqual(applied['rows'][0][-1],'note, one')
        self.assertEqual(applied['headers'][-1],'notes')
        self.assertEqual(applied['rows'][0][0],'J1')
        self.assertEqual(applied['rows'][0][2],'1000')
        self.assertEqual(applied['original_hash'],source_hash(CSV))
        self.assertNotEqual(applied['source_hash'],applied['original_hash'])

    def test_duplicate_and_wrong_original_cell_patches_rejected(self):
        result=audit_csv(CSV)
        for changes in [[result['suggestions'][0]]*2,[{**result['suggestions'][0],'before':'wrong original'}]]:
            with self.assertRaises(ValueError):apply_patches(ApplyRequest(csv_text=CSV,source_hash=result['source_hash'],patches=changes,approved=True))

    def test_production_value_change_requires_operator_confirmation(self):
        change=dict(row=1,column=2,before='1000.0',after='2000',reason='Order confirmation',source='manual')
        for confirmed in (False,True):
            request=ApplyRequest(csv_text=CSV,source_hash=source_hash(CSV),patches=[change],approved=True,facts_confirmed=confirmed)
            if confirmed:self.assertEqual(apply_patches(request)['rows'][0][2],'2000')
            else:
                with self.assertRaises(ValueError):apply_patches(request)
        change['source']='ai'
        with self.assertRaises(ValueError):apply_patches(ApplyRequest(csv_text=CSV,source_hash=source_hash(CSV),patches=[change],approved=True,facts_confirmed=True))

    def test_formula_export_is_blocked_without_mutating_original(self):
        text=CSV.replace('note, one','=HYPERLINK(""https://example.invalid"")')
        self.assertIn('FORMULA_CELL',{f['code'] for f in audit_csv(text)['findings']})
        with self.assertRaises(ValueError):apply_patches(ApplyRequest(csv_text=text,source_hash=source_hash(text),patches=audit_csv(text)['suggestions'],approved=True))

    def test_ai_requires_consent_and_only_free_models(self):
        for args in [dict(use_ai=True),dict(use_ai=True,consent=True,model='paid/model')]:
            with patch('backend.ai_assistant.chat_json') as call,self.assertRaises(ValueError):inspect_csv(InspectRequest(csv_text=CSV,**args))
            call.assert_not_called()

    def test_ai_rejects_invented_values_but_keeps_narrative(self):
        answer=dict(summary='Cần rà soát sản lượng.',findings=[],next_steps=['Đối chiếu đơn hàng.'],suggestions=[dict(row=1,column=2,before='1000.0',after='9999',reason='guess',source='ai')])
        with patch('backend.ai_assistant.load_config',return_value=FAKE_CONFIG),patch('backend.ai_assistant.chat_json',return_value=dict(status='OK',answer=answer)) as call:
            result=inspect_csv(InspectRequest(csv_text=CSV,use_ai=True,consent=True))
        self.assertEqual(result['ai']['summary'],answer['summary'])
        self.assertEqual(result['ai']['rejected_suggestions'],1)
        self.assertNotIn('9999',[p['after'] for p in result['suggestions']])
        messages=call.call_args.args[0]
        self.assertNotIn(FAKE_CONFIG['OPENROUTER_API_KEY'],json.dumps(messages))
        self.assertEqual(call.call_args.kwargs['config']['OPENROUTER_MODEL'],'openrouter/free')

    def test_ai_failure_leaves_rules_and_suggestions_usable(self):
        with patch('backend.ai_assistant.chat_json',return_value=dict(status='HTTP_ERROR',error_category='DAILY_QUOTA')):
            result=inspect_csv(InspectRequest(csv_text=CSV,use_ai=True,consent=True))
        self.assertEqual(result['ai']['error_category'],'DAILY_QUOTA')
        self.assertTrue(result['suggestions'])

    def test_ai_response_schema_and_data_limits_fail_closed(self):
        with patch('backend.ai_assistant.chat_json',return_value=dict(status='OK',answer={'execute':'malicious code'})):
            result=inspect_csv(InspectRequest(csv_text=CSV,use_ai=True,consent=True))
        self.assertEqual(result['ai']['status'],'INVALID_RESPONSE')
        text='a\n'+'\n'.join('data' for _ in range(101))
        with patch('backend.ai_assistant.chat_json') as call:
            result=inspect_csv(InspectRequest(csv_text=text,use_ai=True,consent=True))
        self.assertEqual(result['row_count'],101)
        self.assertEqual(result['ai']['status'],'INPUT_LIMIT')
        call.assert_not_called()

    def test_bom_and_multiline_cells_preserved(self):
        text='\ufeffa,b\n"multi\nline","quoted ""cell"""\n'
        self.assertEqual(parse_csv(text)[0][1],['multi\nline','quoted "cell"'])
        self.assertNotEqual(source_hash(text),source_hash(text.removeprefix('\ufeff')))

    def test_scientific_quantity_not_mistaken_for_importable_integer(self):
        result=audit_csv(CSV.replace('1000.0','1e3'))
        self.assertIn('QUANTITY_FORMAT',{finding['code'] for finding in result['findings']})


class AssistantApiTests(unittest.TestCase):
    def setUp(self):self.client=TestClient(app)

    def test_status_never_exposes_api_key(self):
        with patch('backend.ai_assistant.load_config',return_value=FAKE_CONFIG):response=self.client.get('/api/demo/ai/status')
        self.assertTrue(response.json()['configured'])
        self.assertNotIn(FAKE_CONFIG['OPENROUTER_API_KEY'],response.text)

    def test_routes_apply_diff_without_network_and_enforce_origin(self):
        result=self.client.post('/api/demo/ai/inspect',json=dict(csv_text=CSV)).json()
        response=self.client.post('/api/demo/ai/apply',json=dict(csv_text=CSV,source_hash=result['source_hash'],patches=result['suggestions'],approved=True))
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/ai-desk.js').status_code,200)
        self.assertEqual(self.client.post('/api/demo/ai/inspect',json=dict(csv_text=CSV),headers={'Origin':'https://foreign.invalid'}).status_code,403)
        self.assertEqual(self.client.post('/api/demo/ai/inspect',content='{}').status_code,415)

    def test_busy_ai_has_no_duplicate_provider_call(self):
        ai_lock.acquire()
        try:response=self.client.post('/api/demo/ai/inspect',json=dict(csv_text=CSV,use_ai=True,consent=True))
        finally:ai_lock.release()
        self.assertEqual(response.status_code,409)

    def test_report_does_not_call_provider_without_consent(self):
        with patch('backend.ai_assistant.chat_json') as call:
            self.assertEqual(self.client.post('/api/demo/ai/report',json=dict(dataset={},consent=False)).status_code,422)
        call.assert_not_called()

    def test_report_rejects_changed_verified_facts(self):
        analysis=dict(status='COMPLETED',input_hash='sha256:input',source_type='SYNTHETIC',decision=dict(kind='KEEP_CURRENT',selected_plan='B0'),comparison=dict(saving_vnd=0),plans={'B0':dict(verification=dict(status='PASS'))},cost_scope=dict(excluded=['OTHER_COSTS']))
        with patch('backend.ai_assistant.chat_json',return_value=dict(status='OK',answer=dict(facts={'decision':'CHANGE'},summary='Invented',findings=[],next_steps=[]))):
            result=write_plan_report(analysis,'openrouter/free')
        self.assertEqual(result['status'],'EVIDENCE_MISMATCH')
        self.assertNotIn('summary',result)
        self.assertEqual(result['facts']['decision'],'KEEP_CURRENT')

    def test_report_keeps_valid_narrative_and_actual_plan_evidence(self):
        analysis=dict(status='COMPLETED',input_hash='sha256:input',source_type='SYNTHETIC',decision=dict(kind='KEEP_CURRENT',selected_plan='B0'),comparison=dict(saving_vnd=0),plans={'B0':dict(verification=dict(status='PASS')),'B2':dict(status='FEASIBLE')},cost_scope=dict(excluded=['OTHER_COSTS']))
        def response(messages,**kwargs):
            evidence=json.loads(messages[1]['content'])
            return dict(status='OK',answer=dict(facts=evidence['facts'],summary='Giữ lịch trong phạm vi mô hình.',findings=['Chưa có số đo xưởng.'],next_steps=['Đối chiếu dữ liệu gốc.']),served_model='test-free')
        with patch('backend.ai_assistant.chat_json',side_effect=response):result=write_plan_report(analysis,'openrouter/free')
        self.assertEqual(result['status'],'OK')
        self.assertEqual(result['facts']['b2_status'],'FEASIBLE')
        self.assertEqual(result['analysis'],analysis)


if __name__=='__main__':unittest.main()
