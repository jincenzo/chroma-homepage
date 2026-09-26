# User guide

Chroma Homepage is a self-hosted browser homepage with a visual, document-based editor. It renders a portable JSON document organized as tabs, sections, and cards; no YAML or hand-edited configuration is required.

Phase 1 includes:

- a polished dark, responsive homepage with animated tab and layout transitions;
- visual editing with a draft, Save/Cancel, undo/redo, and keyboard shortcuts;
- independent homepage profiles with a top-bar selector, blank creation, and copying;
- tab, section, and link-card creation, editing, deletion, and reordering;
- cross-section and cross-tab card drag and drop, including delayed tab activation;
- an in-app card clipboard with copy, cut, paste, duplicate, and delete;
- Iconify search and custom image uploads;
- horizontal cards, icon tiles, compact lists, and responsive full/half/third-width sections;
- inherited section appearance with per-card color, surface, density, icon size, and description overrides;
- a keyboard launcher with typo-tolerant search, aliases, tags, and editable web search shortcuts;
- validated JSON import/export and atomic server-side persistence;
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
/data/backups/
/data/backups/<profile-uuid>/
```

`config.json` is written with two-space indentation and a trailing newline. Every save first validates the full document, writes a temporary file, copies the previous configuration into `backups`, and atomically renames the temporary file.

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

In Edit Mode, select a section heading. Choose **Horizontal cards**, **Icon tiles**,
or **Compact list**, and set its width to full, half, or one third. Sections collapse
to a single column when the canvas is narrow, including when the Inspector is open.
Grid maximum columns limit the column count without leaving unused page width.

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

## API endpoints

- `GET /api/config` returns the current validated document.
- `PUT /api/config` validates and atomically saves a complete document.
- The legacy `/api/config` endpoints always address the original `default` profile.
- `GET /api/profiles` lists profile IDs and names.
- `POST /api/profiles` accepts `{ name, icon?, sourceProfileId? }` and creates a blank or copied
  profile, returning `{ profile, config }`.
- `GET /api/profiles/:id/config` loads one profile.
- `PUT /api/profiles/:id/config` validates and saves an existing profile with its own backup.
- `POST /api/assets` accepts one multipart image up to 5 MB.
- `GET /api/assets/:id` serves an uploaded asset.
- `POST /api/link-preview` accepts `{ url, allowLocalNetwork? }` and returns suggested
  title, description, and a local asset reference when an icon is available.

See [docs/architecture.md](architecture.md) for implementation details and extension points.
See [docs/improvements.md](improvements.md) for completed improvements and proposed next steps.
