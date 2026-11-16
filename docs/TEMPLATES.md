# Templates and saved layouts

Templates are independent, community-maintained approximations of each institution's format. Coverdraft is not affiliated with any university, and names and emblems remain the property of their owners (see the README disclaimer). Only add an emblem you are allowed to share.

Two separate concepts exist. Do not mix them up.

| | Built-in **templates** | Saved **layouts** |
| --- | --- | --- |
| What | A university: details, form fields, subjects, crest, cover design | One user-made cover/index design |
| Where | `src/templates/<id>/` in the repository | The user's browser (IndexedDB, `localStorage` fallback) |
| Who edits | Maintainers, through Git | Users, in the app |

## Template folder

```text
src/templates/<id>/
├── template.json     # required
├── courses.json      # subjects per semester (may be {})
└── images/
    └── emblem.svg    # or emblem.png (the SVG wins if both exist)
```

`<id>` is a short lowercase key (letters and digits, starting with a letter). It is stored in users' drafts and class links, so **never rename an existing id**.

### `template.json`

| Key | Purpose |
| --- | --- |
| `id` | Must equal the folder name. |
| `order` | Position in the pickers, lower first. The lowest is the default university. |
| `name` | Full name, used on the cover and in layout names. |
| `label` | Text in the university dropdowns. |
| `shortName` | Compact text for the narrow selector. |
| `detect` | Case-insensitive regular expression that recognizes this university when a Word file is imported. |
| `defaults` | Sample course details: `department`, `title`, `code`, `degreeFull`, `specialization`, `prof`. |
| `student` | Sample student details. Keys follow the form fields (`name`, `roll`, `branch`, `subgroup`, …). |
| `fields` | Form fields for this university: `{ id, label, group }`. |
| `style` | `{ id, name, font, border }`. `style.id` must be unique across templates; it is stored in drafts. |
| `cover` | Cover page elements (below). |

Each cover element needs a unique `id` and a position (`x`, `y`, `w`; optional `h`), and usually `text`, `size`, `weight`, `align`, `color`. Text can use placeholders such as `{university}` or `{department}` that match field ids. Page size is A4 at 794 px wide.

### `courses.json`

```json
{ "4th": [ { "code": "UCS-405", "title": "Operating Systems Laboratory", "department": "Computer Science and Engineering Department" } ] }
```

Semester keys run from `1st` to `8th`.

### Emblem

An SVG is used as written. A PNG is embedded as a data URL at build time. Square crests and wide wordmarks both work, and images stay inside the logo element at their aspect ratio. A transparent background is ideal.

## Add a template

1. Copy an existing folder: `cp -r src/templates/ptu src/templates/mynewuni`
2. Edit `template.json` (`id`, a unique `style.id`, `order`, names, `detect`, layout) and `courses.json`.
3. Replace the image in `images/`.
4. Run `npm run build`. It validates the folder and fails with a clear message if something is wrong.
5. Run `npm run check`, then commit the folder together with the two generated files.

The university then appears in every picker, the preset loader, subject lists and Word-import detection. No other file needs editing.

## Edit a template

**For everyone (maintainers).** Change the files in the template's folder, then run `npm run build`. Layout and detail changes apply to new documents; existing drafts keep their saved content.

**For one user (in the app).** Hover a name in the university picker and press the pencil, or press `F2`, to change the menu name, short name, cover-page name and default cover layout. These edits live in the browser (`coverdraft_university_overrides_v1`) and never touch the repository. **Restore built-in** removes them.

A built-in university can also be deleted from the pickers (trash icon). **Restore deleted universities** in the same menu brings it back. At least one university always stays.

## Saved layouts (user data)

Hover a name in the university picker to edit or delete a layout, and use **Save current layout…** in the footer to add one.

Layouts live in IndexedDB (`coverdraft` / `formats`) with a `localStorage` fallback and are never uploaded. Browsers can clear that storage and there is no file export, so treat layouts as a convenience, not a backup. The app asks the browser to keep the storage after the first save.

### Stored record (v2)

```json
{
  "app": "coverdraft", "v": 2,
  "id": "fmt-xxxx", "name": "...", "description": "...", "author": "...", "updated": "ISO date",
  "uni": "ptu", "font": "...",
  "border": { "show": true, "style": "solid", "width": 2, "inset": 28, "color": "#111111" },
  "pages": { "cover": [], "index": [] }
}
```

- Records are sanitised on every read and write (`cleanPack` / `cleanEl`): numbers, colors, fonts and text are validated, HTML is reduced to `b/i/u/br`, and personal details are never stored.
- To change the structure, bump `PACK_V` in `src/assets/js/features/format-library.js` and convert older versions inside `cleanPack`.
