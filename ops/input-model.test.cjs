const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const M = require('../input-model.js');
const fixture = () => JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../backend/fixtures/editable_cell.json'), 'utf8'));

test('a smaller plan scopes unused family transitions but preserves the full reusable profile and initial-state rules',()=>{
  const base=fixture(),before=M.copy(base),rows=M.rowsFrom(base).slice(0,1);
  const result=M.compile(base,rows);
  const families=new Set([result.jobs[0].family,...Object.values(base.setup.initial_family_by_machine)]);
  assert.ok(result.setup.transitions.every(t=>families.has(t.from_family) && families.has(t.to_family)));
  assert.ok(result.setup.transitions.length<base.setup.transitions.length);assert.deepEqual(base,before);
  base.setup.initial_family_by_machine.M3='B';
  const mounted=M.compile(base,rows);
  assert.ok(mounted.setup.transitions.some(t=>t.from_family==='B'));
  base.setup.transitions.push({...base.setup.transitions[0],to_family:'UNDECLARED_TYPO'});
  assert.ok(M.compile(base,rows).setup.transitions.some(t=>t.to_family==='UNDECLARED_TYPO'),'Do not hide invalid profile references from the backend gate');
});
test('roundtrip preserves production facts, setup, tariff, power uncertainty and all eligible machines', () => {
  const base = fixture(); base.jobs[0].eligible.M1.power_uncertainty_pct = .03;
  const result = M.compile(base, M.rowsFrom(base), { reconfirmCosts: true });
  for (const field of ['machines', 'molds', 'setup', 'tariff', 'policy', 'cost_scope', 'metadata']) assert.deepEqual(result[field], base[field]);
  result.jobs.forEach((j, i) => { assert.deepEqual(j.eligible, base.jobs[i].eligible); assert.equal(j.quantity, base.jobs[i].quantity); assert.equal(Date.parse(j.due), Date.parse(base.jobs[i].due)); });
  assert.deepEqual(base, { ...fixture(), jobs: base.jobs });
});
test('unreviewed plan resets ALL excluded costs to UNKNOWN, preserving synthetic provenance', () => {
  const base = fixture(), before = M.copy(base);
  const d = M.compile(base, M.rowsFrom(base));
  for (const v of Object.values(d.cost_scope.excluded_review)) { assert.equal(v.status, 'UNKNOWN'); assert.equal(v.incremental_min_vnd, null); assert.equal(v.source_type, 'SYNTHETIC'); }
  assert.deepEqual(base, before);
});
test('explicit review preserves declared bounds including negative incremental costs', () => {
  const b = fixture(); b.cost_scope.excluded_review.OTHER_COSTS.incremental_min_vnd = -100;
  assert.deepEqual(M.compile(b, M.rowsFrom(b), { reconfirmCosts: true }).cost_scope, b.cost_scope);
});
test('changed quantity cannot inherit or scale confirmed durations', () => {
  const b = fixture(), r = M.rowsFrom(b); r[0].quantity = '2001'; assert.throws(() => M.compile(b, r), /Số lượng khác/);
});
test('duplicate and invalid job IDs are blocked', () => {
  const b = fixture(), r = M.rowsFrom(b); r[1].job_id = r[0].job_id; assert.throws(() => M.compile(b, r), /trùng/);
  r[1].job_id = '=HYPERLINK(x)'; assert.throws(() => M.compile(b, r), /định dạng/);
});
test('new order IDs reuse exact template facts without relabeling provenance', () => {
  const b = fixture(), r = M.rowsFrom(b); r[0].job_id = 'ORDER_100';
  const d = M.compile(b, r); assert.equal(d.jobs[0].id, 'ORDER_100'); assert.deepEqual(d.jobs[0].eligible, b.jobs[0].eligible); assert.equal(d.current_schedule[0].job_id, 'ORDER_100');
});
test('unknown template and ineligible machine fail instead of guessing', () => {
  const b = fixture(), r = M.rowsFrom(b); r[0].template_id = 'UNKNOWN'; assert.throws(() => M.compile(b, r), /Định mức/);
  r[0].template_id = b.jobs[0].id; r[0].machine_id = 'UNKNOWN'; assert.throws(() => M.compile(b, r), /tương thích/);
});
test('limits never silently drop orders', () => {
  assert.throws(() => M.compile(fixture(), [])); assert.throws(() => M.compile(fixture(), Array(9).fill({})));
});
test('CSV export/import retains all daily fields and UTF-8 BOM', () => {
  const r = M.rowsFrom(fixture()), parsed = M.parseTable('\uFEFF' + M.csv(r));
  assert.deepEqual(M.mapRows(parsed, M.suggest(parsed.headers)), r);
});
test('Excel paste aliases tolerate Vietnamese accents and delimiter variants', () => {
  for (const sep of ['\t', ';', ',']) {
    const p = M.parseTable(M.titles.join(sep) + '\r\n' + ['NEW1','J1','1000','M1','2026-10-19 08:00','2026-10-19 00:00','2026-10-20 00:00'].join(sep));
    assert.equal(M.mapRows(p, M.suggest(p.headers))[0].template_id, 'J1');
  }
});
test('quoted cells retain delimiters, escaped quotes and newlines', () => {
  const p = M.parseTable('job_id,note\nJ1,"a,b; ""quoted""\nline 2"'); assert.equal(p.rows[0][1], 'a,b; "quoted"\nline 2');
});
test('delimiter detection ignores separators inside quoted headers', () => {
  const p = M.parseTable('job_id,"notes;with;semicolon"\nJ1,hello');
  assert.equal(p.delimiter, ','); assert.deepEqual(p.headers, ['job_id', 'notes;with;semicolon']);
});
test('bad quotes, ragged rows and duplicate normalized headers fail', () => {
  for (const s of ['a,b\n1,"x', 'a,b\n1', 'a,A\n1,2', 'a,b\n1,"x"bad', 'a,b\n1,x"y']) assert.throws(() => M.parseTable(s));
});
test('unmapped columns require explicit acknowledgment and original remains available', () => {
  const p = M.parseTable(M.csv(M.rowsFrom(fixture())).replace(/\r\n/g, ',note\r\n') + ',note');
  const m = M.suggest(p.headers); assert.throws(() => M.mapRows(p, m), /cột ngoài/);
  assert.equal(M.mapRows(p, m, true).length, 8); assert.equal(p.rows[0].at(-1), 'note');
});
test('missing and duplicate mappings cannot produce incomplete plans', () => {
  const p = M.parseTable(M.csv(M.rowsFrom(fixture()))), m = M.suggest(p.headers);
  m[1] = 'job_id'; assert.throws(() => M.mapRows(p, m), /nhiều lần/); m[1] = ''; assert.throws(() => M.mapRows(p, m, true), /Cần ghép/);
});
test('parser enforces limits for size, rows, columns and cell length', () => {
  for (const text of ['x'.repeat(128 * 1024 + 1), 'a\n' + Array(9).fill('1').join('\n'), Array(33).fill(0).map((_,i)=>'c'+i).join(',')+'\n'+Array(33).fill('v').join(','), 'a\n'+'x'.repeat(4097)]) assert.throws(() => M.parseTable(text));
});
test('dates reject ambiguous, nonexistent and wrong-offset values', () => {
  for (const t of ['19/10/2026 08:00', '2026-02-30T08:00', '2026-10-19T25:00', '2026-10-19T08:00Z', '2026-10-19T08:00+08:00']) assert.throws(() => M.timestamp(t));
  assert.equal(M.timestamp('2026-10-19 08:00'), '2026-10-19T08:00+07:00');
});
test('day shift preserves durations, overnight horizon and exact availability/tariff geometry', () => {
  const b = fixture(), d = M.shift(b, '2026-10-22'), delta = 3*24*3600000;
  assert.equal(Date.parse(d.horizon.end) - Date.parse(b.horizon.end), delta);
  for (const group of [d.machines.flatMap((m) => m.available), d.tariff.windows]) assert.equal(Date.parse(group[0].start) - Date.parse(d.horizon.start), 0);
  assert.deepEqual(d.setup, b.setup); assert.deepEqual(d.jobs[0].eligible, b.jobs[0].eligible); assert.deepEqual(b, fixture());
});
