# Pre-publication review

Reviewed for the initial source publication on 2026-09-26. This is a scoped
pre-publication assessment, not a penetration test or a guarantee of absence of bugs.

## Scope

- Review the Git publication set for private profiles, browsing history, uploaded
  assets, backups, credentials, machine-local paths, and generated test artifacts.
- Inspect the demo configuration and screenshot inputs; screenshots must use only
  public demo data and be stored in the repository for GitHub rendering.
- Review configuration validation, asset/profile path handling, URL discovery
  restrictions, and documented deployment boundaries.
- Audit npm dependencies and run the build, lint, unit/API, and browser tests.

## Changes made before publication

- Expanded Git and Docker exclusions for runtime data, exports, environment files,
  credentials, and local editor/agent settings.
- Separated the public README from the detailed user guide and documented the
  unauthenticated trusted-network deployment model in `SECURITY.md`.
- Added reproducible screenshots using the checked-in demo fixture and intercepted
  API responses. No private runtime directory or browser export is read by capture.
- Restricted link-card URLs to HTTP(S), without embedded credentials, preventing
  executable URL schemes from entering a saved or imported document.
- Added an esbuild override to the patched 0.28.2 line for development tooling;
  ordinary audit repair could not move the older parent dependency range. The
  dependency update must pass the normal build and tests before publication.
- Use GitHub's no-reply author address for the publication commit rather than a
  personal email address.

## Intentional non-secrets

The demo links point to public products and documentation. Tests use synthetic
example domains, loopback/private fixture addresses, deliberately fake credentials
for rejection tests, and a tiny test-image payload. These are not operational
accounts or exported personal history. The repository owner and support URL are
intentionally public project information.

## Remaining boundaries

No authentication, multi-user permissions, global rate limits, storage quotas, or
automatic asset/backup cleanup are implemented. Iconify is an external dependency
at runtime for icon lookup. Deployment requires a trusted network or an authenticated
gateway. See `SECURITY.md` for details and re-run dependency/security checks over time.

## Verification results

- TypeScript checks, production build, and ESLint passed.
- 50 unit/API tests passed.
- All 25 Playwright scenarios passed in smaller batches; longer combined runs were
  terminated by the development environment before completion.
- `npm audit` reported zero known vulnerabilities for the reviewed lockfile.
- The 87-file publication set contained no private runtime paths or credential
  matches in the scoped scan. Test placeholders were manually distinguished from
  operational secrets. Both screenshots were visually inspected; neither includes
  embedded text/EXIF metadata, personal profiles, or private URLs.
- README local links and image references resolve to included repository files.
- Docker configuration was reviewed, but a container build was not executed because
  the Docker CLI is not installed in this development environment.

Only source, synthetic/demo configuration, tests, and documentation are included in
the initial commit. This repository had no earlier commits requiring history cleanup.
