# Security and privacy

## Deployment boundary

Chroma Homepage currently has **no authentication, authorization, or user isolation**.
Anyone with network access to its HTTP port can read and edit all configurations,
upload assets, create profiles, and use URL discovery. Profiles are not accounts.

Keep it on a trusted network or behind an authenticated gateway that protects **all
routes, including `/api/*`**. Use HTTPS when accessing it across an untrusted network.
Do not publish the application port directly to the internet. Docker Compose binds
the selected port on the host's interfaces; firewall or bind it appropriately for
your environment. A reverse proxy alone does not add authentication.

This is an early release, not a formally audited security product.

## What leaves your browser or server

- Iconify search and icons contact Iconify's public services with icon names/queries.
- Google search and launcher search shortcuts send queries to the chosen provider.
- Link discovery makes unauthenticated HTTP(S) requests from the Chroma server to
  the supplied site. It does not forward your browser cookies or credentials.
- Formula 1 cards make cached server-side requests to API-Sports and/or the public Jolpica
  schedule. A configured API key is sent only to the fixed API-Sports Formula 1 host;
  Jolpica receives no credential. Only normalized race data returns to browsers.
- HistoryOut exports are parsed locally in a browser worker. Raw history, private
  paths, queries, timestamps, and visit scores are not sent to the server by the
  importer. Optional discovery sends selected site roots only.
- Imported configuration JSON and manually entered links may still contain private
  names or URLs. Treat your data directory and exported configurations as private.

## Existing safeguards and limitations

- Shared Zod validation on imports and saves, including HTTP(S)-only link cards and
  rejection of embedded URL credentials. React renders labels as text.
- Atomic configuration writes and previous-version backups. Backups and assets have
  no automatic retention/garbage-collection policy; monitor disk usage.
- UUID-validated profile/asset paths. Uploaded images have a size limit and are
  served with `nosniff` and a restrictive sandbox/content security policy.
- Discovery validates every URL and redirect, pins validated DNS results, and limits
  response size, redirects, request duration, and concurrent previews.
- LAN discovery is opt-in. Enabling it permits requests to private/loopback services
  reachable by the server. It is **not** an authorization mechanism. Link-local,
  cloud metadata, multicast, and reserved destinations remain blocked.
- There is no global rate limiting, storage quota, or malicious-file scanning. Do
  not accept uploads or configuration changes from untrusted users.
- Integration credentials are stored separately from configuration and encrypted with
  AES-256-GCM. Credential APIs reveal only whether a key exists. Files use owner-only
  permissions, and keys are excluded from exports, configuration backups, logs, and Git. By default the
  encryption key lives beside the ciphertext in the private data directory, which protects
  against accidental disclosure but not full data-volume compromise. Set
  `CHROMA_SECRET_KEY` from a secrets manager or protected environment for stronger separation.
- Because Chroma has no authentication, anyone who can reach its API can replace/remove
  integration credentials and consume configured provider quotas through widget routes.
  The trusted-network/authenticated-gateway requirement applies to these routes too.

## Keeping a fork private where it matters

The source repository contains a public demo configuration and synthetic tests only.
Runtime directories (`.data`, `.e2e-data`, `data`, `backups`, `uploads`), browser
exports, environment files, credential files, logs, and browser test artifacts are
excluded from Git. Equivalent exclusions protect the Docker build context.

Custom `DATA_DIR` locations outside these patterns need their own ignore rule.
Ignore rules do not untrack files already committed. Before pushing, review:

```bash
git status --short
git diff --cached --check
git diff --cached --stat
git diff --cached
npm audit
```

Screenshots must be generated from the clean demo using the documented script, then
visually inspected. Never publish screenshots of personal profiles or HistoryOut
exports. If a secret has already been pushed, revoke/rotate it; deleting the file
from the latest commit does not remove it from history.

## Reporting an issue

Never attach credentials, private configurations, or browser history to a public
issue. For sensitive findings, use GitHub's private vulnerability reporting **if it
is enabled** for this repository. Otherwise, open a minimal issue asking for a
private contact channel without publishing exploit details or personal data.
