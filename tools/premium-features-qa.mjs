import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const sha = file => crypto.createHash('sha256').update(read(file)).digest('hex');
const app = read('js/app.js');
const journal = read('js/journal.js');
const store = read('js/store-v4.js');
const premium = read('js/premium-features.js');
const index = read('index.html');
const css = read('css/style.css');
const results=[];
const check=(name,ok)=>{results.push({name,ok:Boolean(ok)}); console.log(`${ok?'PASS':'FAIL'} ${name}`)};

for (const [name,source] of [['app.js',app],['journal.js',journal],['store-v4.js',store],['premium-features.js',premium]]) {
  try { new vm.Script(source); check(`${name} syntax`, true); } catch (e) { check(`${name} syntax`, false); console.error(e.message); }
}

check('premium module is loaded after store-v4', index.indexOf('js/store-v4.js') < index.indexOf('js/premium-features.js'));
check('journal filter understands active folder', journal.includes("folderId: window.RODOPremiumFeatures?.isActive?.(window.RODOPremiumFeatures.FEATURE.JOURNAL_FOLDERS)"));
check('journal filter applies folder constraint', journal.includes(".filter(entry => filter.folderId === 'all' || String(entry.folderId || '') === String(filter.folderId))"));
check('journal render exposes premium hook', journal.includes('window.RODOPremiumFeatures?.onJournalRendered?.();'));
check('journal save exposes new-entry hook', journal.includes("window.RODOPremiumFeatures?.onJournalSaved?.(entry, { isNew: true });"));
check('journal reader exposes folder hook', journal.includes('window.RODOPremiumFeatures?.onJournalReaderOpen?.(entry);'));
check('goals render has milestone hook', app.includes('window.RODOPremiumFeatures?.renderGoalMilestones?.(goal)'));
check('stats render has advanced-stats hook', app.includes('window.RODOPremiumFeatures?.onStatsRendered?.();'));
check('focus start has preset hook', app.includes('window.RODOPremiumFeatures?.onFocusStartReady?.();'));
check('focus subject change has preset hook', app.includes('window.RODOPremiumFeatures?.onFocusStartStateChanged?.();'));
check('store feature toggle emits domain event', store.includes("new CustomEvent('rodo:premium-feature-change'"));
check('store exposes feature active query', store.includes('isFeatureActive:activeFeature'));
check('four approved features are present', [
  'feature_journal_folders','feature_advanced_stats','feature_focus_presets','feature_goal_milestones'
].every(id=>store.includes(id)));
check('no state version bump', !/const CURRENT_STATE_VERSION = 8;/.test(app));
check('journal folders have unlimited-note model', premium.includes('getJournals().filter(entry => String(entry.folderId || \'\') === String(folder.id)).length'));
check('no subfolder model added', !premium.includes('parentFolderId') && !premium.includes('subfolders'));
check('feature data persists under v4Features', premium.includes('state.store.v4Features') && premium.includes('f.data'));
check('milestone data persists under feature data', premium.includes('data.goalMilestones'));
check('focus preset data persists under feature data', premium.includes('data.focusPresets'));
check('journal folder relation persists on journal entry', premium.includes('entry.folderId = String(folderId)'));
check('disabling features does not remove feature data', premium.includes('if (!isActive(FEATURE.JOURNAL_FOLDERS))') && premium.includes('document.getElementById(\'rodo-journal-folders\')?.remove()'));
check('premium selectors use dedicated data attributes', premium.includes('data-premium-milestone-add') && premium.includes('data-premium-focus-use') && premium.includes('data-premium-folder-create'));
check('goal milestone checkbox click is not intercepted before change', premium.includes("event.type !== 'change'"));

// Only the expected integration/runtime files may differ from the pre-feature snapshot.
const unchangedExpected = new Map([
  ['js/store-tools.js','9bd0e31dd236c6764996c86b44ed6b15b8ad7a814ba3ed5fbd11554ae5522d5f'],
  ['js/store-experience.js','40abbcded81e7f634329b9fdfa785c8f72fcd8522efbfff6551d429d3c4a7dd6']
]);
for (const file of ['js/store-tools.js','js/store-experience.js']) {
  check(`unrelated runtime file unchanged: ${file}`, unchangedExpected.get(file) === sha(file));
}

const failed=results.filter(x=>!x.ok);
console.log(`\n${results.length-failed.length} passed, ${failed.length} failed`);
process.exit(failed.length?1:0);
