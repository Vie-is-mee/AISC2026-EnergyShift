"""Reproducible small real-engine queue exercise, never a load/industrial benchmark."""
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic,sleep
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.team import TeamService,TeamError


def main():
    data=json.loads((ROOT/'backend/fixtures/coordinated_cell.json').read_text())
    begun=monotonic()
    with TemporaryDirectory(prefix='energyshift-queue-evidence-') as directory:
        service=TeamService(Path(directory)/'private.sqlite3')
        try:
            a=service.create_workspace()['workspace_token'];b=service.create_workspace()['workspace_token']
            jobs=[(a,service.submit(a,data)),(a,service.submit(a,data)),(b,service.submit(b,data))]
            try:service.get(b,jobs[0][1]['job_id']);raise AssertionError('Cross-workspace read was accepted')
            except TeamError as error:assert error.status==404
            results=[]
            for owner,job in jobs:
                deadline=monotonic()+120
                while monotonic()<deadline:
                    response=service.get(owner,job['job_id'])
                    if response['status'] not in ('QUEUED','RUNNING'):break
                    sleep(.05)
                assert response['status']=='COMPLETED'
                report=response['report'];assert all(p['verification']['status']=='PASS' for p in report['plans'].values())
                results.append({'status':response['status'],'input_hash':report['input_hash'],'decision':report['decision'],'costs_vnd':{k:p['cost']['total_vnd'] for k,p in report['plans'].items()},'solver':report['plans']['B2']['solver']})
            output={'source_type':'SYNTHETIC','scope':'Three small constructed cases on one local serialized worker; not a load benchmark or measured savings','cross_workspace_read':'REJECTED_404','runtime_seconds':round(monotonic()-begun,6),'cases':results,'source_sha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ('backend/team.py','backend/b2.py','backend/neighborhoods.py')}}
            encoded=json.dumps(output,indent=2);assert a not in encoded and b not in encoded
            (ROOT/'docs/evaluation/team_demo_cases.json').write_text(encoded+'\n',encoding='utf-8')
            print(json.dumps({'jobs':len(results),'all_verifiers_pass':True,'cross_workspace_read':'REJECTED_404','runtime_seconds':output['runtime_seconds']}))
        finally:service.close()


if __name__=='__main__':main()
