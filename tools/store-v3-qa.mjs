#!/usr/bin/env node
/**
 * RODO Store V3 additive QA guard.
 * No application state is mutated; this is a static and behavioral-contract check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const failures = [];
const warnings = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const has = (text, needle) => text.includes(needle);
const pass = msg => console.log(`PASS  ${msg}`);
const fail = msg => { failures.push(msg); console.log(`FAIL  ${msg}`); };
const warn = msg => { warnings.push(msg); console.log(`WARN  ${msg}`); };

for (const rel of ['index.html','js/app.js','js/store-tools.js','js/store-experience.js','css/style.css','tools/qa.mjs']) {
  if (fs.existsSync(path.join(root, rel))) pass(`required file: ${rel}`);
  else fail(`missing required file: ${rel}`);
}

for (const rel of ['js/app.js','js/store-tools.js','js/store-experience.js','js/journal.js']) {
  try { execFileSync(process.execPath,['--check',rel],{cwd:root,stdio:'pipe'}); pass(`syntax: ${rel}`); }
  catch { fail(`syntax error: ${rel}`); }
}

try { execFileSync(process.execPath,['tools/store-experience-contract.mjs'],{cwd:root,stdio:'pipe'}); pass('deterministic Store V3 behavior simulation'); }
catch { fail('deterministic Store V3 behavior simulation failed'); }

const html = read('index.html');
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1].split('?',1)[0]);
const order = name => scripts.indexOf(name);
if (order('js/app.js') >= 0 && order('js/store-tools.js') > order('js/app.js') && order('js/store-experience.js') > order('js/store-tools.js')) pass('script order: app → store-tools → store-experience');
else fail('script order is not app → store-tools → store-experience');

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]);
const counts = new Map(); for (const id of ids) counts.set(id,(counts.get(id)||0)+1);
const dup=[...counts].filter(([,n])=>n>1); if (!dup.length) pass('DOM ids: no duplicate static ids'); else fail(`DOM ids duplicated: ${dup.slice(0,10).map(([id,n])=>`${id} (${n}x)`).join(', ')}`);

for (const id of ['store-product-detail-modal','store-detail-action','store-detail-confirm','store-detail-confirm-action','chest-reveal-modal']) {
  if (new RegExp(`id=["']${id}["']`,'i').test(html)) pass(`store UI id present: ${id}`); else fail(`missing store UI id: ${id}`);
}

const app = read('js/app.js');
const tools = read('js/store-tools.js');
const exp = read('js/store-experience.js');
const css = read('css/style.css');

if (/const CURRENT_STATE_VERSION\s*=\s*7\s*;/.test(app)) pass('state schema untouched: CURRENT_STATE_VERSION remains 7');
else fail('state schema changed unexpectedly');
if (!/localStorage\./.test(exp) && !/localStorage\s*\[/.test(exp)) pass('store-experience layer does not write localStorage directly');
else fail('store-experience layer writes localStorage directly');
if (has(tools,'window.RODO_STUDY_STORE_PRODUCTS = STUDY_STORE_PRODUCTS;')) pass('study store catalog exposed read-only to presentation layer'); else fail('study catalog export missing');
if (has(exp,'window.openStoreProductDetail = openStoreProductDetail;')) pass('product detail API exported'); else fail('product detail API missing');
if (has(exp,'interceptLegacyPurchaseButtons')) pass('legacy purchase actions are safely routed through detail sheet'); else fail('purchase routing missing');
if (has(exp,'confirmStoreProductPurchase')) pass('purchase confirmation contract present'); else fail('purchase confirmation missing');
if (has(exp,'window.showChestRevealModal = enhanced;')) pass('chest reveal uses the enhanced V3 presentation layer'); else fail('chest reveal override missing');
if (!/#view-store .*rodo-store-detail/.test(css)) pass('detail modal styles are not accidentally scoped under #view-store'); else fail('detail modal contains a stale #view-store scope');
if (has(css,'#store-product-detail-modal .rodo-store-detail-sheet')) pass('product detail sheet has dedicated scoped CSS'); else fail('product detail CSS missing');
if (has(css,'.rodo-chest-reveal-icon.is-opening')) pass('chest opening motion styles present'); else fail('chest opening styles missing');

// Ensure core purchase function remains intact and is still the mutation authority.
if (has(app,'function buyStoreItem(id, isDailyOffer = false)')) pass('core purchase authority preserved'); else fail('core purchase function missing');
if (has(tools,'function buyStudyStoreProduct(id)')) pass('study tool purchase authority preserved'); else fail('study tool purchase function missing');

const pre = fs.existsSync(path.join(root,'tools/pre-store-v3-sha256.txt'));
if (pre) pass('pre-change SHA-256 snapshot retained'); else warn('pre-change SHA-256 snapshot missing');

console.log('');
console.log(`Result: ${failures.length ? 'FAILED' : 'PASSED'} — ${warnings.length} warning(s), ${failures.length} failure(s)`);
process.exitCode = failures.length ? 1 : 0;
