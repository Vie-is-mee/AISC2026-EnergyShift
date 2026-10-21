"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {build, PUBLIC_FILES} = require("./build-static.cjs");
const ROOT = path.resolve(__dirname, "..");

test("MANUAL verifier option exists in native UI", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /<select id="validationPlanSelect">[\s\S]*<option value="manual">MANUAL/);
});

test("the actual drag editor is present in static deployment output", () => {
  assert.ok(PUBLIC_FILES.includes("demo-interactive-gantt.js"));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "energyshift-manual-build-"));
  try {
    build(folder, {ENERGYSHIFT_API_BASE_URL:"https://demo.onrender.com"});
    assert.equal(
      fs.readFileSync(path.join(folder, "demo-interactive-gantt.js"), "utf8"),
      fs.readFileSync(path.join(ROOT, "demo-interactive-gantt.js"), "utf8")
    );
    assert.match(fs.readFileSync(path.join(folder, "index.html"), "utf8"), /demo-interactive-gantt\.js/);
  } finally { fs.rmSync(folder, {recursive:true, force:true}); }
});
