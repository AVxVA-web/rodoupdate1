#!/usr/bin/env node
/**
 * RODO non-regression QA guard.
 * Deliberately uses only Node's standard library; no runtime dependencies.
 * This script does not modify the application.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const htmlPath = path.join(root, 'index.html');
const required = [
  'index.html',
  'js/app.js',
  'js/store-tools.js',
  'css/style.css',
  'STORE-INTEGRATION.md',
];

const warnings = [];
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function pass(msg) { console.log(`PASS  ${msg}`); }
function warn(msg) { warnings.push(msg); console.log(`WARN  ${msg}`); }
function fail(msg) { failures.push(msg); console.log(`FAIL  ${msg}`); }

for (const rel of required) {
  if (exists(rel)) pass(`required file: ${rel}`);
  else fail(`missing required file: ${rel}`);
}

for (const rel of ['js/app.js', 'js/journal.js', 'js/store-tools.js']) {
  if (!exists(rel)) continue;
  try {
    execFileSync(process.execPath, ['--check', rel], { cwd: root, stdio: 'pipe' });
    pass(`syntax: ${rel}`);
  } catch (error) {
    fail(`syntax error: ${rel}`);
  }
}

if (exists('index.html')) {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map(m => m[1]);
  const normalized = scripts.map(s => s.split('?', 1)[0]);
  const appIndex = normalized.indexOf('js/app.js');
  const toolsIndex = normalized.indexOf('js/store-tools.js');
  if (appIndex >= 0 && toolsIndex >= 0 && appIndex < toolsIndex) {
    pass('script order: app.js loads before store-tools.js');
  } else {
    fail('script order: expected app.js before store-tools.js');
  }

  const journalNav = /id=["']nav-journal["']/i.test(html);
  const journalView = /id=["']view-journal["']/i.test(html);
  const journalScript = /<script[^>]+src=["']js\/journal\.js(?:\?[^"']*)?["']/i.test(html);
  if (journalNav && journalView && journalScript) pass('journal integration: nav, view, and script are present');
  else fail('journal integration: expected nav-journal, view-journal, and js/journal.js');

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([id, count]) => `${id} (${count}x)`);
  if (duplicates.length === 0) pass('DOM ids: no duplicate static ids detected');
  else fail(`DOM ids: duplicates detected: ${duplicates.slice(0, 20).join(', ')}`);

  const inlineHandlers = (html.match(/\bon(?:click|submit|change|input|keydown|keyup|focus|blur|load)=["']/gi) ?? []).length;
  if (inlineHandlers === 0) pass('inline handlers: none');
  else warn(`inline handlers: ${inlineHandlers} detected (legacy coupling; leave unchanged unless migrated with tests)`);

  if (/user-scalable\s*=\s*no/i.test(html) || /maximum-scale\s*=\s*1(?:\.0)?/i.test(html)) {
    warn('viewport: zoom is restricted (accessibility debt; intentionally not changed by this safe baseline)');
  } else pass('viewport: no explicit zoom restriction detected');

  if (/lucide@latest/i.test(html) || /@latest\/dist/i.test(html)) {
    warn('dependencies: an @latest CDN dependency is present (reproducibility debt; intentionally not changed)');
  } else pass('dependencies: no @latest CDN URL detected');
}

console.log('');
console.log(`Result: ${failures.length ? 'FAILED' : 'PASSED'} — ${warnings.length} warning(s), ${failures.length} failure(s)`);
if (warnings.length) console.log('Warnings are informational in the safe baseline and do not alter runtime behavior.');
process.exitCode = failures.length ? 1 : 0;
