# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single-file Elden Ring item tracker — a standalone HTML page (`elden_ring_tracker.html`) with no build system, bundler, or dependencies. All CSS, JS, and data are inline.

## Architecture

- **Data**: The `DATA` array (line ~389) holds all trackable items, organized as sections → locations → items. The base game section has `section: null`; the DLC section has `section: "Shadow of the Erdtree"`. Each item has a `desc` (description/location hint) and optional `replaces` (the item name it corresponds to in-game).
- **State**: Checked items are persisted to `localStorage` under key `elden-ring-tracker-v1` as a JSON object mapping item IDs (`"LocationName::index"`) to `true`.
- **Rendering**: `render()` rebuilds the entire DOM from `DATA` and attaches event listeners. `applyFilters()` handles search and filter visibility without re-rendering.
- **Styling**: Dark theme using CSS custom properties (`:root` vars). Fonts: Cinzel (headings), Crimson Text (body), loaded from Google Fonts.

## Development

Open `elden_ring_tracker.html` directly in a browser. No server, build step, or install required. Changes are tested by refreshing the page.

## Key Conventions

- Item IDs are `"LocationName::itemIndex"` — changing location names or item order within a location will break saved progress for users.
- The `replaces` field uses `→` arrow display; items without a `replaces` value are merchant/vendor entries.
