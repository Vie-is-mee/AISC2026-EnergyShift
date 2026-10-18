const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { build, PUBLIC_FILES } = require('./build-static.cjs');
const ROOT = path.resolve(__dirname, '..');
function temporary(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'energyshift-deploy-'));
  try { return fn(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
test('static artifact contains only public files, even when secret variables exist', () => temporary((directory) => {
  build(directory, { ENERGYSHIFT_API_BASE_URL: 'https://demo.onrender.com/', OPENROUTER_API_KEY: 'FAKE_TEST_ONLY_NEVER_PUBLISH' });
  assert.deepEqual(fs.readdirSync(directory).sort(), [...PUBLIC_FILES, 'deployment-config.js'].sort());
  for (const name of fs.readdirSync(directory)) assert.ok(!fs.readFileSync(path.join(directory, name), 'utf8').includes('FAKE_TEST_ONLY_NEVER_PUBLISH'));
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(directory, 'deployment-config.js'), 'utf8'), context);
  assert.equal(context.window.ENERGYSHIFT_CONFIG.apiBaseUrl, 'https://demo.onrender.com');
  assert.ok(!fs.existsSync(path.join(directory, 'backend')));
}));
test('missing or unsafe public backend URL fails the build', () => temporary((directory) => {
  for (const value of ['', 'http://demo.onrender.com', 'https://demo.example.com', 'https://demo.onrender.com/api', 'https://user:key@demo.onrender.com', 'https://demo.onrender.com?key=bad', 'https://demo.onrender.com.evil.example']) {
    assert.throws(() => build(directory, { ENERGYSHIFT_API_BASE_URL: value }));
  }
}));
test('contaminated output directory fails rather than publishing extra files', () => temporary((directory) => {
  fs.writeFileSync(path.join(directory, 'accidental-secret.txt'), 'fake');
  assert.throws(() => build(directory, { ENERGYSHIFT_API_BASE_URL: 'https://demo.onrender.com' }), /Unexpected/);
}));
test('API client targets configured backend without browser credentials', async () => {
  let observed;
  const context = { window: { ENERGYSHIFT_CONFIG: { apiBaseUrl: 'https://demo.onrender.com' } }, fetch: async (...args) => { observed = args; return 'ok'; } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(ROOT, 'api-client.js'), 'utf8'), context);
  assert.equal(await vm.runInContext('apiFetch("/api/demo/analyze", {method:"POST",body:"{}"})', context), 'ok');
  assert.equal(observed[0], 'https://demo.onrender.com/api/demo/analyze');
  assert.equal(observed[1].credentials, 'omit');
  assert.equal(observed[1].method, 'POST');
  assert.throws(() => vm.runInContext('apiFetch("https://foreign.example")', context));
});
test('local mode stays same-origin', async () => {
  const context = { window: {}, fetch: async (url) => url }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'api-client.js'), 'utf8'), context);
  assert.equal(await vm.runInContext('apiFetch("/api/demo/health")', context), '/api/demo/health');
});
