# Contributing

## Setup

No dependencies to install. Node.js 20+ runs the build and checks; Python 3 with Playwright runs the browser tests.

```bash
npm run serve   # local server on http://localhost:8080
```

## Before opening a pull request

```bash
npm run build          # only needed after changing src/templates/ or adding/removing files in src/
npm run check
npm run test:browser
```

Commit the generated files (`src/assets/js/data/templates.generated.js`, `src/precache.generated.js`) with your change.

## Conventions

- Plain browser scripts, no bundler. Script order in `src/index.html` is dependency order; every file under `src/assets/js/` must be listed there (the check enforces it).
- Put code in the module that owns the behavior (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) instead of creating catch-all files.
- Two-space indentation, LF line endings (`.editorconfig`). No inline scripts, styles or event handlers in HTML.
- Treat browser storage keys and the saved-layout record format as a public contract: changing them discards users' local data, so avoid it unless the release notes say so.
- Read and write `localStorage` through `window.coverdraftStorage` (`core/storage.js`).
- University data belongs in `src/templates/<id>/`, never in JavaScript.
- Never commit `.env` files, credentials, or personal machine paths.
- Icons come from [Lucide](https://lucide.dev) only. Add the icon's markup to `src/assets/js/core/icons.js` under its Lucide name, then use `<i data-icon="name" data-size="16"></i>` in HTML or `lucideSvg('name', 16)` in scripts. Do not draw custom icons or use text glyphs (such as `✕` or `▲`) as icons; `npm run check` rejects unknown icon names and inline SVGs.
- Use `coverdraftConfirm()` (core/confirm-dialog.js) for confirmations, never `window.confirm`; `npm run check` rejects native `confirm()`. Give it a `skipKey` when the prompt should offer "Don't show this again".
- When you change a CDN library version in `src/assets/js/data/cdn-libraries.js`, run `npm run sri` and commit the new hash.
- Templates are community-maintained approximations of official formats. Keep the README disclaimer ("not affiliated with any university") intact.
