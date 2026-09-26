# Documentation screenshots

These PNGs are committed alongside the README, which references them using relative
paths. GitHub renders them without a running Chroma server or external image hosting.

The capture script uses only `config/default-config.json` plus the generated Style
studio demo. It intercepts all Chroma API requests in a fresh browser context and
never reads a runtime data directory, saved profile, or browser history export.
No application backend is started. The clock is fixed for consistent screenshots.

```bash
npm ci
npx playwright install chromium
npm run build
npx tsx scripts/capture-screenshots.ts
```

Port 4174 must be free. Iconify icons require network access during capture; the PNGs
themselves do not. Inspect both images before committing them. Do not replace these
files with screenshots from a personal profile containing private URLs or names.

To add the same optional Style studio to a running **default** homepage:

```bash
CHROMA_URL=http://localhost:3000 npx tsx scripts/add-layout-showcase.ts
```

Unlike screenshot capture, this last command saves a configuration change through
the API, preserving existing content and creating the usual automatic backup.
