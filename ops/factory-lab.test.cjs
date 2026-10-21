"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {build, PUBLIC_FILES} = require("./build-static.cjs");

const ROOT = path.resolve(__dirname, "..");

test("new factory-1 front end is included in static packaging without backend files", () => {
  assert.ok(PUBLIC_FILES.includes("factory-lab.js"));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "energyshift-factory-1-"));
  try {
    build(directory, {ENERGYSHIFT_API_BASE_URL:"https://demo.onrender.com"});
    const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
    assert.match(html, /src="\/factory-lab\.js"/);
    const js = fs.readFileSync(path.join(directory, "factory-lab.js"), "utf8");
    assert.match(js, /\/api\/factory\/analyze/);
    assert.match(js, /FIXED_MACHINE/);
    assert.match(js, /JOINT_MACHINE_TIME/);
    assert.ok(!fs.existsSync(path.join(directory, "backend")));
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
});

test("factory UI explicitly distinguishes assumptions and does not imply deployment", () => {
  const js = fs.readFileSync(path.join(ROOT, "factory-lab.js"), "utf8");
  assert.match(js, /không bắt buộc khuôn/);
  assert.match(js, /NO_SETUP_REQUIRED_CONFIRMED|không cần setup/i);
  assert.match(js, /DECLARED_CHANGEOVERS/);
  assert.match(js, /changeover_total_vnd/);
  assert.match(js, /factory-lab-setup/);
  assert.match(js, /không tự triển khai tại xưởng/);
  assert.match(js, /global|toàn cục/);
  assert.match(js, /verification\.status/);
});

test("Factory Lab uses its own allowlisted routes rather than demo-only apiFetch", () => {
  const js = fs.readFileSync(path.join(ROOT, "factory-lab.js"), "utf8");
  const shared = fs.readFileSync(path.join(ROOT, "api-client.js"), "utf8");
  assert.match(shared, /path\.startsWith\("\/api\/demo\/"\)/);
  assert.match(js, /const factoryFetch/);
  assert.match(js, /"\/api\/factory\/example"/);
  assert.match(js, /"\/api\/factory\/analyze"/);
  assert.match(js, /"\/api\/factory\/packaging-example"/);
  assert.match(js, /"\/api\/factory\/changeover-example"/);
  assert.match(js, /"\/api\/factory\/multistage-example"/);
  assert.match(js, /factoryMultistage/);
  assert.match(js, /factory-lab-routes/);
  assert.match(js, /factoryChangeover/);
  assert.match(js, /factoryPackaging/);
  assert.match(js, /report\.search\.global_optimum_proven/);
  assert.match(js, /report\.enforced_constraints/);
  assert.match(js, /credentials:\s*"omit"/);
  assert.doesNotMatch(js, /\bapiFetch\s*\(/);
});

test("CSV and XLSX imports demand server preview and explicit user acceptance", () => {
  const js = fs.readFileSync(path.join(ROOT, "factory-lab.js"), "utf8");
  assert.match(js, /factorySpreadsheet/);
  assert.match(js, /factoryImportAccept/);
  assert.match(js, /factoryTemplateCSV/);
  assert.match(js, /factoryTemplateXLSX/);
  assert.match(js, /\/api\/factory\/import\/preview/);
  assert.match(js, /\/api\/factory\/import\/template/);
  assert.match(js, /READY_FOR_REVIEW/);
  assert.match(js, /pendingImport/);
  assert.match(js, /ready_for_analysis/);
  assert.match(js, /review_required|Chấp nhận bảng đã xem/);
  assert.match(js, /MAX|350000/);
});

test("factory business objectives are independent of machine scope and invalidate stale evidence", () => {
  const js = fs.readFileSync(path.join(ROOT, "factory-lab.js"), "utf8");
  assert.match(js, /id="factoryObjective"/);
  assert.match(js, /value="ENERGY"/);
  assert.match(js, /value="PRODUCTION"/);
  assert.match(js, /value="COMBINED"/);
  assert.match(js, /id="factoryMakespanSlack"/);
  assert.match(js, /max_makespan_slack_minutes:/);
  assert.match(js, /objective_mode:/);
  assert.match(js, /factoryObjective"\)\.addEventListener\("change"/);
  assert.match(js, /factoryMakespanSlack"\)\.addEventListener\("input"/);
  assert.match(js, /makespan_minutes/);
});
