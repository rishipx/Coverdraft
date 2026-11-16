# Architecture

Coverdraft is a static browser app with no server runtime. `src/index.html` defines the interface and loads classic scripts in dependency order. The only build step generates data files (see [DEPLOYMENT.md](DEPLOYMENT.md)); there is no bundler.

> Keep script order in `index.html` aligned with dependencies, and put new behavior in the module that owns it.

## Module map

All scripts live under `src/assets/js/`.

### Data and configuration

| File | Role |
| --- | --- |
| `config.js` | Public settings, currently `reportUrl` for the wrong-format report link. |
| `data/templates.generated.js` | Registry compiled from `src/templates/<id>/` (`UNIVERSITY_LIST`, `UNI_CONFIGS`, `TEMPLATES`, `UNI_CRESTS`, `UNIVERSITY_SEMESTER_COURSES`, `BUILTIN_TEMPLATES`). Generated, never edited by hand. |

### `core/`

| File | Role |
| --- | --- |
| `icons.js` | Lucide icon registry and `lucideSvg()`; swaps every `<i data-icon="name">` for inline SVG. |
| `template-registry.js` | Fills the university pickers from the registry. |
| `university-overrides.js` | A user's edits to a built-in university (menu, short and cover names, default cover layout) and deletions, kept in `localStorage` over the generated registry. Repository templates are never modified. |
| `app-state.js` | Shared state, page helpers and the index-page model. |
| `confirm-dialog.js` | `coverdraftConfirm()`, used for every replace/delete prompt. A `skipKey` adds "Don't show this again" (stored in `localStorage`; clearing site data restores it). |
| `storage.js` | `window.coverdraftStorage.get/set`, the only `localStorage` layer (safe reads with defaults, writes that report success). |
| `lib-loader.js` | Loads html2canvas, jsPDF and pdf-lib on demand. Exports first call `await window.coverdraftEnsurePdfLibs()`. |
| `editor-core.js` | Form rendering, template application, page-canvas rendering. |
| `canvas-editor.js` | Selection, drag, resize, text formatting, zoom, snapping. |
| `document-export.js` | PDF generation, print preparation, sharing, merging. |
| `docx-export.js` | Dependency-free Office Open XML export of the current page. |
| `app.js` | Startup, page navigation, batch subjects, mobile navigation, draft restore. |

### `features/`

| File | Role |
| --- | --- |
| `menu.js` | More actions (also hosts the student profile switcher) and the Download PDF menu. |
| `preset-menu.js` | University and saved-layout picker. Edit and delete buttons show on hover (always on touch screens). Footer: "Save current layout…", "Open a Word file…", and "Restore deleted universities" when needed. |
| `university-editor.js` | Edit dialog behind those buttons: rename, and replace the default layout with the page on screen. |
| `short-selects.js` | Compact university and semester selectors. |
| `format-library.js` | Saved layouts: build, sanitise, store, keep the "Saved layouts" group in sync. |
| `document-import.js` | Word (`.docx`) import. |
| `student-workflow.js` | Quick start, recent assignments, semester preparation. |
| `app-shell.js` | Wrong-format feedback, install and offline support, first-run setup. |
| `history-and-attachments.js` | Undo/redo history and attachment page ordering. |
| `shortcuts-and-status.js` | Keyboard shortcuts, help dialog, Escape handling, offline-readiness indicator. |
| `accessibility.js` | Theme preference, dialog semantics, focus management, dismissal. |

**`features/subjects/`**

| File | Role |
| --- | --- |
| `subject-state.js` | Per-subject experiment rows; student details applied on switch. Exposes `window.coverdraftSubjectState`. |
| `subject-shortcuts.js` | Subject bar (pin, unpin, remove), adding subjects, class subject lists, Quick Start index entries. |

**`features/export/`**

| File | Role |
| --- | --- |
| `export-flow.js` | Pre-download checks, page choice for Attach PDF, combined and per-subject downloads (`coverdraftExportMultipleSubjects(keys, { individual })`), drag-and-drop attach, separate PDF/PNG export. |
| `class-sharing.js` | Share a class preset (no student details) and open a class link. |

**`features/workspace/`**

| File | Role |
| --- | --- |
| `page-capture.js` | Choose and order PDF pages; render every page for preview and export. |
| `pdf-preview.js` | Page selection manager and the Preview PDF dialog. |
| `autosave.js` | Local autosave, rolling backup, "Saved" indicator. |
| `student-profiles.js` | Named student profiles. |
| `attachment-storage.js` | The attached assignment PDF, kept in IndexedDB. |
| `design-controls.js` | Global typography controls and zoom shortcuts. |
| `mobile-mode-toggle.js` | Phone wordmark toggle between Simple and Advanced modes. |

## Styling and runtime

| File | Owns |
| --- | --- |
| `css/app.css` | Editor, canvas, responsive, theme, focus, touch-target, reduced-motion and print styles. Older small-screen rules are legacy and overridden by `mobile.css`. |
| `css/student-workflow.css` | Quick-start styles. |
| `css/mobile.css` | Loaded last. Layout at 760 px and below: one-line header, bottom-sheet dialogs, "Edit details" button. |

The service worker precaches the local app shell and caches CDN libraries after their first fetch. Offline PDF export needs those libraries to have been cached.

## Export entry points

- **`document-export.js`** owns PDF capture, printing, sharing and the shared document-task lock. The primary PDF action captures only the current editor page.
- **`docx-export.js`** keeps editable text styling, index rows, page geometry, borders and the emblem image.
- **Preview PDF** exports the selected, reordered page set independently of the primary action. With several subjects ticked it writes one combined PDF or one PDF per subject.

## Document import

`document-import.js` lazily loads the pinned Mammoth build when the user picks **Open a Word file** in the university picker. It converts DOCX headings, paragraphs, lists and simple table rows into editable text elements, within size, estimated-page and content limits.

- Documents with recognizable student/course details or experiment rows can fill the regular form instead of creating free-text pages.
- Imported pages use `import-N` keys and reuse navigation, autosave, preview selection and PDF export.
- Existing assignment PDFs go through **Attach PDF** merging and are not imported as editable pages.
- New import is DOCX-only. The editor and exporter still render image elements that an older saved draft may contain.
- Files are processed and saved in the browser. No upload service is used.

## Storage

| Data | Location |
| --- | --- |
| Draft | `localStorage` key `coverdraft_document_v1`. The app always reopens on the Cover, and a saved cover with no elements is rebuilt from the university template. |
| Saved layouts | IndexedDB (`coverdraft` / `formats`) with a `localStorage` fallback. See [TEMPLATES.md](TEMPLATES.md). |
| University edits | `localStorage` key `coverdraft_university_overrides_v1`. |
| Subjects | Added subjects are kept per university and semester and shared in class links (`subs` in the payload). Text from links and files is sanitised first. |
| Attached PDF | IndexedDB. |

## Tests

| Command | Checks |
| --- | --- |
| `npm run check` | Structure, generated files, syntax, accessibility rules, repository hygiene |
| `npm run test:browser` | Full source in Chromium via `tests/browser-smoke.py` and `tests/accessibility.py` |

The smoke test serves the page from a fake `https://` origin so `localStorage` and IndexedDB behave as in production.
