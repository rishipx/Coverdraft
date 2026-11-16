# Deployment

## Cloudflare Pages

Coverdraft is a static site. Only the `src/` folder is published; `tests/`, `scripts/` and `docs/` are not part of the site.

1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick this repository.
2. Set the build settings:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | *(empty)*, since generated files are committed. Or `npm run build` to rebuild on Cloudflare. |
| Build output directory | `src` |

3. Save and deploy. Every push to `main` redeploys; other branches get preview URLs.

`.github/workflows/ci.yml` runs the static checks and Chromium browser tests on every push and pull request. Deployment itself is handled by Cloudflare.

**Cloudflare settings to leave off:** Rocket Loader (it can break script order) and Web Analytics auto-injection (the Content Security Policy blocks its script).

## Generated files

`npm run build` writes two files into `src/`. Both are committed, and `npm run check` fails if they are stale.

| File | Contents |
| --- | --- |
| `assets/js/data/templates.generated.js` | Template registry compiled from `src/templates/<id>/` |
| `precache.generated.js` | Service-worker file list and a cache name with a content hash, so every change invalidates the old cache |

## Third-party scripts

Four libraries load from cdnjs, pinned to exact versions in `src/assets/js/data/cdn-libraries.js`: html2canvas, jsPDF, pdf-lib and Mammoth. Each entry can carry a Subresource Integrity hash so browsers reject a modified copy.

```bash
npm run sri                           # download libraries and write hashes
node scripts/update-sri.mjs --verify  # confirm recorded hashes still match
```

Re-run it whenever a version in that file changes.

## Configuration and privacy

No backend or credentials are needed. `src/assets/js/config.js` holds the public GitHub Issues link (`reportUrl`) opened by **Report a wrong format**. A static host does not read `.env` files, so never put secrets in client code.

## Release checklist

1. `npm run sri`, commit, then `npm run build && npm run check && npm run test:browser`.
2. Deploy. On desktop and mobile, verify:
   - editing, PDF download and print
   - PDF merge and custom emblem upload
   - saved layout import and export
   - preview page order
   - offline reload after the first visit
3. Bump `version` in `package.json`, run `npm run build` (the version is part of the cache name), and tag the release.
