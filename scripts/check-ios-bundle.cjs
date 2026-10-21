// Non-destructive checks for the Capacitor iOS bundle.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const problems = [];

if (config.webDir !== 'www') problems.push('Capacitor webDir must be www');
if (config.server?.url) problems.push('Remote server.url must not be used for the bundled app');
if (!config.appId || !config.appName) problems.push('Capacitor appId/appName missing');

for (const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/g)) {
  const url = match[1];
  if (/^(?:https?:|data:|#|\/\/)/i.test(url)) continue;
  const local = url.split(/[?#]/)[0];
  if (!local || local === '.') continue;
  if (!fs.existsSync(path.join(root, 'www', local))) problems.push('Missing bundled asset: ' + local);
}
for (const file of ['app.js', 'cloud.js', 'charts.js']) {
  const fullPath = path.join(root, 'www', file);
  if (!fs.existsSync(fullPath)) { problems.push('Missing JavaScript: ' + file); continue; }
  try { new vm.Script(fs.readFileSync(fullPath, 'utf8'), {filename:file}); }
  catch (error) { problems.push('Invalid JavaScript in ' + file + ': ' + error.message); }
}
// Catch native integration regressions without touching production or user data.
const cloud = fs.readFileSync(path.join(root, 'www/cloud.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'server/api.php'), 'utf8');
if (!cloud.includes('https://tracker.web-produktion.com/api/api.php'))
  problems.push('Cloud API endpoint unexpectedly changed');
if (!api.includes("'capacitor://localhost'"))
  problems.push('Development API must explicitly allow the native Capacitor origin');
if (/navigator\.serviceWorker\.register\s*\(/.test(html + fs.readFileSync(path.join(root, 'www/app.js'), 'utf8')))
  problems.push('Native bundle must not register a PWA service worker');
if (!html.includes('viewport-fit=cover'))
  problems.push('Native viewport must support iPhone safe areas');
if (!html.includes('ios-native.css'))
  problems.push('Native iOS safe-area stylesheet missing');
if (/\bserver\s*:\s*\{\s*url\s*:/.test(JSON.stringify(config)))
  problems.push('Do not load the production PWA as a remote native shell');

if (html.includes('manifest.webmanifest')) problems.push('iOS bundle should not reference the PWA manifest');
if (problems.length) {
  console.error('iOS bundle checks failed:\n' + problems.map(x => '- ' + x).join('\n'));
  process.exitCode = 1;
} else {
  console.log('iOS bundle checks passed (assets, syntax, local Capacitor configuration).');
}
