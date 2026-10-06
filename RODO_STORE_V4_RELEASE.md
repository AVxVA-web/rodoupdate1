# RODO Store V4 — Curated Store Direction

## Visible catalog
- Features (4): تنظيم اليوميات، إحصاءات متقدمة، إعدادات التركيز، مراحل الأهداف.
- Appearance: 3 themes (Graphite, Paper, Midnight), 6 avatars, 3 titles (بشمهندس، دكتور، رجل الأعمال).
- My Collection: ownership is separate from activation/equipping.

## Product principles
- Small catalog by design; no crates, collections, standalone study tools, schedule/exam/error premium items, vouchers, tickets, or shards in the visible Store V4 catalog.
- Legacy store records remain intact in the underlying state/catalog for backward compatibility and are not surfaced by Store V4.
- New features use a namespaced ownership model under `state.store.v4Features`; disabling a feature does not delete its stored data.
- Existing purchase/activation authorities remain the source of truth for appearance items.
- No state-version bump was introduced; `CURRENT_STATE_VERSION` remains 7.

## Theme signatures
- Graphite: engineering-focused contrast hierarchy.
- Paper: warmer reading surfaces for long-form text and notes.
- Midnight: deeper low-light blue atmosphere.

## Scope note
This release establishes the Store V4 catalog, presentation, ownership/activation plumbing, and the three global theme signatures. The internal product behavior for the four premium feature items remains intentionally isolated for separate, feature-by-feature implementation so Store changes do not risk unrelated RODO behavior.
