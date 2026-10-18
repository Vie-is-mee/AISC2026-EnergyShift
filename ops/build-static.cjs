/* Build an allowlisted Vercel artifact, never publish the repository root. */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_FILES = ['index.html', 'app.js', 'live.css', 'input-model.js', 'input-desk.js', 'api-client.js'];
function build(destination = path.join(ROOT, 'dist'), env = process.env) {
  const raw = (env.ENERGYSHIFT_API_BASE_URL || '').trim().replace(/\/$/, '');
  let url;
  try { url = new URL(raw); } catch { throw Error('Set ENERGYSHIFT_API_BASE_URL to the HTTPS Render service URL before building.'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.onrender.com') || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw Error('ENERGYSHIFT_API_BASE_URL must be an HTTPS *.onrender.com origin without a path, credentials or query.');
  }
  fs.mkdirSync(destination, { recursive: true });
  // Fail if reusing a contaminated output folder; never silently serve unexpected files.
  const allowed = new Set([...PUBLIC_FILES, 'deployment-config.js']);
  for (const name of fs.readdirSync(destination)) if (!allowed.has(name)) throw Error('Unexpected build output: ' + name);
  for (const name of PUBLIC_FILES) fs.copyFileSync(path.join(ROOT, name), path.join(destination, name));
  fs.writeFileSync(path.join(destination, 'deployment-config.js'), 'window.ENERGYSHIFT_CONFIG = Object.freeze(' + JSON.stringify({ apiBaseUrl: url.origin }) + ');\n');
  return destination;
}
if (require.main === module) build();
module.exports = { build, PUBLIC_FILES };
