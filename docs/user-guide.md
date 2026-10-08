# User guide

Chroma Homepage is a self-hosted browser homepage with a visual, document-based editor. It renders a portable JSON document organized as tabs, sections, and cards; no YAML or hand-edited configuration is required.

Phase 1 includes:

- a polished dark, responsive homepage with animated tab and layout transitions;
- visual editing with a draft, Save/Cancel, undo/redo, and keyboard shortcuts;
- independent homepage profiles with a top-bar selector, blank creation, and copying;
- tab, section, and link-card creation, editing, deletion, and reordering;
- an API-backed Formula 1 next-race card with encrypted server-side credentials;
- cross-section and cross-tab card drag and drop, including delayed tab activation;
- an in-app card clipboard with copy, cut, paste, duplicate, and delete;
- Iconify search and custom image uploads;
- horizontal cards, icon tiles, compact lists, bento boxes, and responsive full/half/third-width sections;
- inherited section appearance with per-card color, surface, density, icon size, and description overrides;
- a keyboard launcher with typo-tolerant search, aliases, tags, and editable web search shortcuts;
- portable ZIP export/import with images, legacy JSON import, and atomic server-side persistence;
- local HistoryOut JSON analysis with ranked site previews and profile-scoped import;
- a Fastify API, unit tests, a Playwright workflow, and a production Docker image.

## Run with Docker

```bash
docker compose up -d --build
```

Open `http://localhost:3000`. Override the host port with `PORT=8080 docker compose up -d`.

The Compose file uses the `chroma-data` named volume mounted at `/data`. To use a bind mount instead, replace the volume entry with `./data:/data`. The directory contains:

```text
/data/config.json
/data/profiles/<profile-uuid>.json
/data/assets/
/data/secrets.json
/data/secrets.key
/data/backups/
/data/backups/<profile-uuid>/
```

`config.json` is written with two-space indentation and a trailing newline. Every save first validates the full document, writes a temporary file, copies the previous configuration into `backups`, and atomically renames the temporary file.

`secrets.json` is a separate AES-256-GCM encrypted credential store. Its API never
returns plaintext values. The owner-only `secrets.key` is generated automatically; set
`CHROMA_SECRET_KEY` to a 32-byte hex or Base64 key if you want the encryption key kept
outside the data volume. Back up that external key separately or the encrypted credentials
cannot be recovered. Neither configuration export nor profile copying includes secrets.

## Formula 1 next-race card

Enter Edit Mode, select a destination section, and click **F1** in the bottom toolbar.
The card works immediately through Jolpica's public current schedule. Optionally paste an
API-Sports Formula 1 key into its Inspector; paid API-Sports access is preferred when it
supports the next-race query, while free/restricted plans fall back automatically. Saving
the key is immediate and independent of the homepage draft; press the main **Save** button
to keep the card itself. The server credential is shared by Formula 1 cards in all profiles.

The card displays the next Grand Prix, circuit and location, status, start time in the
browser's timezone, and a live countdown. Browser refresh intervals are configurable from
30 minutes to 6 hours. The server maintains a shared 30-minute cache, so multiple
cards and viewers do not spend a provider request each. The card identifies the provider
used. Provider access, quotas, availability, and terms remain controlled by each provider.

Replacing or removing the key is available in the same Inspector panel. Removing it returns
all Formula 1 cards to the public Jolpica schedule. Credentials never enter card JSON,
configuration backups, exports, URLs, client storage, or provider error messages.

## MotoGP card

In Edit Mode, select a section and click **MotoGP** in the toolbar. No API key is
required. The card uses public MotoGP calendar and results feeds and supports:

- **Next Grand Prix**: event, circuit, date/time in your timezone and countdown.
  This is the main MotoGP race, not the Sprint or Moto2/Moto3. If no confirmed start
  time is available, it shows the circuit-local weekend dates and **Time TBC**.
- **Championship leaders**: choose 1–30 riders (three by default), with team and
  total championship points, including Sprint points.
- **Favourite rider**: select a rider to show their championship position, points,
  team/manufacturer and separate GP/Sprint wins when provided.

Refresh intervals are configurable. Requests share a 30-minute server cache; this
is not a live-timing service. The card handles unpublished schedules, empty
standings and riders absent from a new season explicitly, and keeps previous data
with a warning if a later refresh fails. Choose **Save** to persist the card and its
settings. Existing layouts, Bento sizing, duplication and undo/redo work as usual.

Data is attributed to [MotoGP](https://www.motogp.com/en/). These public website
feeds are not a guaranteed developer API and may change or become unavailable.

## Gaming card

Enter Edit Mode, select a section, and click **Gaming**. Choose between:

- **Free games · GamerPower**: full-game giveaways, newest first, with a platform
  filter (PC, Steam, Epic Games Store, GOG and others). No API key required.
- **Deals · IsThereAnyDeal**: offers sorted by highest discount, showing store,
  regional price/currency, original price, discount and any required voucher code.
  Offers can include DLC and bundles, labelled when the provider supplies a type.
  Select your store country (Italy by default). Obtain your own key from
  [IsThereAnyDeal applications](https://isthereanydeal.com/apps/) and save it in the Inspector.

Set **Games shown** from 1 to 20 and a refresh interval. The server shares a
30-minute cache across cards with the same filters. The default Bento size is 2×2;
resize it in Bento studio as needed. Click a game in View Mode to open its offer.
Game artwork is shown for both providers when available; missing or broken images
fall back to an icon. Artwork loads directly from the provider's image host without
a referrer or API key.

For ITAD offers, **Stores** lists active shops in the selected country. Search the
list and tick multiple shops (for example Steam and GOG). **All stores**, or no
individual selection, removes the filter. The selection is saved per card and is
sent to ITAD before fetching offers, not just used to hide items already loaded.
Changing country preserves the selection; shops no longer available there remain
listed as unavailable so you can remove them explicitly. Older cards default to all
stores. Different store combinations have independent caches.

Redemption requirements, regional availability and final checkout prices are set
by the provider/store; always check before claiming or purchasing.

The ITAD key uses the same encrypted server-only store as F1, under a separate
credential. It is shared across profiles but never included in dashboard JSON,
exports or profile backups. **Save key**, **Replace key** and removal take effect
immediately, independently of dashboard Save/Cancel. “Key saved” confirms storage,
not provider acceptance: authentication errors appear in the card. Free games
continue working without an ITAD key. Keep this unauthenticated server on a trusted
network; encryption at rest does not replace access control.

Data and attribution: [GamerPower API](https://www.gamerpower.com/api-read) and
[IsThereAnyDeal API](https://docs.isthereanydeal.com/).

## Local development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Vite runs on `http://localhost:5173` and proxies API requests to Fastify on port `3001`. Development data is stored in `.data` unless `DATA_DIR` is set.

Useful commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Homepage profiles

Use the circular **profile avatar** in the header to switch between independent
homepages. When closed, only the avatar is visible; the menu shows names and avatars,
with **New profile** as its last item. Create an **Empty homepage** or a **Copy
current homepage**. Give it a name, then edit or import a Chroma configuration into
that profile. Creating a profile persists it immediately; subsequent content edits
still require Save. Copying uses the saved source, not an unsaved draft.

Your existing homepage stays in `/data/config.json` with the reserved ID `default`;
no migration, moving, or rewriting of this file is required. New profiles use UUIDs
and live in `/data/profiles/<uuid>.json`, using the same versioned document schema.
Backups are isolated under `/data/backups/<uuid>/`; the original homepage continues
using `/data/backups/`. Assets are shared, so copies retain working image references.
The existing Docker data volume includes all profiles automatically.

Profile names come from `homepage.title`. Edit **Homepage title / profile name** in
**Homepage settings** to rename one. Open these settings from the avatar menu, or
enter Edit Mode; when an entity is selected, the Inspector's **Homepage settings**
button returns to them. Importing a document also adopts
its homepage title. Import, export, Save, Cancel, and history apply only to the active
profile. Save or cancel editing before switching; switching clears the selection,
clipboard, undo/redo, and active tab. The chosen profile is remembered in this browser,
not selected globally for everyone using the server.

Choose an Iconify icon or upload an image as the **Profile avatar**, either when
creating the profile or from the Inspector in Edit Mode with nothing selected.
Avatar edits preview immediately and support Save, Cancel, Undo, and Redo. Uploaded
images live in the shared asset directory; `homepage.icon` stores only an Iconify
reference or asset ID. Existing profiles without this optional field show a default
avatar. The menu supports arrow keys, Home/End, Escape, and outside-click dismissal.

Profiles are separate configurations, **not user accounts or access-control boundaries**.
There is no authentication. Keep the server on a trusted network.

## Export and import a dashboard

In **Edit Mode**, **Export configuration** downloads a ZIP containing the current
draft (including unsaved edits), its uploaded profile avatar, and all referenced
card images across every tab. Shared images appear only once. The ZIP contains
`config.json`, `manifest.json`, and an `assets/` folder; keep them together when importing.
Unused images, other profiles, backups, and integration API keys are not included.
Iconify icons and live provider artwork remain external references, not offline copies.

On another instance, select the destination profile, enter **Edit**, and use
**Import configuration** to select the ZIP. Images receive fresh IDs, so existing
assets cannot be overwritten. Review the result and press **Save**; importing only
replaces the active draft and supports Undo/Redo/Cancel. Restored image files may
remain on the server after Undo or Cancel, just like ordinary image uploads.
Configure integration keys separately on the destination server.

Older JSON exports are still accepted, but their referenced images must already
exist on the destination. A JSON file alone cannot recover missing images: if they
remain on the original server, export a new ZIP there. Missing images now produce
an error instead of an incomplete export or broken import.

Limits: 55 MB ZIP upload, 50 MB expanded contents, 500 images, 5 MB per image,
and 1 MB configuration. Malformed, incomplete, or checksum-mismatched bundles are
rejected before any images are restored. Only one transfer runs at a time.

## Import from HistoryOut

Select the target homepage profile, enter **Edit**, and click **HistoryOut** in the
bottom toolbar. Select a complete HistoryOut JSON export (an array of records with
`url`, optional `title`, and optional numeric `visitCount`). The supplied format's
`order`, `id`, `date`, `time`, `typedCount`, and `transition` are not needed or stored.
This is separate from **Import configuration**, which expects a Chroma document.

The file is parsed in a browser worker, never uploaded. Preview the ranked sites,
edit their labels, and select up to 100; the top 20 eligible sites start selected.
Search and pagination let you review larger exports. Choose a new or existing tab
and a card layout. Import appends new sections of up to 12 cards each, preserving
existing cards, homepage settings, and every other profile. It is one undoable draft
change. Press **Save** to persist it, or **Cancel** to discard the editor session.
**Open the destination tab by default** also updates the default tab when selected;
it starts enabled for empty profiles so imported content remains visible after reload.

Grouping uses the full origin (scheme, hostname, port), so subdomains and local
service ports remain distinct. Imported URLs point to the site root: paths, query
parameters and fragments are not imported. Services hosted at different paths on
the same origin are grouped together; adjust their links manually afterwards.
Existing cards anywhere in this profile suppress another import of that origin.
Internal/extension/file URLs, credential-bearing URLs, and invalid records are
excluded with counts in the preview. Invalid top-level JSON is rejected.

Ranking sums the maximum `visitCount` for each distinct page after removing common
tracking parameters and fragments. Repeated exported rows do not multiply a page's
cumulative count. This is a relative **visit score**, not exact visits in a selected
date range or time spent. A clean root-page title is used when available; otherwise
the hostname is the suggested label, avoiding personal page titles.

**Fetch site titles and icons** is optional and off by default. If enabled, only the
selected root URLs are sent to your Chroma server for discovery; review the detected
details before adding them. Edited labels are preserved, and failures keep fallback
details. Private services require **Allow local network discovery**. Closing the
importer cancels pending browser work; already downloaded icons may remain in assets,
and server requests already started finish within the existing bounded timeout.

Limits: 20 MB per file, 100,000 records, 100 selected sites per import. Export a shorter
period for larger histories. No raw history, scores, timestamps, or external history
service accounts are stored in the homepage JSON.

## Editor shortcuts

| Action | Shortcut |
| --- | --- |
| Save | `Ctrl/Cmd + S` |
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` |
| Copy card | `Ctrl/Cmd + C` |
| Cut card | `Ctrl/Cmd + X` |
| Paste card | `Ctrl/Cmd + V` |
| Duplicate card | `Ctrl/Cmd + D` |
| Delete selection | `Delete` |

Select a section before adding or pasting a card to target that section. Otherwise, the first section of the active tab is used. While dragging a card or a section (using its grip), hover another tab for approximately 500 ms to switch tabs without ending the drag. Drop into the destination canvas or section. A direct drop on a tab header also works: cards go into its first section, creating one if needed. Sections retain their contents and styling, and can also be moved with **Move section to tab** in the Inspector. Each move is one undoable edit; Escape cancels the drag.

Use **Accent from icon** in the card, tab, or homepage color settings to extract a
color from the selected icon/image. For monochrome artwork, the app clearly labels
the result as a suggested color. It remains a normal editable color override and is
only persisted when you Save.

## Layout and appearance

Enter Edit Mode from **Profile avatar → Homepage settings**, then select a section heading.
In Homepage settings, **Tab navigation position** keeps the selector across the top or
moves it into a vertical rail to the left or right of the dashboard. Side rails return
to a horizontal row when the available canvas width is too narrow.
Choose **Horizontal cards**, **Icon tiles**, **Compact list**, or **Bento boxes**,
and set its width to full, two thirds, half, or one third. Sections collapse
to a single column when the canvas is narrow, including when the Inspector is open.
Grid maximum columns limit the column count without leaving unused page width.

### Fit a tab on one desktop screen

In Edit Mode, select a tab and enable **Fit on one screen (desktop)**. The setting
belongs to that tab and is undoable until **Save**. In normal desktop viewing
(browser width at least 1024 px), Chroma gives the section grid all available
space below the header and tab selector. It sizes each section row and each card
row according to their content, instead of scaling the entire canvas. Short link
cards use a compact presentation. It recalculates when the window size or API-card
content changes. The page and sections do not scroll in this mode. Side-tab
navigation remains separate.

Editing remains scrollable so cards and Bento controls stay usable. Smaller screens
retain the normal responsive layout and scrolling. Existing tabs remain scrollable
until you opt them in. If a tab holds more content than can physically fit, add
another tab or reduce the content; very short link cards omit their descriptions.
Saved Bento sizes are not rewritten by viewport fitting.

### Bento studio

To align entire sections, use **Arrange sections** in the editor toolbar. The
**Dashboard Bento studio** belongs to the active tab: set columns, row height and
section gap, then drag section handles or resize using the bottom-right corner.
The section controls also accept exact column, row, width and height in grid units.
Click an empty cell to move the selected section there. Overlapping sections are
moved into free space automatically; **Pack sections** removes deliberate gaps.

**Apply to draft** enables the tab's Bento arrangement as one undoable change.
Cancel/Escape discards studio edits. Use the homepage **Save** to persist them.
To restore flowing sections, select the tab and choose **Section arrangement → Flow**;
saved Bento dimensions are retained for later use.

Normally, section boxes have fixed grid heights, keeping their edges aligned even
when one contains more cards; long content scrolls inside its section. A desktop tab
with **Fit on one screen** instead allocates section and card row heights within
the viewport. Below 760 px of canvas width, sections stack in visual reading order and
expand to fit their content without changing saved positions. Card layout inside
each section is configured independently.

Choose **Bento boxes** for a section, then **Open Bento studio** in the Inspector.
Select a box in the preview or the Box dropdown. Choose Small (1×1), Wide (2×1),
Tall (1×2), Feature (2×2), or enter a custom width (1–12 columns) and height (1–4 rows).
Set the section's column count (1–12), minimum row height (120–320 px), and gap.
The section's Minimum card width determines when columns collapse on smaller screens.

Boxes flow in document order, without overlap; this first version does not store
absolute positions or support corner-drag resizing. Reorder or move cards using the
dashboard's existing drag and drop. Actual columns adapt to the section's available
width, and wide boxes clamp to fit. Rows may grow for content. Saved sizes remain
unchanged when the viewport shrinks or cards move to another section/layout.

Studio edits stay local until **Apply to draft**, which creates one undoable change.
**Cancel studio** or Escape discards those local edits. The homepage still requires
**Save** to persist; Cancel in the main toolbar discards the whole session. Copy,
paste and duplicate retain box sizes. Other layouts ignore them.

Section appearance provides defaults for all its cards: accent color, Glass/Flat/Minimal
surface, density, icon size, and description visibility. Select a card to override any
property, or choose Inherit to restore its section default. Changes remain in the draft
until Save and participate in Undo/Redo.

Set **Default accent color** in **Homepage settings** for the active homepage. Accent
inheritance follows **Homepage → Tab → Section → Card**, with the most specific explicit
color winning. Select a tab to set its accent, or use **Inherit** on tabs, sections, and
cards to remove an override. The Inspector displays the effective inherited color.
Changing a parent never rewrites its children or removes their existing custom colors.
A card without an override adopts its destination's color when moved. Existing documents
without a homepage accent keep the app's violet default. Name, avatar, and color edits
all support preview, Save, Cancel, Undo, and Redo, independently for each profile.

## Keyboard launcher

In View Mode, start typing outside input fields or press **Ctrl/Cmd + K**. Search matches
names, aliases, tags, descriptions, locations, and URLs; names and aliases also tolerate
small spelling mistakes. Type **#automation** to search only tags. Arrow keys choose a
result, Enter opens it, and Escape closes the launcher.

Built-in web shortcuts are **g** (Google), **gh** (GitHub), and **yt** (YouTube), followed
by a query, for example `gh react & typescript`. Query text is URL-encoded before opening.
Edit providers from **Launcher settings** in the Inspector, including keywords, destination
templates containing `{query}`, and new-tab behavior. Alias and tag fields are available
in each card's Inspector. These settings are part of the JSON document.

## Automatic link details

In Edit Mode, add a Link and paste its URL. After a short pause, Chroma fetches the
page title, description, and favicon and fills untouched new-card fields. On existing
cards, review the preview and click **Use detected details** to apply it. **Find site
details** retries discovery. Manual title and icon selection remain available.

Discovered icons are copied into the local assets directory and referenced by ID.
The configuration itself is only saved when you press Save; metadata application is
one undoable draft change. Preview icons, like uploaded images, may remain in assets
if you cancel editing.

Enable **Allow local network** for private IPs, local hostnames, and loopback services.
Addresses are resolved from the server/container, not from your browser. Certificate
verification stays enabled. Pages requiring sign-in, JavaScript-rendered metadata,
or unsupported images may need manual details. Automatic icon discovery supports PNG,
JPEG, WebP, GIF, and ICO; SVG-only sites retain the existing icon.

Discovery sends unauthenticated HTTP(S) GET requests with bounded response sizes,
redirects, and timeouts. Each destination is validated and its DNS address pinned.
Link-local, metadata, multicast, and reserved addresses are excluded, including when
local-network access is enabled.

## Custom cards / your own endpoint

In Edit Mode, select a section and click **Custom**. The card initially shows a fake
house summary. Set **JSON endpoint** to your service's `chroma-card/v1` GET endpoint,
enable **Allow local network** for Home Assistant/LAN services, and use **Test endpoint**
to validate and preview it. Select optional Bearer or X-API-Key authentication and
save its credential securely in the Inspector; tokens never enter configuration/export.
Save the dashboard to persist the card. Refresh, errors, and stale data are shown explicitly.

See [Custom card protocol](custom-card-protocol.md) for a complete house JSON example,
the field-to-card diagram, bounds, caching behaviour, authentication and mock endpoint.

## API endpoints

- `GET /api/config` returns the current validated document.
- `PUT /api/config` validates and atomically saves a complete document.
- The legacy `/api/config` endpoints always address the original `default` profile.
- `GET /api/profiles` lists profile IDs and names.
- `POST /api/profiles` accepts `{ name, icon?, sourceProfileId? }` and creates a blank or copied
  profile, returning `{ profile, config }`.
- `GET /api/profiles/:id/config` loads one profile.
- `PUT /api/profiles/:id/config` validates and saves an existing profile with its own backup.
- `POST /api/dashboard/export` accepts a configuration JSON body and returns a ZIP
  with exactly its referenced local images, without saving the configuration.
- `POST /api/dashboard/import` accepts one multipart ZIP or legacy JSON file, restores
  images, and returns `{ config, assetCount }` without changing any saved profile.
- `POST /api/assets` accepts one multipart image up to 5 MB.
- `GET /api/assets/:id` serves an uploaded asset.
- `POST /api/link-preview` accepts `{ url, allowLocalNetwork? }` and returns suggested
  title, description, and a local asset reference when an icon is available.
- `GET|PUT|DELETE /api/integrations/api-sports-formula-one` checks, saves, or removes
  the server-side API key. `GET` returns only `{ configured }`.
- `GET /api/widgets/formula-one/next-race` returns normalized,
  cached next-race data without exposing the provider credential.
- `GET /api/widgets/formula-one/driver-standings` returns normalized, cached current
  driver standings for the championship-leaders and favourite-driver card views.
  Championship-leaders cards can display a configurable 1–30 drivers (three by default).
- `GET|PUT|DELETE /api/integrations/isthereanydeal` checks, saves (`{ apiKey }`),
  or removes the server-side Gaming credential. Responses contain only `{ configured }`.
- `GET /api/widgets/gaming?view=free-games&platform=pc` serves normalized giveaways;
  `?view=deals&country=IT&shops=35,61` serves regional ITAD offers for the selected
  store IDs (omit `shops` for all). No credentials in widget requests.
- `GET /api/widgets/gaming/shops?country=IT` returns the cached regional ITAD shop
  catalogue (`id`, `title`) without requiring a key.
- `GET /api/widgets/motogp/next-race` returns the next MotoGP Grand Prix (or `race: null`).
- `GET /api/widgets/motogp/rider-standings` returns current-season MotoGP standings.
- `POST /api/widgets/remote-data` fetches a custom endpoint from validated settings.
- `POST /api/integrations/remote-data` creates an encrypted, endpoint-bound credential;
  `GET|DELETE /api/integrations/remote-data/:id` returns only its configured status.
- `GET /api/examples/house` returns fake house data in the `chroma-card/v1` protocol.

See [docs/architecture.md](architecture.md) for implementation details and extension points.
See [docs/improvements.md](improvements.md) for completed improvements and proposed next steps.
