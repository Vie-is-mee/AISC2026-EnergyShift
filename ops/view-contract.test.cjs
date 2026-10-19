const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function context(){const element={replaceChildren(){},classList:{remove(){}},style:{}};const c=vm.createContext({window:{},document:{addEventListener(){},getElementById(){return element;},querySelectorAll(){return [];},body:{classList:{remove(){}}}},setTimeout(){}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),c);return c;}
test('all decisions bind the displayed comparison to the actual selected plan, including B0',()=>{const c=context();for(const plan of ['B0','B1','B2']){vm.runInContext(`currentReport={decision:{selected_plan:'${plan}'}}`,c);assert.equal(vm.runInContext('referencePlan()',c),plan);}});
function report(){const ledger=[{component:'RUN_ELECTRICITY',start:'2026-10-19T00:15:00+07:00',end:'2026-10-19T01:15:00+07:00',avg_kw:20,vnd_per_kwh:1000}];return {input_snapshot:{horizon:{start:'2026-10-19T00:00:00+07:00',end:'2026-10-19T01:30:00+07:00'}},decision:{selected_plan:'B1'},plans:{B0:{cost:{ledger}},B1:{cost:{ledger}},B2:{cost:{ledger:[]}}}};}
test('hourly average power preserves kWh including partial final hour',()=>{const c=context();c.sampleReport=report();const series=vm.runInContext('hourlySeries(sampleReport,"power")',c);assert.equal(series[1].code,'B1');assert.equal(series[0].values[0].value,15);assert.equal(series[0].values[1].value,10);assert.equal(series[0].values.reduce((sum,r)=>sum+r.value*(Date.parse(r.end)-Date.parse(r.start))/3600000,0),20);});
test('hourly electricity cost reconciles tariff integration',()=>{const c=context();c.sampleReport=report();assert.equal(vm.runInContext('hourlySeries(sampleReport,"cost")[0].values.reduce((s,r)=>s+r.value,0)',c),20000);});
test('KEEP comparison has a single B0 series, never an unselected B2 curve',()=>{const c=context();c.sampleReport=report();c.sampleReport.decision.selected_plan='B0';assert.equal(vm.runInContext('hourlySeries(sampleReport).length',c),1);});
test('invalidating an input clears results without depending on a selected schedule',()=>{const c=context();assert.doesNotThrow(()=>vm.runInContext('clearResult()',c));assert.equal(vm.runInContext('currentReport',c),null);});
