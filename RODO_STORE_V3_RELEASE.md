# RODO Store V3 — Release Notes

This release improves the Store without changing the persisted state schema or the existing reward/purchase authorities.

## What changed

- **Store Home:** the existing Study Atelier storefront now presents products more clearly, with a quieter product-led hierarchy and the existing ownership/goal/catalog routes preserved.
- **Product Detail:** store purchase buttons open a reusable detail sheet first. The sheet shows the item purpose, ownership state, price, current balance, and the exact balance after purchase.
- **Purchase Confirmation:** purchases require a deliberate confirmation step. The existing `buyStoreItem()` and `buyStudyStoreProduct()` functions remain the mutation authorities; the new layer does not duplicate their business rules.
- **Owned / Insufficient Balance:** owned permanent items are clearly marked, while insufficient balance is presented as a disabled purchase state with the exact shortfall.
- **Chest Reveal:** the existing chest transaction flow is unchanged. Only the reveal presentation was enhanced with a short, restrained opening sequence and a dedicated reward reveal.

## Safety / architecture

- `CURRENT_STATE_VERSION` remains **7**. No migration was introduced.
- `js/store-experience.js` is an additive presentation layer; it does not write `localStorage` directly.
- Existing purchase functions remain the only mutation authorities for Store purchases.
- Existing Study Store catalog remains the source of truth and is exposed read-only to the presentation layer.
- Existing Store categories, inventory, vouchers, shards, tickets, and legacy ownership rules remain in place.
- A pre-change SHA-256 snapshot is kept in `tools/pre-store-v3-sha256.txt`.

## Validation

- `node --check` passes for `app.js`, `store-tools.js`, `store-experience.js`, and `journal.js`.
- Core non-regression QA passes with zero failures.
- Store V3 QA passes with zero failures.
- Static DOM ID audit reports no duplicates.
- Script order is verified: `app.js` → `store-tools.js` → `store-experience.js`.
- The package was validated after build and before release.

A full automated browser/E2E pass is not claimed when the local browser harness is unavailable or unstable; this release therefore relies on deterministic Node/static contracts plus the preserved pre-change snapshot rather than inventing browser success.
