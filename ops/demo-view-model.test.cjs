const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fromReport,moveSensitivity,loadForJob,presentationEvidence} = require('../demo-view-model.js');

function nativeReport(){
  const plan=(start,cost)=>({cost:{total_vnd:cost,by_component:{RUN_ELECTRICITY:cost,SETUP:0},total_kwh_exact:'1/1',ledger:[{component:'RUN_ELECTRICITY',start,end:start.replace('00:00:00','01:00:00').replace('01:00:00','02:00:00'),avg_kw:1}]},verification:{status:'PASS',jobs:[{job_id:'J',machine_id:'M1',start,end:start.includes('00:00:00')?'2026-10-19T01:00:00+07:00':'2026-10-19T02:00:00+07:00',setup_start:start}]},changes:cost===1?[{}]:[]});
  const r={input_hash:'sha256:native',source_type:'SYNTHETIC',decision:{kind:'CHANGE',selected_plan:'B1'},input_snapshot:{horizon:{start:'2026-10-19T00:00:00+07:00',end:'2026-10-19T02:00:00+07:00'},metadata:{currency:'VND'},jobs:[{id:'J',eligible:{M1:{avg_kw:1}}}],tariff:{windows:[{start:'2026-10-19T00:00:00+07:00',end:'2026-10-19T01:00:00+07:00',vnd_per_kwh:2},{start:'2026-10-19T01:00:00+07:00',end:'2026-10-19T02:00:00+07:00',vnd_per_kwh:1}]}},plans:{B0:plan('2026-10-19T00:00:00+07:00',2),B1:plan('2026-10-19T01:00:00+07:00',1)}};
  r.plans.B0.cost.ledger[0].end='2026-10-19T01:00:00+07:00';return r;
}
function textileReport(){
  const plan=(start,power,electricity,changed)=>({schedule:[{job_id:'source-row',machine_id:'MAQ119',start_slot:start,end_slot:start+2}],verification:{status:'PASS',groups:[]},cost:{total:electricity+changed*3,electricity,move_cost:changed*3,energy_kwh:4,grid_kwh:4,solar_kwh:0,changed_jobs:changed,series:{load_kw:power,price_per_kwh:[3,3,1,1]}}});
  return {schema_version:'textile-demo-1',input_hash:'sha256:source',source_type:'EXTERNAL_ISOLATED_SUBSET',step_minutes:60,horizon_slots:4,currency:'SOURCE',decision:{kind:'REVIEW_REQUIRED',selected_plan:'B1'},manifest:{mapping:{extra_cost_per_move:3}},operations:[{id:'source-row',power_kw:[1,3]}],plans:{B0:plan(0,[1,3,0,0],12,0),B1:plan(2,[0,0,1,3],4,1)}};
}

test('native EDA integrates the same ledger without changing schedule energy',()=>{
  const scene=fromReport(nativeReport());assert.equal(scene.currency,'VND');assert.equal(scene.hash,'sha256:native');assert.equal(scene.count,1);
  assert.deepEqual(scene.tariff,[2,2,1,1]);assert.deepEqual(scene.plans.B0.power,[1,1,0,0]);assert.deepEqual(scene.plans.B1.power,[0,0,1,1]);
  for(const p of Object.values(scene.plans))assert.equal(p.power.reduce((a,b)=>a+b,0)*scene.stepMinutes/60,p.energy);
  assert.equal(scene.index('B1'),50);
});
test('external views retain SOURCE units and REVIEW_REQUIRED instead of fabricating VND approval',()=>{
  const scene=fromReport(textileReport());assert.equal(scene.currency,'SOURCE');assert.equal(scene.decision,'REVIEW_REQUIRED');assert.equal(scene.textile,true);assert.equal(scene.plans.B1.total,7);assert.equal(scene.plans.B1.jobs[0].start,2);
});
test('heatmap uses the selected source operation power profile',()=>{
  const scene=fromReport(textileReport()),j=scene.plans.B1.jobs[0];assert.equal(loadForJob(scene,'B1',j,0,2),0);assert.equal(loadForJob(scene,'B1',j,2,4),2);assert.equal(loadForJob(scene,'B1',j,3,4),3);
});
test('move-cost sensitivity changes only explicit what-if costs',()=>{
  const report=textileReport(),before=JSON.stringify(report),scene=fromReport(report);const rows=moveSensitivity(scene,5);
  assert.equal(rows.find(r=>r.code==='B1').total,9);assert.equal(rows.find(r=>r.code==='B1').saving,3);assert.equal(rows.find(r=>r.code==='B1').breakEven,8);assert.equal(JSON.stringify(report),before);
});
test('blocked baseline has no cost, energy index, or fabricated zero',()=>{
  const report=textileReport();report.plans.B0.cost=null;const scene=fromReport(report);assert.equal(scene.plans.B0.total,null);assert.equal(scene.index('B0'),null);
});

test('slide summary only publishes costs with verified complete job coverage',()=>{
  const schedule=(cost,jobs=1,status='PASS')=>({
    cost:cost===null?null:{total_vnd:cost},
    verification:{status,jobs:Array.from({length:jobs},(_,i)=>({job_id:'J'+i}))},
    changes:[]
  });
  const report={source_type:'SYNTHETIC',input_snapshot:{jobs:[{id:'J0'},{id:'J1'}]},
    decision:{kind:'CHANGE',selected_plan:'B1'},
    plans:{B0:schedule(150,2),B1:schedule(120,2),B2:schedule(80,2)}};
  let e=presentationEvidence(report);
  assert.equal(e.expectedJobs,2);assert.equal(e.b1.verifiedJobs,2);
  assert.equal(e.savingB1,30);assert.equal(e.savingB2,70);assert.equal(e.b2Difference,40);
  report.plans.B2=schedule(70,1);
  e=presentationEvidence(report);
  assert.equal(e.b2.valid,false);assert.equal(e.b2Difference,null);
  assert.equal(e.savingB2,null);
  report.plans.B1=schedule(null,2,'FAIL');
  e=presentationEvidence(report);
  assert.equal(e.savingB1,null);
  assert.equal(e.b2Difference,null);
  report.source_type='EXTERNAL_ISOLATED_SUBSET';
  assert.equal(presentationEvidence(report),null);
});

test('slide B2 parity is not described as an unverified extra saving',()=>{
  const plan=cost=>({verification:{status:'PASS',jobs:[{job_id:'J0'}]},cost:{total_vnd:cost}});
  const report={source_type:'SYNTHETIC',input_snapshot:{jobs:[{id:'J0'}]},
    decision:{kind:'MEASURE_FIRST',selected_plan:'B0'},
    plans:{B0:plan(100),B1:plan(85),B2:plan(85)}};
  let e=presentationEvidence(report);
  assert.equal(e.b2Difference,0);assert.equal(e.selectedPlan,'B0');assert.equal(e.decision,'MEASURE_FIRST');
  report.plans.B2=plan(92);
  e=presentationEvidence(report);
  assert.equal(e.b2Difference,-7);
});
