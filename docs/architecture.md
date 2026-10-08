# Architecture

## Data model

Each homepage profile is one versioned JSON document: `Homepage → Tabs → Sections → Cards`. Every tab, section, and card has a stable ID; newly created entities use UUIDs. `src/shared/config.ts` owns the TypeScript types and Zod schemas used by both browser and server. The document starts at `schemaVersion: 1`.

Browser-side IDs use `src/shared/id.ts`: native `crypto.randomUUID` when available,
otherwise UUID v4 generated with `crypto.getRandomValues`. This keeps editing and
history imports working on HTTP LAN origins, where `randomUUID` is unavailable.

`src/shared/migrations.ts` is the migration boundary. Loading always passes through `migrateConfig`, which applies sequential version migrations and then validates the current schema. Version 1 needs no migration yet, but the version-indexed registry and future-version rejection behavior are already in place.

## Frontend architecture

The frontend treats configuration as data, not component-local setup. `App` loads the document and switches between the persisted view and an editor draft. `Dashboard` owns the high-level drag context, tab navigation, animated tab canvas, and section composition. Small renderers handle visual icons, cards, layouts, the editor toolbar, and the property Inspector.

The compact header combines the product mark, homepage title, Google search, clock,
and profile menu on one desktop/tablet row. Editing is accessed through the profile
menu's Homepage settings item. Mobile can wrap the search.
`public/chroma.svg` is the original vector product mark used in the header and favicon.

Zustand stores the persisted document, draft, active tab, selection, clipboard, history, and future snapshots. Pure manipulation functions live in `src/shared/operations.ts`, keeping mutation rules independently testable.

## Backend and persistence

Fastify serves the API and the production Vite bundle. `ConfigRepository` initializes `/data/config.json` from `config/default-config.json`, validates on every read/write, and provides atomic saves:

1. validate the complete input document;
2. write formatted JSON to a unique temporary file beside the destination document;
3. copy the previous file to the profile's backup directory;
4. rename the temporary file to the destination atomically, cleaning temporary files on failure.

Uploaded images are stored in `/data/assets` under UUID filenames and referenced by ID in JSON. No binary or Base64 data enters the configuration document.

### Homepage profiles

`ProfileRepository` lists and creates independent documents. The reserved `default`
profile maps to the existing `/data/config.json`; new UUID profiles map to
`/data/profiles/<uuid>.json`. No existing data is rewritten on adoption. Names are
derived from `homepage.title`, avoiding a second manifest that could diverge from
the documents. Copies preserve entity IDs within their independent document scopes
and share asset references. Empty profiles start with a new UUID tab and section.

Optional `homepage.icon` uses the existing Iconify/asset-reference union for the
profile avatar. Profile listings include this field, and creation may specify an
avatar or inherit the source profile's avatar. No schema-version bump or rewrite
is required for older documents. The circular `ProfileSelector` trigger shows only
the active avatar; its keyboard-accessible menu lists profiles and ends with the
creation action. `ProfileIconEditor` reuses the icon picker and asset upload path
both during creation and in the Inspector. Draft avatars preview in the header;
the saved profile summary is refreshed after Save, and Cancel restores the old avatar.

The `/api/profiles/:id/config` routes use the same validation, migrations and atomic
writer as the original API. Strict ID validation prevents arbitrary filesystem paths;
unknown profiles return 404 rather than being silently created by PUT. Original backups
stay at `/data/backups`, while new profile backups use `/data/backups/<uuid>/` and unique
filenames. `/api/config` remains an alias for the original profile, never a server-global
active profile. Assets and metadata discovery are shared across profiles.

`useProfiles` owns the profile list, browser-local selection, and serialized loading or
creation requests. A failed switch leaves the loaded document and selection intact.
`App` captures an explicit profile ID for each save. Switching is disabled during editing
and pending requests; saves temporarily disable editor interactions. Loading a new profile
resets the editor store and remounts the dashboard/launcher to clear transient drag/search
state. Async imports from an unmounted editor are ignored. Dashboard imports replace only the
active draft, so other profiles cannot be overwritten through the import workflow.

Profiles do not provide authentication or tenant isolation; all users of the server can
access all profile endpoints. The HistoryOut importer appends to the selected profile's
draft without modifying other profiles or replacing existing content.

### Remote JSON cards

`shared/remote-card.ts` defines the strict, bounded `chroma-card/v1` data protocol;
`RemoteCardView` renders only text, semantic status/tones, metrics, progress, lists,
and safe navigation links. Identity, icon, appearance and sizing remain local.
`RemoteCardEditor` supports settings, encrypted credential management, and a validated
test preview. Source-keyed state, request abortion and current-draft checks prevent
late requests from displaying another endpoint's data or replacing newer settings.

`RemoteCardService` uses the existing DNS-pinned `fetchRemotePage` transport, now
extended with internal headers, bounded redirects, response metadata and 304 handling.
All DNS addresses and redirect targets pass existing SSRF controls. LAN access is
explicit; special/metadata addresses are never allowed. GET responses are limited to
64 KiB / 5 seconds. Authentication disables redirects entirely. Tokens are encrypted
with their exact normalized endpoint and auth mode and referenced by an opaque UUID.
No secret read endpoint exists; raw provider errors/validation values are not exposed.
Exact token echoes are rejected. The unauthenticated Chroma API is still trusted-LAN only.

Cache keys include endpoint, LAN permission, mode and credential reference; up to
100 memory-only entries are kept with three concurrent fetches and single-flight
deduplication. Bounded TTL hints, ETag/304, no-cache/no-store, exponential retry backoff
and stale last-valid data are supported. Deleting credentials clears server cache.
`demo:house` is local mock data; `/api/examples/house` exposes the same fake protocol
through real HTTP. No saved profiles are modified by adding these examples.
See [custom-card-protocol.md](custom-card-protocol.md) for schema examples and placement.

### Desktop tab viewport fit

`Tab.fitViewport` is an optional boolean in the existing v1 configuration; old
documents keep their current scrolling behaviour. The tab Inspector toggles it as
one undoable draft edit. Outside Edit Mode, a desktop media query makes the app a
viewport-height flex column and removes page-level scrolling. The canvas fills
the space remaining below the header and tab navigation at its normal width. A
layout measurement pass reads the natural CSS grid tracks for sections and cards,
then distributes the available height across those tracks according to content
demand. The measurement repeats on viewport changes and DOM updates from API cards.
Short cards use compact styles and remote lists/metrics use more columns. No canvas
transform or uniform scale is applied. Saved Bento coordinates and dimensions are
unchanged. Below 1024 px viewport width, or in Edit Mode, the original responsive
layout and scrolling remain intact.

### Portable dashboard bundles

`server/dashboard-bundle.ts` exports a validated draft as a version-1
`chroma-dashboard` ZIP using fflate. The manifest records SHA-256 checksums for
`config.json` and each image. Only asset references from the homepage avatar and
cards across all tabs are collected; no secret store, arbitrary data-directory
files, unrelated assets, or other profiles are included. Export refuses missing,
ambiguous, oversized, or symlinked assets instead of silently omitting images.

Import accepts only the expected manifest, configuration, and UUID image paths.
Compressed input, individual entries, total expanded bytes, and entry counts are
bounded; streaming decompression checks actual output sizes, not just ZIP headers.
The entire document, reference set, and checksums are validated before any writes.
Images are staged and exclusively linked under fresh UUIDs, with rollback on write
failure; references are then remapped. Checksums detect corruption, not authenticity.
Legacy JSON imports verify that their image references already exist locally.

Transfer routes are serialized and return no-store responses. The client exports
the current draft; imports replace only a still-current draft, support history,
and require Save for persistence. Unmounted, cancelled, or stale import responses
cannot replace a newer draft. Imported images may remain after Cancel/Undo, matching
existing upload semantics. Integration keys must be configured separately.

### HistoryOut import

`shared/history-import.ts` validates records and ranks sanitized origin-level summaries.
Only HTTP(S) URLs without credentials are eligible. Page keys stay inside the analysis
worker; duplicate page counts use a maximum before totals are grouped by origin. Query
tracking variants and fragments are normalized for scoring. Only clean root titles or
hostname fallbacks appear in the suggestions. Locale-dependent export dates are not
parsed or persisted. Limits bound input size, record count, selection, and DOM rows.

`history-import.worker.ts` parses and analyzes the file off the UI thread and returns
only site roots, labels, scores and counts. No raw export is posted to any server.
`HistoryImporter` is a native modal review dialog with selection, duplicate exclusion,
editable names, pagination, destination and layout controls. Optional metadata discovery
uses two concurrent calls to the existing preview endpoint with approved roots only.
Results are staged for review; failures retain safe fallbacks and user-edited labels win.

`appendHistorySites` creates UUID cards/sections and optionally a tab without mutating
its input. The full result is schema-validated and applied as one editor snapshot.
The active profile's identity, existing content, inherited colors and other profiles
are preserved. Global editor shortcuts are suspended while the dialog is open. A session
identity check, worker termination, generation guards, and abort signals prevent late
results from changing another draft. Persistence uses the normal profile-scoped Save;
the import adds no backend route, database or persistent history store.

### Link metadata discovery

`POST /api/link-preview` retrieves an HTML page through a bounded HTTP(S) client.
`remote-page.ts` validates every redirect, resolves and pins DNS addresses, applies
an explicit opt-in for private networks, and excludes special/metadata addresses.
Requests have a total deadline, response-size limits, and a small concurrency cap.
`link-preview.ts` parses inert HTML, resolves favicon links against the final page
URL and optional base URL, and imports supported raster/ICO bytes into the asset store.
No page JavaScript, credentials, cookies, or external favicon service are used.

`LinkUrlEditor` debounces URL edits, cancels obsolete requests, and verifies the
current draft card/URL before applying a response. Untouched new-card placeholders
can be filled automatically; existing details require explicit application. Detected
metadata enters snapshot history as one edit and never saves the configuration by itself.

## Card Registry

`CardTypeRegistry` maps each card discriminator to a label, renderer, and Inspector editor. The shared Zod `cardSchema` is a discriminated union. Link cards and the Formula 1 next-race, championship-leaders, and favourite-driver views use the same layout, drag, clipboard, and appearance machinery.

### Live data and secrets

`MotoGpService` uses fixed public endpoints on `api.motogp.pulselive.com`, without
credentials. Results seasons/categories resolve the current premier class and its
rider standings; the broadcast events feed supplies race times with explicit
offsets (results-session dates are not used for countdowns). Only GP events and
MotoGP `RAC` sessions are eligible, excluding tests, Sprint and cancelled/completed
races. Missing session times retain weekend-only dates. A published next-season
calendar is checked when the current season has no upcoming GP. Stable rider IDs
preserve favourites; GP and Sprint wins remain separate.

Upstream requests coalesce through a bounded 30-minute cache, with one-minute
error backoff, an 8-second per-request timeout, a streamed 2 MiB limit and redirects
disabled. Provider errors are sanitized. No secrets or API-key UI are introduced.

The Formula 1 card calls Chroma's `/api/widgets/formula-one/next-race` route, never a
provider directly. When an API-Sports key is configured, the server first tries its fixed
Formula 1 endpoint and adds the credential in an HTTP header. API-Sports free plans do not
expose the current season or `next` query, so unavailable/rejected requests fall back to
Jolpica's public current/next schedule. Both paths normalize into one response, bound time
and response size, and share a 30-minute cache. The browser localizes the returned ISO
timestamp and updates the countdown without spending another provider request.
Current driver standings come from Jolpica's structured standings endpoint and share the
same bounded-response and 30-minute caching policy.

The Gaming card uses `/api/widgets/gaming` with validated view/platform/country
filters. `GamingService` only contacts fixed GamerPower and IsThereAnyDeal hosts;
ITAD credentials travel in the `ITAD-API-Key` header and redirects are disabled.
The server normalizes public giveaways or regional deals, validates HTTPS offer
links, and excludes expired ITAD offers and invalid rows. Fetches have an 8-second
timeout and a streamed 1 MiB limit. A bounded 30-minute cache coalesces identical
requests, limits concurrent upstream requests to four, and backs off errors for one
minute. Key changes invalidate the cache; upstream errors never reach the browser
verbatim. The client displays 1–20 entries, provider attribution and refresh time,
and preserves previous data with a visible warning if a later refresh fails.
Gaming settings contain no secret; `/api/integrations/isthereanydeal` stores a
separate entry in the shared encrypted credential repository.
Gaming cards persist a normalized `shops` ID array (empty means all), forwarded to
ITAD's deals query and included in the cache key. The public `/service/shops/v1`
catalogue is exposed through a country-validated, cached Chroma endpoint. Artwork
is optional: ITAD banners/boxart and GamerPower thumbnails use an HTTPS image-host
allowlist, with invalid assets dropped independently of the game. Browser images
are lazy-loaded with no referrer and an error fallback; no credentials accompany them.

Integration credentials are deliberately separate from homepage documents. The UI can
set, replace, delete, and inspect only a `configured` flag; no API returns a stored secret.
`SecretRepository` encrypts its JSON payload using AES-256-GCM and atomically writes it
with owner-only permissions. By default it creates an owner-only `/data/secrets.key`;
deployments can instead supply `CHROMA_SECRET_KEY`, keeping the encryption key outside
the data volume. Configuration exports, profile copies, backups, logs, and card objects
therefore contain no provider key.

## Layout Registry

Tabs may opt into `sectionLayout: { type: "bento", columns, rowHeight, gap }`.
Each section then stores a separate `dashboardBox` (column, row, width, height);
this is independent of the section's internal card layout and card box sizes.
The shared section-placement function reserves explicit positions and packs new or
displaced sections into free cells. The dashboard and section studio share this
placement logic. Fixed rows keep section boundaries aligned; overflow stays in the
section's scrollable card area. At narrow canvas widths the view stacks sections
in visual reading order without mutating the saved document.

`LayoutTypeRegistry` maps a layout discriminator to its responsive renderer and Inspector editor.
`grid` renders horizontal cards, `tiles` renders centered icon tiles, and `list` renders
compact rows. Grid and tile layouts share sizing options. The outer six-column section
grid implements full, half, and third widths, with container breakpoints based on actual
canvas space. Card and section sorting use a rectangular strategy.

`bento` adds a responsive CSS grid with configured `columns` and `rowHeight` plus
the common `minCardWidth` and `gap`. Optional `card.bento = { width, height }` stores
box spans independently of placement; older cards default to 1×1. Shared schema
validation bounds all dimensions. These additions remain schema-v1 compatible.
`BentoGrid` observes its own width to reduce column count, and clamps rendered spans
without mutating the document. Row auto-placement preserves document/focus order;
no dense packing or absolute coordinates are used. Existing drag/drop controls
ordering; moves, clipboard operations and layout changes preserve saved sizes.

`BentoStudio` is a native modal with a local section snapshot, visual box selection,
size presets and numeric controls. Apply validates and patches layout/sizes in one
draft snapshot; Escape/Cancel discard local changes. Editor shortcuts are suspended
while it is open. The standard Save API persists the result. `changeLayout` provides
conversion defaults, including when the HistoryOut helper creates a section.

Optional `appearance` objects live on sections and cards. `resolveAppearance` combines
baseline values, homepage/tab accents, section defaults, and card overrides; omitted properties inherit. CSS
variables and data attributes apply the resolved values across all layouts. These additive
schema-v1 fields remain compatible with old documents.

`homepage.appearance.accent` and `tab.appearance.accent` are optional validated hex
colors. Pure shared helpers resolve `app default → homepage → tab → section → card`,
and both renderers and Inspector controls use these same helpers. Inherit deletes the
local accent instead of copying a parent value, so later parent edits and card moves
remain dynamic. Existing section/card overrides are preserved. Drag previews capture
the source's resolved appearance; the destination re-resolves it after dropping.
The app root exposes the homepage color through `--home-accent` for search/launcher
highlights, while each card receives its effective `--card-accent`. Active tab icons
and indicators use the tab's resolved color.

`HomepageSettings` provides explicit name, avatar, default accent, and launcher controls
in the Inspector. The profile menu offers direct access, and a back-to-settings button
is available from each selected entity. All changes use the existing draft/history and
profile-scoped save path, with no new configuration files or migration requirement.

The launcher searches aliases and tags as well as existing card fields, with a bounded
Damerau-Levenshtein comparison for spelling errors. `homepage.searchShortcuts` stores
editable keyword/HTTP(S)-URL templates. Existing documents use shared Google/GitHub/YouTube
defaults; an explicit empty array disables shortcuts. Query values are encoded before
template substitution. No third-party search or service API is called.

## Editor state

Entering Edit mode deep-clones persisted configuration into a draft. Each meaningful edit stores the previous draft snapshot in a bounded history and clears the redo stack. Save validates and sends the draft to Fastify, then promotes the server response to persisted state. Cancel drops the draft. The clipboard is independent from the active tab so cards can be copied or cut in one tab and pasted in another.

## Drag and drop design

One dnd-kit `DndContext` wraps both tab headers and the dashboard canvas. Drag metadata identifies tabs, sections, and cards plus their parent IDs. Sections are explicit drop targets, while cards are sortable targets. A card drop invokes the same pure `moveCard` operation for same-section ordering, cross-section movement, and cross-tab movement.

During card or section drag, hovering a non-active tab starts a 500 ms timer. The
source identity is captured at drag start: dnd-kit can clear its live metadata when
the old tab unmounts. The global context and overlay remain mounted. Pointer
collision detection prioritizes tab headers, then cards, sections and the tab
canvas, filtering out incompatible target types. Cancellation clears pending timers.

All mutations happen on drop, as one history snapshot. Whole-section moves retain
all IDs, contents and overrides. Empty tab canvases accept sections; dropping a card
on an empty tab creates one section as part of the same undoable operation. Dropping
a card directly on a populated tab header appends it to the first section. The
Inspector also provides a section destination selector.

## Automatic accent

`Accent from icon` is available for cards, tabs and homepages with a selected icon.
The browser renders the local asset or Iconify SVG into a small canvas and finds a
saturated dominant color, ignoring transparent/neutral pixels. Dark colors are lifted
for readability. Monochrome icons receive a deterministic suggested palette color,
explicitly labeled as a suggestion. The resulting hex color is an ordinary draft
override, with Undo/Redo, Inherit and Save; it is never recalculated during rendering.
No image data is added to the configuration and no new backend service is involved.

## Adding a card type

1. Add its Zod schema and TypeScript type to the discriminated union in `src/shared/config.ts`.
2. Create its view renderer and Inspector editor.
3. Add one definition to `CardTypeRegistry`.
4. Add a creation default or factory for the editor action that should create it.
5. Add schema, renderer, operation, and end-to-end coverage appropriate to the new behavior.

The dashboard, drag engine, clipboard, history, persistence, import/export, and selection model operate on the common card contract and should not need type-specific changes.
