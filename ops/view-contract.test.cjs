const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function context(){const c=vm.createContext({window:{},document:{addEventListener(){}},setTimeout(){}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),c);return c;}
test('all decisions bind the displayed comparison to the actual selected plan, including B0',()=>{const c=context();for(const plan of ['B0','B1','B2']){vm.runInContext(`currentReport={decision:{selected_plan:'${plan}'}}`,c);assert.equal(vm.runInContext('referencePlan()',c),plan);}});
