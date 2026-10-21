const test = require("node:test");
const assert = require("node:assert/strict");
const Chart = require("../energy-chart.js");

test("twelve five-minute samples aggregate into one weighted hourly mean without erasing peak",()=>{
  const kw=[1,1,1,1,1,1,1,1,1,1,1,13];
  const [hour]=Chart.bucketSeries(kw,5,0,60,60);
  assert.equal(hour.average,2);
  assert.equal(hour.peak,13);
  assert.equal(hour.coveredMinutes,60);
  assert.equal(hour.complete,true);
  const exactKwh=kw.reduce((sum,kw)=>sum+kw*5/60,0);
  assert.ok(Math.abs(hour.average-exactKwh)<1e-12);
});

test("5-minute, 15-minute and hourly views preserve the exact underlying kWh",()=>{
  const samples=Array.from({length:288},(_,i)=>i%17===0?5.2:(i%7)*0.17);
  const source=samples.reduce((sum,kw)=>sum+kw*5/60,0);
  for(const interval of [5,15,60]){
    const bins=Chart.bucketSeries(samples,5,0,1440,interval);
    const viewed=bins.reduce((sum,b)=>sum+b.average*(b.endMinute-b.startMinute)/60,0);
    assert.ok(Math.abs(source-viewed)<1e-9);
    assert.equal(bins.length,1440/interval);
  }
});

test("24h window on the second day includes only that day",()=>{
  const samples=[...Array(288).fill(1),...Array(288).fill(3)];
  const first=Chart.bucketSeries(samples,5,0,1440,60);
  const second=Chart.bucketSeries(samples,5,1440,2880,60);
  assert.equal(first.length,24);
  assert.equal(second.length,24);
  assert.ok(first.every(b=>b.average===1));
  assert.ok(second.every(b=>b.average===3));
});

test("partial final window is weighted by actual duration, not 24h padding",()=>{
  const samples=[...Array(288).fill(1),...Array(7).fill(9)];
  const last=Chart.bucketSeries(samples,5,1440,1475,15);
  assert.equal(last.length,3);
  assert.deepEqual(last.map(b=>b.endMinute-b.startMinute),[15,15,5]);
  assert.deepEqual(last.map(b=>b.average),[9,9,9]);
});

test("missing or malformed input is not silently rendered as zero",()=>{
  const samples=[1,NaN,2];
  const bins=Chart.bucketSeries(samples,5,0,15,15);
  assert.equal(bins[0].average,null);
  assert.equal(bins[0].complete,false);
  assert.equal(bins[0].peak,2);
  assert.throws(()=>Chart.bucketSeries(samples,5,0,15,4));
});

test("SOURCE is not translated to an invented currency",()=>{
  assert.equal(Chart.sourceCurrency("SOURCE"),"Đơn vị chi phí nguồn (chưa xác minh)");
  assert.equal(Chart.shortCurrency("SOURCE"),"đv nguồn*");
  assert.equal(Chart.sourceCurrency("VND"),"VND");
});
