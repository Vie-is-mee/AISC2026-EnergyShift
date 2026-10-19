"""QA-only ASGI entry point. Never used by Render; no network or provider keys."""
import importlib
import json
from backend.assistant import AssistantService

module=importlib.import_module('backend.app')
team=module.get_team()


def fake_client(messages,**kwargs):
    source=json.loads(messages[1]['content'])['csv_source']
    fields=['job_id','template_id','quantity','machine_id','start','release','due','UNMODELED']
    assert len(source['headers'])==len(fields), 'QA fixture needs exactly eight columns'
    return {'status':'OK','answer':{'summary':'QA mock: review the CSV before staging.','columns':[{'column_index':i,'field':f,'rationale':'QA mock fixture, not model inference.'} for i,f in enumerate(fields)],'issues':[],'questions':['QA mock: retain Notes without modeling it?']},'served_model':'TEST_DOUBLE_NOT_A_MODEL','response_id':'TEST_DOUBLE_NO_API_CALL','finish_reason':'stop','usage':{}}


module.assistant_service=AssistantService(team,client=fake_client,config_loader=lambda:{'OPENROUTER_API_KEY':'TEST_ONLY_NOT_A_REAL_KEY','OPENROUTER_MODEL':'TEST_DOUBLE_NOT_A_MODEL'})
app=module.app
