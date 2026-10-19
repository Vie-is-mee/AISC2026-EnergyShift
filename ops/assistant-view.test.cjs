const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(){
  const elements=new Map(), timers=[], calls=[], storage=new Map();let ready;
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:false,disabled:false,textContent:'',events:{},addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},removeAttribute(){},replaceChildren(...values){this.children=values;}});return elements.get(id);};
  const proposal={summary:'M1 needs review',observations:[],questions:['When?'],next_steps:['Ask engineer']};
  const result={id:'one',status:'AWAITING_REVIEW',input_hash:'input-v1',request_hash:'request-v1',proposal,api:{status:'OK',model:'test-only'},review:null};
  let pendingResponse=null;
  const c=vm.createContext({window:{},document:{getElementById:get,createElement(){return {textContent:''};},addEventListener(name,fn){ready=fn;}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},preparing:false,pending:false,fixtureLoading:false,InputDesk:{prepareForAnalysis:async()=>true,beforeAnalyze:()=>true},download(){},apiFetch:async(url,options)=>{calls.push({url,options});if(pendingResponse)return pendingResponse;let value=url.endsWith('/workspaces')?{workspace_token:'capability-only'}:url.endsWith('/review')?{...result,status:JSON.parse(options.body).decision,review:JSON.parse(options.body)}:result;return {ok:true,json:async()=>value};}});
  c.window.InputDesk=c.InputDesk;get('dataset').value='{"current":"plan-v1"}';get('aiMessage').value='Please check M1 maintenance';
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assistant.js'),'utf8'),c);ready();
  return {c,get,calls,storage,result,setPending:fn=>{pendingResponse=fn;}};
}
test('consent blocks network; model response cannot change the planning input',async()=>{
  const {get,calls}=setup();const before=get('dataset').value;
  await get('aiSend').onclick();assert.equal(calls.length,0);
  get('aiConsent').checked=true;await get('aiSend').onclick();
  assert.equal(calls.length,2);assert.equal(get('dataset').value,before);assert.equal(get('aiAccept').disabled,true);assert.equal(get('aiResult').hidden,false);
});
test('editing a human review resets acknowledgment and accepted intent never executes solver',async()=>{
  const {get,calls}=setup();get('aiConsent').checked=true;await get('aiSend').onclick();
  get('aiAcknowledged').checked=true;get('aiAcknowledged').events.change();assert.equal(get('aiAccept').disabled,false);
  get('aiReviewedSummary').value='Human correction';get('aiReviewedSummary').events.input();assert.equal(get('aiAccept').disabled,true);
  get('aiAcknowledged').checked=true;get('aiAcknowledged').events.change();await get('aiAccept').onclick();
  assert.equal(get('aiAccept').disabled,true);assert.equal(get('aiExport').disabled,false);
  const review=JSON.parse(calls.at(-1).options.body);assert.equal(review.reviewed_summary,'Human correction');assert.equal(review.input_hash,'input-v1');
  assert.ok(calls.every(x=>!x.url.endsWith('/analyze')));
});
test('changing the requirement invalidates accepted results and forbids restoring them',async()=>{
  const {get}=setup();get('aiConsent').checked=true;await get('aiSend').onclick();
  get('aiMessage').value='New requirement';get('aiMessage').events.input();assert.equal(get('aiResult').hidden,true);assert.equal(get('aiAccept').disabled,true);
  await get('aiResume').onclick();assert.equal(get('aiResult').hidden,true);
});
test('late proposal after invalidation is discarded and canceled, never shown for new input',async()=>{
  const {get,c,setPending,result}=setup();get('aiConsent').checked=true;await get('aiSend').onclick();
  let resolve;setPending(new Promise(r=>{resolve=r;}));
  const pending=get('aiSend').onclick();await new Promise(r=>setImmediate(r));
  c.window.AssistantIntake.invalidate();get('dataset').value='{"current":"plan-v2"}';
  setPending(null);resolve({ok:true,json:async()=>result});await pending;
  assert.equal(get('aiResult').hidden,true);assert.equal(get('aiAccept').disabled,true);assert.equal(get('aiExport').disabled,true);
});
