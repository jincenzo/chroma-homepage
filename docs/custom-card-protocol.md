# Custom cards: `chroma-card/v1`

A Custom card periodically reads a GET endpoint that you own and renders its JSON.
Use it for Home Assistant summaries, a NAS, a build server, or any other service.
There is no arbitrary field mapping: your endpoint must produce the protocol below.
All text is plain text, not Markdown or HTML. The endpoint cannot supply scripts,
CSS, images, layout, card IDs, or executable actions.

## Try the house demo

1. Enter **Edit**, select a section, then click **Custom** in the toolbar.
2. The new card uses `demo:house`, a built-in fake house summary. No API key or
   network request to a third party is needed. **Use house demo** restores this preset.
3. Click **Test endpoint** to see validation, cache state, last-success time, and a preview.
4. **Save** persists the card. Label, icon, appearance, and Bento size are edited locally.

A real mock JSON endpoint is also available at `GET /api/examples/house` on your
Chroma server, e.g. `http://localhost:3000/api/examples/house`. To test the actual
HTTP path, use its full URL as **JSON endpoint**, enable **Allow local network**,
and click **Test endpoint**. The address must be reachable from the Chroma server
or container, not just from your browser. This endpoint always contains fake data.

## Example response: general house card

Return HTTP `200` and `Content-Type: application/json` with this body. Replace the
values and timestamp with your current house state; do not include access tokens.

```json
{
  "protocol": "chroma-card/v1",
  "updatedAt": "2026-09-28T08:30:00+02:00",
  "ttlSeconds": 60,
  "status": { "label": "Home secure", "tone": "success" },
  "blocks": [
    {
      "type": "text",
      "title": "House overview",
      "text": "Everyone is home. Windows are closed and the alarm is armed."
    },
    {
      "type": "metrics",
      "title": "Comfort & energy",
      "items": [
        { "label": "Living room", "value": 22.4, "unit": "°C" },
        { "label": "Humidity", "value": 48, "unit": "%" },
        { "label": "Power now", "value": 0.82, "unit": "kW", "tone": "info" },
        { "label": "Solar today", "value": 9.6, "unit": "kWh", "tone": "success" }
      ]
    },
    {
      "type": "progress",
      "title": "Storage",
      "label": "Home battery",
      "value": 76,
      "max": 100,
      "unit": "%",
      "tone": "success"
    },
    {
      "type": "list",
      "title": "Around the house",
      "items": [
        { "label": "Front door", "value": "Locked", "tone": "success" },
        { "label": "Windows", "value": "All closed", "tone": "success" },
        { "label": "Lights", "value": "3 on", "description": "Kitchen and living room" },
        { "label": "Robot vacuum", "value": "Docked", "description": "Last clean completed at 10:30" }
      ]
    }
  ],
  "actions": [
    { "label": "Open Home Assistant", "url": "http://homeassistant.local:8123/" }
  ]
}
```

## Where each field appears

```text
┌────────────────────────────────────────────────────┐
│ [local icon] MY HOUSE       [status.label / tone]   │
│                                                    │
│ HOUSE OVERVIEW                  blocks[0].title    │
│ Everyone is home…               blocks[0].text     │
│                                                    │
│ COMFORT & ENERGY                blocks[1].title    │
│ ┌ Living room ──┐  ┌ Humidity ──┐  items[].label   │
│ │ 22.4 °C       │  │ 48 %       │  value + unit    │
│ └───────────────┘  └────────────┘  colour = tone    │
│ ┌ Power now ────┐  ┌ Solar today ┐                 │
│ │ 0.82 kW       │  │ 9.6 kWh     │                 │
│ └───────────────┘  └─────────────┘                 │
│                                                    │
│ STORAGE                         blocks[2].title    │
│ Home battery                   76 % / 100 %        │
│ ███████████████░░░░░            value / max        │
│                                                    │
│ AROUND THE HOUSE                blocks[3].title    │
│ Front door                                Locked  │
│ items[].label                     items[].value   │
│ Lights                                      3 on  │
│ Kitchen and living room       items[].description │
│ …                                                  │
│                                                    │
│ Open Home Assistant ↗              actions[].label│
│ Source updated …                         updatedAt│
│ Last success … · fresh/cached/stale   Chroma footer│
└────────────────────────────────────────────────────┘
```

The local label/icon remain at the top left. Optional `status` appears at the top
right. Blocks render **top to bottom in array order**, with optional uppercase
titles. Metrics use two columns in input order. Progress shows a label, numeric
value/max, and a bar. List rows show labels on the left, values on the right,
and optional descriptions underneath. Actions are links below the blocks and open
in a new tab; in Edit Mode they are non-clickable labels. They **do not** POST,
toggle devices, or send credentials. The service's timestamp and Chroma's fetch
timestamp are separate; a 304 revalidation updates last success, not `updatedAt`.

## Protocol reference and limits

The executable validation schema is [src/shared/remote-card.ts](../src/shared/remote-card.ts).
Unknown properties are rejected, rather than silently rendered or executed.

| Field | Required | Meaning / bounds |
| --- | --- | --- |
| `protocol` | Yes | Exactly `chroma-card/v1`; other versions fail validation. |
| `updatedAt` | No | ISO-8601 timestamp with `Z` or a timezone offset; footer. |
| `ttlSeconds` | No | Integer 30–3600; freshness hint, not visible. Default 60. |
| `status` | No | `{ label, tone? }`; label 1–120 chars. |
| `blocks` | Yes | 1–6 of the four block types below. |
| `actions` | No | Up to two `{ label, url }` links; label 1–80 chars. |
| `tone` | No | `neutral` (default), `success`, `warning`, `danger`, or `info`. |

| Block type | Properties | Bounds |
| --- | --- | --- |
| `text` | `title?`, `text` | Text 1–1000 chars; line breaks preserved. |
| `metrics` | `title?`, `items: [{ label, value, unit?, tone? }]` | 1–12 items; **12 total metrics** across all blocks. |
| `progress` | `title?`, `label`, `value`, `max`, `unit?`, `tone?` | Finite numbers, `0 ≤ value ≤ max`, `max > 0`. |
| `list` | `title?`, `items: [{ label, value, description?, tone? }]` | 1–20 items; **20 total rows** across all blocks. |

Titles and item labels are 1–120 chars; values in metrics/lists are finite numbers
or strings up to 160 chars (use `"Unavailable"` for unknown sensor values, not
`NaN`/`null`). Units are at most 24 chars and descriptions at most 240.
Link URLs must be absolute HTTP(S), at most 2048 chars, without embedded
username/password or fragments. Remote content is escaped by React; a string
such as `<script>…</script>` displays literally. Tone maps to fixed semantic
colours; no remote arbitrary colour values are accepted. Use a tall/wide Bento
card for a large summary; its data does not resize the dashboard automatically.

## Your own service / Home Assistant

Replace `demo:house` with an absolute endpoint that returns this document. An
ordinary Home Assistant state response is **not** this protocol: your custom
endpoint or adapter needs to assemble these blocks from your chosen entities.
For example, map temperature to `metrics.items[].value`, a lock state to a list
row, and battery state of charge to `progress.value`. Do not put entity access
tokens in the JSON, URL, action links, or card configuration.

Enable **Allow local network** for private addresses, loopback, or local hostnames.
`localhost` refers to the Chroma server/container. Use a reachable LAN address or
container service name for Home Assistant. TLS certificates are always verified.
Cloud metadata, link-local, multicast, unspecified, and reserved destinations are
blocked even when local-network access is enabled. DNS results are validated and
pinned for each request and redirect.

For an authenticated endpoint, select **Bearer token** (`Authorization: Bearer …`)
or **X-API-Key**, enter the secret, and press **Save credential**. It is encrypted
server-side and bound to that **exact normalized URL and auth mode**. Config stores
only an opaque `credentialId`; no read API exposes the token. Save/remove is
immediate and is not undone by dashboard Undo/Cancel. Replacement creates a new
reference, leaving old references usable by copied cards. Endpoint/auth changes
clear the card's reference. Configure credentials again after exporting to a
different server; ZIP and JSON exports do not carry them. Never put tokens in
URL query parameters: URLs are part of configuration/export. Use HTTPS when not
on a trusted LAN. Authenticated endpoints must respond directly (no redirects);
this prevents credentials from being forwarded elsewhere.

Keep Chroma on a trusted network: its profiles are not accounts, and its API has
no access control. The token is hidden from read APIs, not an authorization
boundary between dashboard users.

## Docker upgrades and compatibility

Custom cards are an additive card type; existing configuration still uses
`schemaVersion: 1` and needs no migration. Update/rebuild the image and recreate
the container while preserving the same `/data` volume and `CHROMA_SECRET_KEY`
(if configured). Back up the entire data volume first; do not delete it with
`docker compose down -v`. Refresh the browser, then create a Custom card in Edit Mode.

Older images do not understand the new `remote-data` card type. Once you save one,
rolling back requires removing those cards with the newer version or restoring
the pre-upgrade backup. Imported configurations still need endpoint credentials
configured on a different server; the data protocol version is separate from
the dashboard configuration version.

## Fetching, caching, and failures

- Chroma performs a server-side GET; browser CORS configuration is not required.
  Each fetch has a 5-second total timeout and a 64 KiB response limit. Compressed
  responses are not accepted; send ordinary JSON (`Accept-Encoding: identity`).
- The UI refresh interval is 30–86400 seconds. Responses can increase the wait via
  `ttlSeconds` or HTTP `Cache-Control: max-age=N`, clamped to 30–3600 seconds.
  HTTP max-age takes precedence. The next poll waits at least the configured interval.
- Matching requests are deduplicated; at most three endpoints fetch concurrently.
  The server holds at most 100 cache entries. `ETag` is sent as `If-None-Match` on
  revalidation. `304` is valid only after a successful response. `no-cache` triggers
  revalidation on the next poll; `no-store` keeps no server-side cached response.
- **Test endpoint** uses the same cache/backoff rules (it is not a forced refresh).
  Validation reports failing field paths without echoing the raw response.
- On failure, the last valid response stays visible with a **Stale** notice and
  last-success time. Retries back off from 30 seconds up to 15 minutes. With no
  valid data, the card displays an error. Changing endpoint/auth/local-access settings
  clears visible old data, so one source cannot masquerade as another.
- The endpoint must never echo its credential. Exact token echoes are rejected.
  Cached data is memory-only and does not survive a server restart or export.

## Chroma API (not the remote protocol)

`POST /api/widgets/remote-data` accepts `{ endpoint, allowLocalNetwork?, authMode?,
credentialId?, refreshSeconds? }` and returns `{ data, fetchedAt, stale, cache,
nextRefreshSeconds, error? }`. `data` is the document above. No configuration is
saved by fetching/testing.

`POST /api/integrations/remote-data` accepts `{ endpoint, authMode, secret }` and
returns `{ configured: true, credentialId }`. `GET` and `DELETE` on
`/api/integrations/remote-data/:credentialId` return only `{ configured }`.
Both configuration and credential files remain in the existing data volume;
only the credential file is encrypted. Keep that volume private and backed up.
