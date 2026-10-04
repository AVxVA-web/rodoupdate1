# RODO Focus V2 — Goal-led Stopwatch + Zen Instrument

## Scope
This release changes only the Focus experience:
- optional per-session time goal selected after subject selection;
- completion rewards that scale with the goal, with 2 hours = 200 Coins + 100 XP;
- goal completion is rewarded once, on session save, and remains separate from normal minute rewards;
- goal completion can be reached and then the student may continue the same session;
- finish confirmation remains protective against accidental session endings;
- Zen becomes a true fullscreen stopwatch-only experience with an original visual instrument treatment;
- existing cumulative subject table and recent sessions sections are intentionally left structurally unchanged.

## Safety / compatibility
- state schema advanced from v6 to v7 using an additive migration;
- legacy sessions without a subject/goal continue to be recoverable;
- goal reward uses the existing reward ledger for idempotency;
- deleting a saved session or deleting a subject reverses both the normal focus reward and the goal-completion reward;
- no Journal files were modified by this release.

## Validation
- Node syntax checks: PASS
- Focus goal structural QA: PASS (0 failures)
- Core RODO QA: PASS (0 failures; 3 pre-existing informational warnings)
- Journal V2 QA: PASS
- Static DOM duplicate-id check: PASS

## Known limitation
The available Chromium session previously used for interactive verification is not reliable in this environment, so no claim is made of full browser E2E coverage.
