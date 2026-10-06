# RODO Store V4 — Interaction Fix Release

This patch addresses three reported regressions without changing the product catalog, store economy, or legacy store authority:

1. Product detail actions are now delegated at document level, so `اقتناء`, `إلغاء`, and the `X` close button work even though the detail sheet is mounted under `document.body` rather than inside `#view-store`.
2. Feature/appearance/collection subpages now render the shared Store navigation, including a working `الرئيسية` route, so users can return to the Store home without refreshing the app.
3. Existing purchase authorities remain unchanged: feature purchases still use `executeStoreTransaction`, and appearance purchases still use `buyStoreItem`.

No state-version increment or migration was introduced by this fix.
