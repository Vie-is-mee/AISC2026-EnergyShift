const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../input-model.js');

function element(tag='div'){
  return {tag,children:[],dataset:{},events:{},value:'',checked:false,disabled:false,hidden:false,textContent:'',
    append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
    setAttribute(){},removeAttribute(){},addEventListener(name,fn){this.events[name]=fn;},contains(e){return this===e || this.children.some(c=>c.contains?.(e));},
    querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...(c.querySelectorAll?.('*') || [])]);if(selector==='*')return all;return all.filter(e=>selector==='input,select,textarea'?['input','select','textarea'].includes(e.tag):selector==='input[data-field]'?e.tag==='input' && e.dataset.field:selector==='.ai-csv-review-table button'?e.tag==='button':e.tag===selector);}
  };
}
function setup(){
  let ready, pendingPreview=null, pendingSubmit=null, pendingReview=null, version='v1', raw='original csv';
  const elements=new Map(),calls=[],applied=[];
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const proposal={summary:'Column suggestions',columns:[...M.fields,'UNMODELED'].map((field,i)=>({column_index:i,field,rationale:'header'})),issues:[],questions:['Review extra note?']};
  const record={id:'csv-one',kind:'CSV',status:'AWAITING_REVIEW',input_hash:'profile-v1',request_hash:'request-v1',csv_source:{raw_text:raw,raw_hash:'raw-v1',headers:[...M.fields,'Notes']},proposal,api:{status:'OK',model:'test-only'},review:null};
  const view={rows:[Object.fromEntries(M.fields.map(f=>[f,'']))],unmodeled_columns:['Notes'],missing_fields:[],cells:[M.fields.map(f=>({field:f,column_index:M.fields.indexOf(f),original:f==='quantity'?'':'known',value:f==='quantity'?'':'known',suggestion:f==='quantity'?{value:'1000',reference:'jobs.J1.quantity',source_type:'SYNTHETIC'}:null}))]};
  const c=vm.createContext({window:{},document:{getElementById:get,createElement:element,addEventListener(name,fn){ready=fn;}},InputModel:M,InputDesk:{csvContext(){return {snapshot:{profile:'test'},version,raw_text:raw};},acceptCSVReview(value,expected){assert.equal(expected,version);applied.push(value);version='v2';c.window.AICSVImport.invalidate();}},AssistantIntake:{ensureSession:async()=>{},request:async(suffix,body)=>{
    calls.push({suffix,body});if(suffix==='' && pendingSubmit)return pendingSubmit;
    if(suffix.endsWith('/csv-preview'))return pendingPreview || structuredClone(view);
    if(suffix.endsWith('/csv-review'))return pendingReview || {...record,status:body.decision,review:{...body,result:{rows:body.rows,prepared_input_hash:'compiled'}}};
    return structuredClone(record);
  }},preparing:false,pending:false,fixtureLoading:false,setTimeout(){},clearTimeout(){},download(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../ai-csv-import.js'),'utf8'),c);ready();
  return {c,get,calls,applied,record,view,setPreview(value){pendingPreview=value;},setSubmit(value){pendingSubmit=value;},setReview(value){pendingReview=value;},setRaw(value){raw=value;}};
}
function acknowledge(get){for(const id of ['aiCSVExtras','aiCSVQuestionsAck']){get(id).checked=true;get(id).events.change();}get('aiCSVAck').checked=true;get('aiCSVAck').events.change();}

test('CSV consent gates network and missing facts stay blank until a human chooses a profile suggestion',async()=>{
  const {get,calls,applied}=setup();await get('aiCSVStart').onclick();assert.equal(calls.length,0);
  get('aiCSVConsent').checked=true;await get('aiCSVStart').onclick();
  const inputs=get('aiCSVReviewRows').querySelectorAll('input[data-field]');assert.equal(inputs.find(i=>i.dataset.field==='quantity').value,'');assert.equal(applied.length,0);
  get('aiCSVAck').checked=true;get('aiCSVAck').events.change();
  get('aiCSVReviewRows').querySelectorAll('button')[0].onclick();assert.equal(inputs.find(i=>i.dataset.field==='quantity').value,'1000');assert.equal(get('aiCSVAck').checked,false);
  assert.equal(calls[0].body.raw_text,'original csv');
});
test('human acknowledgment is required after every cell edit and acceptance stages data without running the solver',async()=>{
  const {get,applied,calls}=setup();get('aiCSVConsent').checked=true;await get('aiCSVStart').onclick();
  acknowledge(get);assert.equal(get('aiCSVAccept').disabled,false);
  const quantity=get('aiCSVReviewRows').querySelectorAll('input[data-field]').find(i=>i.dataset.field==='quantity');quantity.value='1000';quantity.oninput();assert.equal(get('aiCSVAccept').disabled,true);
  acknowledge(get);await get('aiCSVAccept').onclick();assert.equal(applied.length,1);assert.equal(get('aiCSVApply').disabled,true);assert.equal(get('aiCSVExport').disabled,false);
  assert.ok(calls.every(c=>!c.suffix.includes('/analyze')));
});
test('source edit while model response is pending discards and cancels the old proposal',async()=>{
  const {get,c,record,setSubmit,setRaw,applied,calls}=setup();let resolve;setSubmit(new Promise(r=>{resolve=r;}));
  get('aiCSVConsent').checked=true;const task=get('aiCSVStart').onclick();await new Promise(r=>setImmediate(r));
  setRaw('new source');c.window.AICSVImport.invalidate();resolve(record);await task;
  assert.equal(get('aiCSVResult').hidden,true);assert.equal(applied.length,0);assert.ok(calls.some(c=>c.suffix.endsWith('/cancel')));
});
test('mapping change supersedes an in-flight preview and does not leave the UI stuck busy',async()=>{
  const {get,view,setPreview}=setup();let resolve;setPreview(new Promise(r=>{resolve=r;}));
  get('aiCSVConsent').checked=true;const task=get('aiCSVStart').onclick();await new Promise(r=>setImmediate(r));
  get('aiCSVMapping').querySelectorAll('select')[0].onchange();assert.equal(get('aiCSVPreview').disabled,false);
  setPreview(null);await get('aiCSVPreview').onclick();const first=get('aiCSVReviewRows').children[0];
  resolve({...view,rows:[]});await task;assert.equal(get('aiCSVReviewRows').children[0],first);assert.equal(get('aiCSVStart').disabled,false);
});

test('approval shows pending feedback and a backend rejection beside the action, without staging data',async()=>{
  const {get,applied,setReview}=setup();get('aiCSVConsent').checked=true;await get('aiCSVStart').onclick();
  assert.match(get('aiCSVReviewHelp').textContent,/xác nhận cột ngoài mô hình/);
  assert.equal(get('aiCSVApply').hidden,true);assert.equal(get('aiCSVExport').hidden,true);
  acknowledge(get);let reject;setReview(new Promise((_,r)=>{reject=r;}));
  const task=get('aiCSVAccept').onclick();assert.equal(get('aiCSVAccept').disabled,true);
  assert.match(get('aiCSVAccept').textContent,/Đang kiểm tra/);assert.match(get('aiCSVReviewStatus').textContent,/Đang kiểm tra/);
  reject(Error('Dòng dữ liệu 1: Số lượng phải khớp định mức'));await task;
  assert.equal(applied.length,0);assert.equal(get('aiCSVAccept').disabled,false);
  assert.equal(get('aiCSVReviewStatus').hidden,false);assert.match(get('aiCSVReviewStatus').textContent,/Số lượng/);
});
