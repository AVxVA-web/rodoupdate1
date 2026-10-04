# RODO Engineering Guardrails

This file defines the safety contract for future RODO work.

## Product principles

- Engineering, architecture, code quality, correctness, maintainability, and testing should follow disciplined industry-grade software engineering practices inspired by large-scale engineering organizations.
- Visual design and interaction should prioritize Apple-like clarity, restraint, consistency, polish, accessibility, and purposeful motion.

## Non-regression contract

1. Never edit the supplied application behavior blindly.
2. For a behavior-changing patch, first characterize the existing behavior with a test or reproducible check.
3. Make the smallest coherent change that solves the problem.
4. Run syntax/static QA after every change.
5. Run focused behavioral tests for the affected domain.
6. Run the regression suite before packaging.
7. Keep the original zip untouched as the rollback source.

## Current architecture debt to address later — not changed in this safe baseline

- Large centralized `js/app.js` and global function coupling.
- `store-tools.js` extends behavior by wrapping/patching existing globals.
- Persistence is not consistently separated from domain state transitions.
- Date/time logic is distributed across the application.
- Study Tools state is normalized at runtime instead of having one authoritative schema definition.
- Inline HTML event handlers create DOM-to-global-JS coupling.
- CSS has accumulated multiple override generations.
- Production dependencies include CDN assets, including an `@latest` Lucide URL.
- Automated tests and CI infrastructure are not yet established.

## Safe migration order

1. Characterize existing behavior.
2. Add tests without changing behavior.
3. Extract pure utilities and domain rules.
4. Introduce explicit state transitions and persistence boundaries.
5. Remove global/inline coupling one feature at a time.
6. Consolidate design tokens and component styles.
7. Only then consider larger architectural or dependency changes.

## Important

The current safe baseline intentionally does **not** change runtime application files. It adds QA and engineering documentation only. Any future runtime change must be independently verified before the baseline is advanced.
