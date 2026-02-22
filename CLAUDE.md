# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Standalone HTML item trackers for Souls game randomizers with multiplayer sync via Firebase. No build system, bundler, or dependencies — just plain HTML, CSS, and JS files served statically.

## File Map

| File | Purpose |
|------|---------|
| `index.html` | Landing page with links to both trackers |
| `shared.css` | All styles shared between trackers; uses generic `--accent` / `--accent-dim` / `--accent-bright` / `--accent-rgb` CSS variables defined per-page |
| `er.html` | Elden Ring tracker — markup + `:root` theme variables (gold) |
| `er-data.js` | `DATA` and `CATEGORIES` arrays for the ER tracker |
| `er.js` | Elden Ring tracker logic (Firebase sync, rendering, category/section toggles, filters) |
| `ds3.html` | Dark Souls III tracker — markup + `:root` theme variables (ember) |
| `ds3.js` | DS3 tracker logic (includes `RAW_DATA` template literal + `parseData()`) |
| `eldenring.txt` | Source data for ER items, organized by category; parsed by a throwaway Python script to generate `er-data.js` |

Both trackers share the same Firebase project but use separate database paths (`rooms/` vs `ds3rooms/`) and localStorage keys so progress is fully independent.

## Architecture

### Theming

Each HTML file defines `:root` variables inline — theme-specific colors (`--bg`, `--text`, `--border`, etc.) plus four accent aliases:
- `--accent` / `--accent-dim` / `--accent-bright` — solid accent colors
- `--accent-rgb` — raw RGB values (e.g. `200, 168, 78`) for use in `rgba(var(--accent-rgb), opacity)` within `shared.css`

`shared.css` never defines variables — it only references them. This lets one stylesheet serve both the gold (ER) and ember (DS3) themes.

### Elden Ring (`er.html` + `er-data.js` + `er.js`)
- **Data**: `er-data.js` defines `CATEGORIES` (6 toggle categories) and `DATA` (sections → locations → items). Each item has `desc`, `replaces`, and `cat` (category ID). Base game section has `section: null`; DLC has `section: "Shadow of the Erdtree"`.
- **Categories**: Key Items, Major Bosses, Other Bosses (off by default), Flask Upgrades, Shops, Blessing Pickups. Toggled via pill buttons; state synced to Firebase at `rooms/<code>/categories` and cached in localStorage key `elden-ring-tracker-categories`.
- **Section toggles**: Base Game / DLC toggles filter entire sections. State is local-only (not synced).
- **State**: Item checks synced via Firebase under `rooms/<code>/items`. Room code in localStorage key `elden-ring-tracker-room`.

### Dark Souls III (`ds3.html` + `ds3.js`)
- **Data**: `RAW_DATA` is a template literal in `ds3.js`, parsed at runtime by `parseData()`. Locations are grouped into base game, Ashes of Ariandel, and The Ringed City sections.
- **State**: Synced via Firebase under `ds3rooms/<code>/items`. Room code in localStorage key `ds3-tracker-room`.
- **No category or section toggles** — all items are always visible.

### Shared patterns
- Each item has a `desc` (description/location hint) and optional `replaces` (the item name it corresponds to in-game).
- `render()` rebuilds the entire DOM from DATA and attaches event listeners. `refreshUI()` updates checkboxes/counts without rebuilding. `applyFilters()` handles search, filter, and category visibility.
- On page load with a saved room, `render()` is deferred until the first Firebase snapshot arrives (a loading spinner shows in the meantime). This avoids a flash of unchecked items.
- Fonts: Cinzel (headings), Lora (body), loaded from Google Fonts via `@import` in `shared.css`.

## Regenerating ER Data

If `eldenring.txt` changes, recreate the parser script (Python), run it, then delete it:
1. The parser reads `eldenring.txt`, splits by category headers, parses `In Location: desc. Replaces item` lines
2. Sub-locations (e.g. "Limgrave - Coastal Cave") are merged into their parent location with the sub-name prepended to the description using an em dash
3. Locations are split into base game vs DLC (DLC locations are defined in a hardcoded set) and sorted geographically
4. Output is written to `er-data.js`

Node.js is not available in this environment; use `py` to run Python scripts.

## Firebase

- Config is public in the JS files (this is by design — Firebase web SDK configs are meant to be client-side)
- Security is enforced via Realtime Database Rules in the Firebase Console, not by hiding the config
- Database paths: `rooms/$roomId/items`, `rooms/$roomId/categories`, `ds3rooms/$roomId/items`
- Firebase keys cannot contain `.` `$` `#` `[` `]` `/` — periods in location names (e.g. "Mt. Gelmir") are encoded as `%2E` in item IDs

## Development

Open `index.html` in a browser to reach the landing page, or go directly to `er.html` / `ds3.html`. No server, build step, or install required. Changes are tested by refreshing the page.

## Key Conventions

- Item IDs are `"LocationName::itemIndex"` — changing location names or item order within a location will break saved progress for existing rooms.
- The `replaces` field uses `→` arrow display; items without a `replaces` value are merchant/vendor entries.
- "Other Bosses" category is disabled by default (most common randomizer config).
- ER-specific CSS rules (`.category-toggles`, `.cat-btn`, `.toggle-sep`) live in `shared.css` — they're harmless when unused by DS3.
