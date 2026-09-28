# Chroma Homepage improvements

Last updated: 2026-09-27.

This document tracks improvement areas discussed for Chroma Homepage,
including delivered features and remaining ideas. Checked items are implemented;
unchecked items are proposals, not implementation commitments.

The current focus is the homepage, visual editor, and link launcher. F1, MotoGP and Gaming
are supported built-in integrations; generic custom API cards remain deferred.

## Gaming integration — Completed

- [x] Full-game giveaways through GamerPower, without credentials, with platform filtering.
- [x] IsThereAnyDeal offers with regional pricing, discounts, stores and voucher codes.
- [x] Configurable 1–20 entries, polling interval, and existing layout/Bento support.
- [x] UI-managed, encrypted ITAD key outside configuration JSON and exports.
- [x] Game artwork with fallback and per-card multi-store ITAD filtering from a regional catalogue.
- [x] Shared server cache, bounded requests, provider attribution and explicit error states.

## MotoGP integration — Completed

- [x] Next Grand Prix with timezone-aware broadcast start time and countdown.
- [x] Championship standings with 1–30 riders and a favourite-rider view.
- [x] Separate GP/Sprint wins, no credentials, and shared bounded server requests.
- [x] Existing card layouts/Bento, editor Save/Cancel and configuration persistence.

## 1. Distinct layouts — Completed

- [x] Horizontal link cards.
- [x] Icon tiles with the icon above the label.
- [x] Compact lists.
- [x] Side-by-side sections with full, half, and one-third widths.
- [x] Responsive section widths based on available canvas space.
- [x] Configurable grid minimum card width, gap, and maximum columns.
- [x] Presentation selection in the section Inspector.
- [x] Layout examples in a separate Style studio demo tab on the development instance.

- [x] Bento layout with responsive grid-unit box sizes and a dedicated visual studio.
- [x] Dashboard Bento arrangement for entire sections, with exact grid positions,
  drag handles, corner resizing, collision handling, aligned heights and mobile stacking.
- [x] Per-box size presets and numeric width/height; section columns, row height and gap.
- [x] Studio Apply/Cancel isolation, one-step Undo/Redo, and normal homepage Save.
- [ ] Corner-drag resizing and manual box placement in the Bento studio.

Layouts are registered as `grid`, `tiles`, `list`, and `bento`. Section width and layout
settings are stored in the configuration document and participate in editor history.

## 2. Visual customization — Completed

- [x] Explicit accent colors stored in JSON instead of relying on ID-derived colors.
- [x] Section appearance defaults inherited by cards.
- [x] Homepage default accent with tab, section, and card overrides.
- [x] Dynamic accent inheritance with reset-to-parent and matching Inspector previews.
- [x] Automatic accent extraction from images/colored icons, with explicit suggestions for monochrome icons.
- [x] Original Chroma vector logo and favicon.
- [x] Unified compact header with Google search, clock and profiles; editing lives in the profile menu.
- [x] Per-card overrides and reset-to-inherit controls.
- [x] Glass, Flat, and Minimal surface presets.
- [x] Compact, Comfortable, and Spacious density settings.
- [x] Configurable icon size.
- [x] Visible or hidden descriptions.
- [x] Immediate draft preview with Save, Cancel, Undo, and Redo.

The visual language includes dark surfaces, restrained accent lighting, rounded
icon tiles, and readable labels. Appearance is independent of card content.

## 3. Smarter launcher — Completed

- [x] Open by typing outside editable fields in View Mode.
- [x] Open with Ctrl/Cmd + K.
- [x] Search labels, descriptions, URLs, tabs, and sections.
- [x] Typo-tolerant matching for names and aliases.
- [x] Editable aliases, such as `ha` for Home Assistant.
- [x] Editable tags and tag-only queries such as `#automation`.
- [x] Arrow-key selection, Enter to open, and Escape to close.
- [x] Respect each action's new-tab setting.
- [x] Web search shortcuts such as `g docker`, `gh zustand`, and `yt home assistant`.
- [x] Editable shortcut keywords, labels, URL templates, and opening behavior.
- [x] Encode query text before substituting it into URL templates.

Aliases and tags are edited in the card Inspector. Search shortcuts are edited
under Launcher settings and saved in `homepage.searchShortcuts`. Shortcut actions
open ordinary URLs and require no service API integration.

## 4. Quick service creation — Partially completed

- [x] Discover a pasted URL's title, description, and favicon automatically.
- [x] Autofill untouched new cards and preview suggestions before replacing existing details.
- [x] Store discovered icons as local assets instead of external image URLs.
- [x] Optional local-network discovery for self-hosted services.
- [ ] Searchable service presets with a suggested name, icon, and accent color.
- [ ] Create a service link by selecting a preset and entering its local URL.
- [ ] Import browser bookmarks from Chrome/Firefox HTML exports.
- [ ] Paste multiple URLs to create several links together.
- [x] Preview HistoryOut links and choose their destination before adding them.

Presets should describe link metadata only; live service integrations are deferred.

## 5. Bulk editor operations — Proposed

- [ ] Multi-selection using Shift/Ctrl/Cmd.
- [ ] Move multiple cards together.
- [ ] Delete multiple selected cards together.
- [ ] Copy and apply appearance settings across cards.
- [ ] Duplicate an entire section with new entity IDs.
- [ ] Duplicate an entire tab with new entity IDs.
- [ ] Contextual “Move to…” action for moving cards without dragging.
- [x] Whole-section moves between tabs, including empty destinations and an Inspector selector.
- [x] Reliable cross-tab drag with source snapshots, highlighted targets and cancellation cleanup.

Existing foundation: single-card copy, cut, paste, duplicate, cross-section and
cross-tab dragging, plus snapshot-based undo/redo.

## 6. Favorites and collapsible sections — Proposed

- [ ] A favorites strip accessible across tabs.
- [ ] Collapsible sections.
- [ ] Optional recent items in the launcher, stored only in the browser.

Keep manually arranged card positions stable; recent usage should not automatically
reorder the dashboard.

## 7. Homepage settings — Partially completed

- [x] Google search bar.
- [x] Live local clock and date.
- [x] Configurable search providers for launcher shortcuts.
- [x] Dedicated Homepage settings for existing homepage name, avatar, and default accent.
- [ ] Uploaded background image.
- [ ] Background brightness and blur controls.
- [ ] Configurable maximum page width.
- [ ] Configurable provider for the main search bar.
- [ ] Configurable clock format and time zone.
- [ ] Show/hide controls for search, date, and clock.
- [x] A visual homepage-settings panel with immediate draft preview and Save/Cancel.

The main search bar still uses Google, and the clock currently follows the browser's
locale and local time zone. Launcher shortcut settings do not change that search bar.

## 8. Backup and recovery UI — Partially completed

- [x] Validated, atomic JSON persistence.
- [x] Automatic backup of the previous configuration before saving.
- [x] Configuration export/import through the editor, with legacy JSON import support.
- [ ] Browse existing backups from the UI.
- [ ] Preview a backup before restoring it into the editor draft.
- [ ] Restore a backup and save it as the current configuration.
- [x] Export/import a portable ZIP containing configuration and uploaded assets.
- [ ] Recover an unsaved draft after a refresh or browser restart.
- [ ] Warn before leaving a page with unsaved changes.

Existing backups live under the configured data directory's `backups/` folder.
ZIP exports include the current draft and its referenced images, but never integration
credentials. Old JSON-only exports cannot restore images absent from the destination.

## Other reference ideas — Proposed

- [ ] Direct links to individual tabs, with URL and browser Back/Forward support.

## 9. Independent homepage profiles — Completed

- [x] Header selector for independent homepage JSON documents on the same server.
- [x] Compact avatar-only selector with names and avatars in its dropdown.
- [x] New profile creation as the last dropdown action.
- [x] Iconify or uploaded-image profile avatars, editable with draft preview and undo/redo.
- [x] Preserve the original `config.json` without rewriting or moving it.
- [x] Create a named empty homepage or copy the current saved homepage.
- [x] Rename a profile through its homepage title in the Inspector.
- [x] Remember the selected profile in the browser.
- [x] Scope saves, imports, exports, and backups to the active profile.
- [x] Require Save/Cancel before switching and clear profile-specific editor state.
- [x] Share local assets so copied profiles keep their icons.

Profiles are configurations, not authenticated user accounts.

## 10. Build from browsing history — Completed (HistoryOut JSON)

- [x] Read the supplied HistoryOut JSON array format.
- [x] Analyze it locally in a browser worker and rank frequently visited sites.
- [x] Group by origin, preserving separate subdomains, schemes and service ports.
- [x] Preview, filter, rename, exclude and select suggestions before creating cards.
- [x] Import into the selected profile without replacing existing content or other profiles.
- [x] Choose a new/existing tab and grid, tile, or list layout.
- [x] Skip sites already linked in the current homepage.
- [x] Reuse optional metadata discovery for approved site roots only.
- [x] Keep raw history, private paths and queries out of server requests and saved JSON.
- [x] Apply one undoable draft change and persist only with Save.

No browser extension or continuous history synchronization is implemented.

## 11. Remote JSON cards — Proposed

- [ ] Add a generic Remote data card that periodically reads a configured HTTP(S) endpoint.
- [ ] Define and publish a versioned `chroma-card/v1` JSON protocol and validation schema.
- [ ] Support bounded presentation primitives such as status, metrics, progress, lists,
  short text, and safe HTTP(S) actions; never accept remote HTML, CSS, or JavaScript.
- [ ] Fetch through the Chroma server, with response-size and duration limits, redirect
  validation, SSRF/DNS-rebinding protections, request deduplication, and shared caching.
- [ ] Support `ETag`, `304`, `Cache-Control`/protocol TTL hints, retry backoff, and display
  of the last valid response as stale when an endpoint temporarily fails.
- [ ] Provide optional Bearer or `X-API-Key` authentication configured in the UI and
  stored only in the encrypted server-side secret repository.
- [ ] Keep endpoint credentials out of card JSON, exports, backups, browser responses,
  logs, and Git; configuration stores only an opaque credential reference/status.
- [ ] Make private-network access explicit per card while permanently blocking metadata,
  link-local, multicast, unspecified, and reserved destinations.
- [ ] Add a Test endpoint action with protocol-validation feedback, preview, last-success
  timestamp, and cache/error state before saving the card.
- [ ] Consider JSON Pointer field mapping for arbitrary non-Chroma JSON as a later,
  separate feature; do not allow executable expressions or JavaScript mappings.

The initial protocol should keep card identity, appearance, placement, and sizing under
local Chroma control. Remote services provide validated data and semantic tones only.
Suggested v1 limits are a 64 KB response, 5-second timeout, 30-second minimum refresh,
six blocks, twelve metrics, twenty list rows, and two safe link actions.

## References

- [Homepage layout and navigation settings](https://gethomepage.dev/configs/settings/)
- [Homepage search providers](https://gethomepage.dev/widgets/info/search/)
- [Heimdall service presets and application dashboard](https://heimdall.site/)

These references informed the suggestions; the checklist describes Chroma Homepage's
own implementation status.
