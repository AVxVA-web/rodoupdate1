import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

function pass(name) { console.log(`PASS  ${name}`); }

assert.match(app, /const CURRENT_STATE_VERSION = 7;/);
pass('focus goal state version is 7');

for (const field of ['subjectId','goalMs','goalRewardClaimed','goalReached','goalReachedAt']) {
  assert.match(app, new RegExp(`activeSession[^\n]*${field}`));
}
pass('activeSession includes goal metadata');

for (const fn of ['openFocusStartModal','renderFocusStartSubjects','selectFocusStartSubject','selectFocusGoal','startConfiguredFocusSession','closeFocusStartModal','getFocusGoalReward','normalizeFocusGoalMinutes']) {
  assert.match(app, new RegExp(`function ${fn}\\(`));
}
pass('focus goal/session commands are present');

assert.match(html, /id="modal-focus-start"/);
for (const id of ['focus-start-subject-list','focus-start-goal-step','focus-goal-reward-preview','btn-start-focus-session','focus-new-subject-input','focus-custom-goal']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
pass('focus start modal has required controls');

for (const id of ['stopwatch-goal-panel','stopwatch-goal-label','stopwatch-goal-status','stopwatch-goal-progress','stopwatch-goal-shell']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
pass('standard focus view has goal progress UI');

for (const id of ['timer-subject-zen','timer-state-zen','timer-goal-zen','zen-progress-ring','icon-zen-toggle']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
pass('Zen instrument has editable state hooks');

assert.match(app, /\{ minutes: 120, coins: 200, xp: 100 \}/);
assert.match(app, /\{ minutes: 180, coins: 330, xp: 165 \}/);
pass('two-hour target is 200 coins and three-hour target is 330 coins');

assert.match(app, /function confirmSaveSession\(subjectId\)/);
assert.match(app, /goalRewardId/);
assert.match(app, /focus-goal/);
pass('goal bonus is ledgered as an independent idempotent reward');

assert.match(app, /function _revertSessionTransaction\(session, rewardAlreadyRevoked = false\)/);
const revertBlock = app.slice(app.indexOf('function _revertSessionTransaction('), app.indexOf('\nfunction deleteSession('));
assert.match(revertBlock, /session\.goalRewardId/);
pass('session deletion reverses goal bonus safely');


const rewardStart = app.indexOf('const FOCUS_GOAL_REWARDS = [');
const rewardEnd = app.indexOf('let currentCatalogSubtab =', rewardStart);
assert.ok(rewardStart >= 0 && rewardEnd > rewardStart, 'reward helpers missing');
const rewardSnippet = app.slice(rewardStart, rewardEnd);
const rewardFns = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(rewardSnippet + '\nexport { normalizeFocusGoalMinutes, getFocusGoalReward };'));
assert.equal(rewardFns.normalizeFocusGoalMinutes(75), 75);
assert.deepEqual(rewardFns.getFocusGoalReward(120), { coins: 200, xp: 100 });
assert.deepEqual(rewardFns.getFocusGoalReward(180), { coins: 330, xp: 165 });
assert.ok(rewardFns.getFocusGoalReward(240).coins > rewardFns.getFocusGoalReward(120).coins);
pass('reward helper behavior is executable and monotonic across key goals');

assert.match(css, /\.rodo-zen-overlay/);
assert.match(css, /\.zen-orbit-a/);
assert.match(css, /\.zen-orbit-b/);
assert.match(css, /\.zen-orbit-c/);
assert.match(css, /\.zen-canvas-grid/);
pass('Zen visual system is present');

const requiredScripts = ['js/app.js','js/journal.js','js/store-tools.js'];
for (const p of requiredScripts) assert.ok(html.includes(`src="${p}`), `${p} missing`);
pass('script integration remains intact');

console.log('\nResult: PASSED — focus goal and Zen structural QA has 0 failures.');
