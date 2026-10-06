import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const app = read('js/app.js');
const store = read('js/store-v4.js');
const index = read('index.html');
const results = [];
const check = (name, ok) => { results.push({name, ok:Boolean(ok)}); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

try { new vm.Script(app); check('app.js syntax', true); } catch { check('app.js syntax', false); }
try { new vm.Script(store); check('store-v4.js syntax', true); } catch { check('store-v4.js syntax', false); }

check('detail action delegation is document-level', store.includes("document.addEventListener('click',e=>{const target=e.target instanceof Element?e.target.closest('[data-sv4-detail-buy],[data-sv4-detail-toggle-feature],[data-sv4-detail-toggle-appearance],[data-sv4-close]')"));
check('detail close selector remains wired', store.includes('[data-sv4-close]'));
check('subpage navigation is rendered', ['features(root){root.innerHTML=`${subnav()}', 'appearancePage(root){const themes=', 'collection(root){const f=ensure();'].every(s => store.includes(s)));
check('home route exists in shared subnav', store.includes("route('home','الرئيسية')"));
check('feature purchase still uses transaction authority', store.includes('executeStoreTransaction'));
check('appearance purchase still uses core authority', store.includes('buyStoreItem(id)'));
check('legacy app purchase logic remains untouched', /function buyStoreItem\(id, isDailyOffer = false\)/.test(app));
check('no new state version/migration introduced', !/CURRENT_STATE_VERSION\s*=\s*(?:8|9|10)/.test(app));

// Ensure the only runtime-source change from Store V4 is store-v4.js.
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(new URL(file, root))).digest('hex');
const baseline = new Map();
const lines = read('tools/store-v4-release-sha256.txt').trim().split(/\n/).filter(Boolean);
for (const line of lines) { const [sum, file] = line.trim().split(/\s+/); if (sum && file) baseline.set(file, sum); }
for (const file of ['index.html','css/style.css','js/app.js','js/store-tools.js','js/store-experience.js','js/journal.js']) {
  check(`runtime file unchanged: ${file}`, baseline.get(file) === sha(file));
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
