"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness(contextText = "Xưởng cơ khí nhận lô gia công") {
  let ready, capturedResume, invalidateCount = 0;
  const sent = [];
  const store = new Map();
  const controls = new Map();
  for (const id of ["facilityContext", "aiResume", "aiStatus", "facilityScopeHint", "aiMessage", "aiCSVNotes"]) {
    controls.set(id, {value: id === "facilityContext" ? contextText : "", textContent: "", events: {},
      addEventListener(type, fn) {this.events[type] = fn;}});
  }
  const c = vm.createContext({
    window: {ENERGYSHIFT_CONFIG: {apiBaseUrl: ""}, AssistantIntake: {invalidate() {invalidateCount++;}}},
    document: {
      getElementById(id) {return controls.get(id) || null;},
      addEventListener(type, fn) {if (type === "DOMContentLoaded") ready = fn;}
    },
    sessionStorage: {
      getItem(key) {return store.has(key) ? store.get(key) : null;},
      setItem(key, val) {store.set(key, val);}
    },
    fetch: async (url, options) => {sent.push({url, options});return {ok:true};},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../api-client.js"), "utf8"), c);
  ready();
  return {c, sent, controls, store, get invalidations() {return invalidateCount;}};
}

test("context enters intent and CSV model requests, never engine analyze calls", async () => {
  const h = harness("Xưởng may một công đoạn");
  await h.c.apiFetch("/api/demo/assistant/requests", {method:"POST",body:JSON.stringify({snapshot:{id:1},message:"test",consent:true})});
  const intent = JSON.parse(h.sent[0].options.body);
  assert.equal(intent.work_context, "Xưởng may một công đoạn");
  assert.equal(h.store.get("energyshift.assistant.last_context.v1"), "Xưởng may một công đoạn");

  await h.c.apiFetch("/api/demo/assistant/requests", {method:"POST",body:JSON.stringify({kind:"CSV",snapshot:{id:1},raw_text:"A,B\n1,2",consent:true})});
  assert.equal(JSON.parse(h.sent[1].options.body).work_context, "Xưởng may một công đoạn");

  const original = JSON.stringify({metadata:{source_type:"SYNTHETIC"}});
  await h.c.apiFetch("/api/demo/analyze", {method:"POST",body:original});
  assert.equal(h.sent[2].options.body, original);
});

test("editing context invalidates existing intent and old review cannot resume", async () => {
  const h = harness("Ngành A");
  await h.c.apiFetch("/api/demo/assistant/requests", {method:"POST",body:"{}"});
  const field = h.controls.get("facilityContext");
  field.value = "Ngành B";
  field.events.input();
  assert.equal(h.invalidations, 1);
  let cancelled = false, stopped = false;
  h.controls.get("aiResume").events.click({
    preventDefault(){cancelled = true;},stopImmediatePropagation(){stopped = true;}
  });
  assert.equal(cancelled,true);
  assert.equal(stopped,true);
  assert.match(h.controls.get("aiStatus").textContent,/Ngữ cảnh/);
});

test("live preflight explicitly warns about unmodeled sector-specific requirements", () => {
  const h = harness("Xưởng dệt may có công đoạn may trước khi đóng gói và thiếu công nhân.");
  const hint = h.controls.get("facilityScopeHint");
  assert.match(hint.textContent, /thứ tự nhiều công đoạn/);
  assert.match(hint.textContent, /nguồn lực nhân sự/);
  assert.match(hint.textContent, /CHƯA/);
  h.controls.get("facilityContext").value = "Nhà máy một công đoạn với máy M1.";
  h.controls.get("facilityContext").events.input();
  assert.match(hint.textContent, /KHÔNG chứng minh/);
  h.controls.get("aiMessage").value = "Cần chia nhỏ lô J1";
  h.controls.get("aiMessage").events.input();
  assert.match(hint.textContent, /chia nhỏ công việc/);
});

test("model context has bounded length", async () => {
  const h = harness("a".repeat(1201));
  assert.throws(() => h.c.apiFetch("/api/demo/assistant/requests", {method:"POST",body:"{}"}), /1200/);
  assert.equal(h.sent.length,0);
});
