"""Full-source Chromium smoke checks for Coverdraft's local application code.

This harness inlines local CSS and JS so it can run without a local HTTP server.
It deliberately omits CDN-hosted PDF libraries and removes the CSP meta element
only from the generated test document (the release HTML is never modified).
The test covers startup and core UI interactions, not live CDN loading, service
workers, or end-to-end PDF file generation.
"""
from __future__ import annotations

import base64
import io
import os
import re
import shutil
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent
ROOT = REPO / "src"


def build_smoke_document() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    # The document is served from a fake origin (see below), so local resources are inlined.
    html = re.sub(
        r'<meta\b(?=[^>]*http-equiv=["\']Content-Security-Policy["\'])[^>]*>',
        "",
        html,
        flags=re.I,
    )
    for css_path in ("assets/css/app.css", "assets/css/student-workflow.css", "assets/css/mobile.css"):
        css_content = (ROOT / css_path).read_text(encoding="utf-8")
        pattern = r'<link\b(?=[^>]*href=["\']\./' + re.escape(css_path) + r'["\'])[^>]*>'
        html, count = re.subn(
            pattern,
            lambda _match, content=css_content: f"<style>\n{content}\n</style>",
            html,
            count=1,
            flags=re.I,
        )
        if count != 1:
            raise RuntimeError(f"Expected exactly one stylesheet link for {css_path}")

    # Export libraries are CDN-hosted and are not needed for UI startup checks.
    html = re.sub(
        r'<script\b(?=[^>]*src=["\']https?://)[^>]*>\s*</script>',
        "",
        html,
        flags=re.I,
    )

    def inline_local_script(match: re.Match[str]) -> str:
        script_path = match.group(1)
        if script_path == "assets/js/core/lib-loader.js":
            # The smoke fixture deliberately removes CDN dependencies. Disable the
            # production lazy loader here too, so UI tests never hang on blocked network calls.
            content = "window.coverdraftEnsurePdfLibs = async () => true;"
        else:
            content = (ROOT / script_path).read_text(encoding="utf-8")
        return f"<script>\n{content}\n</script>"

    html, script_count = re.subn(
        r'<script\b[^>]*src=["\']\./(assets/js/[^"\']+)["\'][^>]*>\s*</script>',
        inline_local_script,
        html,
        flags=re.I,
    )
    if script_count < 10:
        raise RuntimeError(f"Expected local application scripts to be inlined, found {script_count}")

    html = re.sub(r'<link\b(?=[^>]*href=["\']https?://)[^>]*>', "", html, flags=re.I)
    html = re.sub(r'<link\b(?=[^>]*rel=["\']manifest["\'])[^>]*>', "", html, flags=re.I)
    return html


def run_checks() -> list[tuple[str, bool]]:
    document = build_smoke_document()
    checks: list[tuple[str, bool]] = []

    with sync_playwright() as playwright:
        launch_options: dict[str, object] = {
            "headless": True,
            "args": ["--no-sandbox", "--disable-dev-shm-usage"],
        }
        chromium_path = (
            os.environ.get("CHROMIUM_PATH")
            or shutil.which("chromium")
            or shutil.which("chromium-browser")
            or shutil.which("google-chrome")
        )
        if chromium_path:
            launch_options["executable_path"] = chromium_path

        browser = playwright.chromium.launch(**launch_options)
        page = browser.new_page(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            reduced_motion="reduce",
        )
        page.set_default_timeout(2500)
        page_errors: list[str] = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        try:
            # set_content() runs on an opaque origin, where Chromium denies localStorage and IndexedDB.
            # Serve the generated document from a fake https origin through request interception instead:
            # no real network or server is used, but the page gets a normal origin and working storage.
            origin = "https://coverdraft.test/"

            def fulfill(route):
                url = route.request.url
                if url in (origin, origin + "index.html"):
                    route.fulfill(status=200, content_type="text/html; charset=utf-8", body=document)
                else:
                    route.fulfill(status=404, content_type="text/plain", body="")

            page.route(origin + "**", fulfill)
            page.goto(origin + "index.html", wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(500)
            checks.append((
                "Full application initializes without uncaught errors",
                page.title().startswith("Coverdraft") and page.locator("#exportPdfBtn").count() == 1,
            ))
            checks.append((
                "All static form controls have programmatic names",
                page.evaluate("""() => Array.from(document.querySelectorAll('input,select,textarea'))
                    .filter(e => !['hidden','submit','button','reset','image'].includes((e.type || '').toLowerCase()))
                    .every(e => e.labels.length > 0 || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title)"""),
            ))
            checks.append((
                "No horizontal overflow at 390px",
                page.evaluate("document.documentElement.scrollWidth === 390 && document.body.scrollWidth === 390"),
            ))

            # Exercise the actual Quick Start implementation and shared dialog behavior.
            # The dashboard Quick Start control is intentionally hidden at phone widths;
            # exercise it at tablet width, then return to phone width for the wordmark mode toggle.
            page.set_viewport_size({"width": 700, "height": 900})
            page.wait_for_timeout(60)
            page.locator("#quickStartBtn").click()
            page.wait_for_timeout(100)
            quick_start_open = page.locator("#studentQuickStart").evaluate("element => element.classList.contains('open')")
            page.keyboard.press("Escape")
            page.wait_for_timeout(100)
            quick_start_closed = not page.locator("#studentQuickStart").evaluate("element => element.classList.contains('open')")
            focus_restored = page.evaluate("document.activeElement.id") == "quickStartBtn"
            checks.append(("Quick Start closes with Escape", quick_start_open and quick_start_closed))
            checks.append(("Quick Start restores focus to its trigger", focus_restored))

            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(60)
            # Phone header: Share, Attach and Download share one line with the wordmark (Simple mode has no More menu).
            actions_one_line = page.evaluate("""() => {
              const ids = ['sharePdfBtn', 'openMergerBtn', 'exportPdfBtn', 'downloadOptionsBtn'];
              const rects = ids.map(id => document.getElementById(id).getBoundingClientRect());
              const brand = document.querySelector('.brand-title').getBoundingClientRect();
              return rects.every(r => r.width >= 28 && r.height >= 32) && new Set(rects.map(r => Math.round(r.top))).size === 1
                && Math.abs(brand.top - rects[0].top) < 12 && document.documentElement.scrollWidth <= window.innerWidth;
            }""")
            checks.append(("Phone header keeps Share, Attach and Download on the wordmark line", actions_one_line))
            # Details open from the pencil button and close with Done.
            page.locator("#mobileEditFab").click()
            page.wait_for_timeout(60)
            sheet_open = page.locator("#appSidebar").evaluate("element => element.classList.contains('mobile-open')")
            page.locator("#sheetDoneBtn").click()
            page.wait_for_timeout(60)
            sheet_closed = not page.locator("#appSidebar").evaluate("element => element.classList.contains('mobile-open')")
            checks.append(("Edit details pencil opens a sheet that Done closes", sheet_open and sheet_closed))
            brand = page.locator(".brand-title")
            checks.append((
                "Mobile wordmark exposes accessible mode-toggle semantics",
                brand.get_attribute("role") == "button" and brand.get_attribute("aria-label") == "Switch to Advanced mode",
            ))
            brand.click()
            page.wait_for_timeout(100)
            advanced_mode_active = "simple-mode" not in (page.locator("body").get_attribute("class") or "")
            checks.append(("Mobile wordmark activates Advanced mode", advanced_mode_active))
            index_available = page.locator("#tabPageIndex").evaluate("element => getComputedStyle(element).display !== 'none'")
            checks.append(("Mobile wordmark activates Advanced mode", advanced_mode_active))
            checks.append(("Index tab becomes available in Advanced mode", index_available))

            # More actions are intentionally hidden in Simple mode, so verify theme/menu
            # behavior after the phone wordmark has switched to Advanced mode.
            page.locator("#moreMenuBtn").click()
            page.wait_for_timeout(40)
            old_theme = page.locator("html").get_attribute("data-theme")
            page.locator("#themeToggleBtn").click()
            page.wait_for_timeout(40)
            new_theme = page.locator("html").get_attribute("data-theme")
            theme_label = page.locator("#themeToggleBtn .theme-toggle-label").inner_text()
            checks.append(("Theme action updates the active theme and offers the opposite one", old_theme != new_theme and new_theme in {"light", "dark"} and theme_label == ("Dark theme" if new_theme == "light" else "Light theme")))

            page.locator("#tabPageIndex").click()
            page.wait_for_timeout(80)
            checks.append((
                "Index navigation works on mobile",
                "active" in (page.locator("#tabPageIndex").get_attribute("class") or ""),
            ))

            # The split-button dropdown owns preview and export actions; More actions stays for app tools.
            page.locator("#downloadOptionsBtn").click()
            page.wait_for_timeout(40)
            export_menu_open = not page.locator("#downloadOptionsMenu").evaluate("element => element.hidden")
            download_ids = page.locator("#downloadOptionsMenu .download-option").evaluate_all("elements => elements.map(element => element.id)")
            export_tools_present = "previewPdfMenuBtn" in download_ids and "downloadDocxBtn" in download_ids
            page.keyboard.press("Escape")
            page.wait_for_timeout(40)
            export_menu_closed = page.locator("#downloadOptionsMenu").evaluate("element => element.hidden")
            export_focus_restored = page.evaluate("document.activeElement.id") == "downloadOptionsBtn"
            checks.append(("Download dropdown includes Preview PDF and DOCX alongside advanced exports", export_menu_open and export_tools_present))
            checks.append(("Download dropdown Escape closes and restores focus", export_menu_closed and export_focus_restored))

            page.locator("#moreMenuBtn").click()
            more_text = page.locator("#moreMenu").inner_text()
            checks.append(("More actions holds app tools, not export tools", "Preview PDF" not in more_text and "Download DOCX" not in more_text and "Advanced export tools" not in more_text))
            checks.append(("More actions offers no community upload", "Community" not in more_text and page.locator("#cmUpload").count() == 0))

            # CDN libraries are intentionally absent from this smoke fixture. A lightweight canvas stub
            # exercises the real preview orchestration and page-selection refresh behavior instead.
            page.evaluate("""() => { window.html2canvas = async () => {
              const canvas = document.createElement('canvas'); canvas.width = 794; canvas.height = 1123;
              const context = canvas.getContext('2d'); if (context) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
              return canvas;
            }; }""")
            page.locator("#downloadOptionsBtn").click()
            page.locator("#previewPdfMenuBtn").click()
            page.wait_for_timeout(120)
            preview_open = page.locator("#pdfPreviewModal").evaluate("element => element.style.display === 'flex'")
            selection_in_preview = page.locator("#pdfPreviewModal #pageRows [data-pg]").count() == 2 and page.locator("#moreMenu #pageRows").count() == 0
            initial_page_count = page.locator("#pagesIncludedCount").inner_text().startswith("2 pages")
            checks.append(("Preview page count reflects current Advanced-mode selection", initial_page_count))
            index_checkbox = page.locator('#pageRows [data-pg="index"] input[type="checkbox"]')
            index_checkbox.uncheck()
            page.wait_for_function("document.getElementById('pdfPreviewMeta').textContent.startsWith('1 page')", timeout=5000)
            selection_updates_preview = page.locator("#pdfPreviewMeta").inner_text().startswith("1 page")
            index_checkbox.check()  # phone preview has no Select all button; re-tick the page instead
            page.wait_for_function("document.getElementById('pdfPreviewMeta').textContent.startsWith('2 pages')", timeout=5000)
            select_all_updates_preview = page.locator("#pdfPreviewMeta").inner_text().startswith("2 pages")
            page.set_viewport_size({"width": 320, "height": 740})
            page.wait_for_timeout(60)
            preview_fits_small_mobile = page.evaluate("""() => {
              const modal = document.getElementById('pdfPreviewModal').getBoundingClientRect();
              const card = document.querySelector('.pdf-preview-card').getBoundingClientRect();
              return document.documentElement.scrollWidth <= innerWidth && modal.left >= 0 && modal.right <= innerWidth && card.left >= 0 && card.right <= innerWidth;
            }""")
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(40)
            page.keyboard.press("Escape")
            page.wait_for_timeout(80)
            preview_closed = page.locator("#pdfPreviewModal").evaluate("element => element.style.display === 'none'")
            checks.append(("Preview PDF opens with page selection controls", preview_open and selection_in_preview))
            checks.append(("Included-page checkbox refreshes the PDF preview", selection_updates_preview))
            checks.append(("Select all refreshes the preview", select_all_updates_preview))

            # Several subjects: "Download individually" saves one PDF per subject, each with the ticked pages (cover + index).
            page.locator("#downloadOptionsBtn").click()
            page.locator("#previewPdfMenuBtn").click()
            page.wait_for_timeout(300)
            hidden_for_single = page.locator("#downloadIndividualPdfBtn").is_hidden()
            page.locator("#multiSubjectExportCheck").check()
            page.locator("#clearAllSubjectsBtn").click()
            page.locator("#subjectRows input[type=checkbox]").nth(0).check()
            hidden_for_one_subject = page.locator("#downloadIndividualPdfBtn").is_hidden()
            page.locator("#subjectRows input[type=checkbox]").nth(1).check()
            page.locator("#subjectRows input[type=checkbox]").nth(2).check()
            individual_label = page.locator("#downloadIndividualPdfBtn").inner_text()
            visible_for_several = page.locator("#downloadIndividualPdfBtn").is_visible()
            page.wait_for_function("!document.getElementById('downloadIndividualPdfBtn').disabled", timeout=5000)
            page.evaluate("""() => {
              window.__saves = [];
              window.captureDocPages = async (_target, _scale, options = {}) => {
                for (const _key of window.pdfPages()) {
                  const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
                  canvas.toDataURL = () => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD';
                  await options.onPage?.(canvas);
                }
              };
              window.jspdf = { jsPDF: class { constructor() { this.images = 0; } addImage() { this.images++; } addPage() {} save(name) { window.__saves.push({ name, images: this.images }); } output() { return new ArrayBuffer(8); } } };
            }""")
            page.locator("#downloadIndividualPdfBtn").click()
            page.wait_for_timeout(60)
            if page.locator("#checkAnyway").evaluate("element => getComputedStyle(element).display !== 'none'"):
                page.locator("#checkAnyway").click()
            page.wait_for_function("window.__saves.length === 3 && !window.coverdraftIsExportBusy()", timeout=15000)
            saves = page.evaluate("window.__saves")
            names = [item["name"] for item in saves]
            checks.append(("Download individually is offered only for two or more subjects", hidden_for_single and hidden_for_one_subject and visible_for_several and individual_label.strip() == "Download individually • 3 files"))
            checks.append(("Download individually saves one PDF per subject with cover and index in each", len(saves) == 3 and len(set(names)) == 3 and all(name.endswith(".pdf") for name in names) and all(item["images"] == 2 for item in saves)))
            checks.append(("Preview dialog fits a 320px mobile viewport", preview_fits_small_mobile))
            checks.append(("Preview dialog closes with Escape", preview_closed))

            # Build a real OOXML package in Chromium, then validate the ZIP and XML parts in Python.
            docx_result = page.evaluate("""async () => {
              const result = await window.coverdraftCreateCurrentPageDocx();
              const bytes = result.bytes;
              let binary = '';
              for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
              }
              return {base64: btoa(binary), filename: result.filename, pageKey: result.pageKey, isZip: bytes[0] === 0x50 && bytes[1] === 0x4b};
            }""")
            docx_bytes = base64.b64decode(docx_result["base64"])
            with zipfile.ZipFile(io.BytesIO(docx_bytes)) as docx_zip:
                bad_member = docx_zip.testzip()
                names = set(docx_zip.namelist())
                required_parts = {"[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"}
                parts_present = required_parts.issubset(names)
                xml_valid = all(ET.fromstring(docx_zip.read(name)) is not None for name in required_parts)
                document_root = ET.fromstring(docx_zip.read("word/document.xml"))
                doc_text = " ".join(node.text or "" for node in document_root.iter() if node.tag.endswith("}t"))
            checks.append(("DOCX export builds an intact OOXML ZIP package", docx_result["isZip"] and bad_member is None and parts_present and xml_valid))
            checks.append(("DOCX document contains editable page content and a page-specific filename", bool(doc_text.strip()) and docx_result["filename"].endswith(".docx") and docx_result["pageKey"] == "index"))

            # Verify the large blue action requests only the active editor page, independently of the page checklist.
            page.evaluate("""() => {
              window.__currentPagePdfCapture = null;
              window.__coverdraftDownloads = [];
              window.captureDocPages = async (_target, _scale, options = {}) => {
                window.__currentPagePdfCapture = { onlyCurrentPage: Boolean(options.onlyCurrentPage), pageKey: options.pageKey };
                const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
                canvas.toDataURL = () => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD';
                await options.onPage?.(canvas, 0);
              };
              window.jspdf = { jsPDF: class { addImage() {} addPage() {} output() { return new ArrayBuffer(8); } } };
              HTMLAnchorElement.prototype.__coverdraftOriginalClick = HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click = function () { window.__coverdraftDownloads.push(this.download); };
            }""")
            page.locator("#exportPdfBtn").click()
            page.wait_for_timeout(30)
            if page.locator("#checkAnyway").evaluate("element => getComputedStyle(element).display !== 'none'"):
                page.locator("#checkAnyway").click()
            page.wait_for_function("window.__currentPagePdfCapture !== null && !window.coverdraftIsExportBusy()", timeout=5000)
            pdf_behavior = page.evaluate("""() => {
              HTMLAnchorElement.prototype.click = HTMLAnchorElement.prototype.__coverdraftOriginalClick;
              return {capture: window.__currentPagePdfCapture, currentPage: currentPageKey, filename: window.__coverdraftDownloads[0] || ''};
            }""")
            checks.append(("Primary Download PDF captures only the page currently open", pdf_behavior["capture"] and pdf_behavior["capture"]["onlyCurrentPage"] and pdf_behavior["capture"]["pageKey"] == pdf_behavior["currentPage"] and pdf_behavior["filename"].endswith("_Index.pdf")))

            # Saved layouts have no separate dialog: save, import and export all live in the university picker.
            page.locator("#uniPresetSelect").click()
            footer_ids = page.locator("#uniPresetPopover .preset-footer .preset-action:visible").evaluate_all("buttons => buttons.map((b) => b.id)")
            page.keyboard.press("Escape")
            checks.append(("Picker footer offers Save current layout and Open a Word file", page.locator("#libModal").count() == 0 and footer_ids == ["presetSaveTemplate", "presetOpenWordFile"]))

            # Template registry: every folder under src/templates/ must reach the pickers, the preset loader and the built-in list.
            registry = page.evaluate("""() => {
                const ids = UNIVERSITY_LIST.map((u) => u.id);
                const values = (id) => [...document.getElementById(id).options].map((o) => o.value).filter((v) => ids.includes(v));
                const presets = ids.map((id) => {
                    loadUniversityPreset(id);
                    return { id, cover: documentPages.cover.length > 0, crest: getLogoMarkup().length > 40, style: activeTemplateId === UNI_CONFIGS[id].styleId };
                });
                loadUniversityPreset(ids[0]);
                return {
                    ids,
                    pickers: ['uniPresetSelect', 'qsUniversity', 'batchUniSelect'].map((id) => JSON.stringify(values(id)) === JSON.stringify(ids)),
                    presets,
                    courses: ids.every((id) => UNIVERSITY_SEMESTER_COURSES[id] && Object.keys(UNIVERSITY_SEMESTER_COURSES[id]).length > 0)
                };
            }""")
            checks.append(("University pickers list every template folder in order", len(registry["ids"]) >= 6 and all(registry["pickers"])))
            checks.append(("Every template loads a cover layout, crest and style", all(item["cover"] and item["crest"] and item["style"] for item in registry["presets"])))
            checks.append(("Every template ships subjects", registry["courses"]))
            # University picker: footer actions, hover edit buttons, and the edit dialog.
            page.locator("#moreMenuBtn").click()
            more_has_layout_items = page.locator("#moreMenu #saveLayoutTemplateBtn, #moreMenu #libBtn").count()
            page.keyboard.press("Escape")
            page.locator("#uniPresetSelect").click()
            footer_actions = page.locator("#uniPresetPopover .preset-footer .preset-action:visible").count()
            lpu_item = page.locator('#uniPresetMenu .preset-item[data-value="lpu"]')
            lpu_item.hover()
            edit_visible = lpu_item.locator(".preset-edit").evaluate("button => Number(getComputedStyle(button).opacity) === 1")
            custom_has_edit = page.locator('#uniPresetMenu .preset-item[data-value="custom"] .preset-edit').count()
            checks.append(("Layout actions live in the university picker footer", more_has_layout_items == 0 and footer_actions == 2))
            checks.append(("Universities show an edit button on hover, the freeform option does not", edit_visible and custom_has_edit == 0))
            lpu_item.locator(".preset-edit").click()
            page.wait_for_timeout(150)
            dialog_open = page.locator("#uniEditModal").evaluate("el => getComputedStyle(el).display !== 'none'")
            page.locator("#uniEditLabel").fill("LPU (Phagwara) Test")
            page.locator("#uniEditShortName").fill("LPU-T")
            page.locator("#uniEditName").fill("LPU Test University")
            page.locator("#uniEditSave").click()
            page.wait_for_timeout(150)
            renamed = page.evaluate("""() => ({
                option: [...document.getElementById('uniPresetSelect').options].find((o) => o.value === 'lpu').dataset.long,
                quick: [...document.getElementById('qsUniversity').options].find((o) => o.value === 'lpu').textContent,
                cover: UNI_CONFIGS.lpu.name,
                stored: !!localStorage.getItem('coverdraft_university_overrides_v1')
            })""")
            checks.append(("Editing a university renames it in every picker and persists the edit", dialog_open and renamed["option"] == "LPU (Phagwara) Test" and renamed["quick"] == "LPU (Phagwara) Test" and renamed["cover"] == "LPU Test University" and renamed["stored"]))

            # Default layout: use the page on screen, then go back to the built-in version.
            layout_edit = page.evaluate("""() => {
                loadUniversityPreset('lpu');
                const builtIn = JSON.stringify(documentPages.cover.map((e) => e.id));
                documentPages.cover.pop();
                canvasElements = documentPages.cover;
                return { builtIn, edited: documentPages.cover.length };
            }""")
            page.locator("#uniPresetSelect").click()
            page.locator('#uniPresetMenu .preset-item[data-value="lpu"]').hover()
            page.locator('#uniPresetMenu .preset-item[data-value="lpu"] .preset-edit').click()
            page.locator("#uniEditUseCurrent").check()
            page.locator("#uniEditSave").click()
            page.wait_for_timeout(150)
            after_default = page.evaluate("() => { loadUniversityPreset('lpu'); return documentPages.cover.length; }")
            page.locator("#uniPresetSelect").click()
            page.locator('#uniPresetMenu .preset-item[data-value="lpu"]').hover()
            page.locator('#uniPresetMenu .preset-item[data-value="lpu"] .preset-edit').click()
            page.locator("#uniEditResetAll").click()
            page.wait_for_timeout(150)
            page.locator("#confirmOk").click()
            page.wait_for_timeout(150)
            after_reset = page.evaluate("() => { loadUniversityPreset('lpu'); return { ids: JSON.stringify(documentPages.cover.map((e) => e.id)), label: [...document.getElementById('uniPresetSelect').options].find((o) => o.value === 'lpu').dataset.long, stored: localStorage.getItem('coverdraft_university_overrides_v1') }; }")
            checks.append(("A university's default layout can be replaced by the current page and restored", after_default == layout_edit["edited"] and after_reset["ids"] == layout_edit["builtIn"] and after_reset["stored"] is None and after_reset["label"].startswith("Lovely Professional")))

            # Saved layouts live in the same picker: save from the footer, select, rename and delete from the list.
            page.once("dialog", lambda dialog: dialog.accept("Lab file"))
            page.locator("#uniPresetSelect").click()
            page.locator("#presetSaveTemplate").click()
            page.wait_for_function("document.querySelectorAll('#savedLayoutOptions option[value^=\"saved-format:\"]').length === 1", timeout=5000)
            shown_in_picker = page.evaluate("[...document.getElementById('uniPresetSelect').selectedOptions].map((o) => o.textContent).join() === 'Lab file'")
            in_library = page.evaluate("window.coverdraftFormats.libAll().then((rows) => rows.some((row) => row.pack.name === 'Lab file'))")
            page.locator("#uniPresetSelect").click()
            saved_item = page.locator('#uniPresetMenu .preset-item[data-value^="saved-format:"]')
            saved_listed = saved_item.count() == 1
            saved_item.hover()
            saved_item.locator(".preset-edit").click()
            page.locator("#uniEditLabel").fill("Lab file v2")
            page.locator("#uniEditSave").click()
            page.wait_for_function("document.querySelector('#savedLayoutOptions option[value^=\"saved-format:\"]').textContent === 'Lab file v2'", timeout=5000)
            # Switch to a university, then pick the saved layout again: it replaces the page and the picker shows its name.
            page.evaluate("() => { const s = document.getElementById('uniPresetSelect'); s.value = 'aktu'; s.dispatchEvent(new Event('change', { bubbles: true })); }")
            page.wait_for_timeout(150)
            page.locator("#uniPresetSelect").click()
            page.locator('#uniPresetMenu .preset-item[data-value^="saved-format:"]').click()
            page.wait_for_timeout(200)
            confirm_shown = page.locator("#confirmModal").evaluate("el => getComputedStyle(el).display !== 'none'")
            skip_offered = page.locator("#confirmSkip").is_visible()
            page.locator("#confirmOk").click()
            page.wait_for_timeout(300)
            applied = page.evaluate("[...document.getElementById('uniPresetSelect').selectedOptions].map((o) => o.textContent).join() === 'Lab file v2' && documentPages.cover.length > 0")
            checks.append(("Saved layouts from the library are listed, selectable and renamable in the picker", shown_in_picker and in_library and saved_listed and applied))
            checks.append(("Replacing a layout asks first and offers Don't show this again", confirm_shown and skip_offered))

            # Escape cancels without remembering the checkbox and puts the previous university back.
            page.evaluate("() => { const s = document.getElementById('uniPresetSelect'); s.value = 'aktu'; s.dispatchEvent(new Event('change', { bubbles: true })); }")
            page.wait_for_timeout(150)
            page.locator("#uniPresetSelect").click()
            page.locator('#uniPresetMenu .preset-item[data-value^="saved-format:"]').click()
            page.wait_for_timeout(200)
            page.locator("#confirmSkip").check()
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
            cancelled = page.evaluate("document.getElementById('uniPresetSelect').value === 'aktu' && getComputedStyle(document.getElementById('confirmModal')).display === 'none' && !localStorage.getItem('coverdraft_hidden_prompts_v1')")
            checks.append(("Cancelling the replace prompt keeps the page and never remembers the checkbox", cancelled))

            # Confirming with the checkbox ticked skips the prompt from then on.
            page.locator("#uniPresetSelect").click()
            page.locator('#uniPresetMenu .preset-item[data-value^="saved-format:"]').click()
            page.wait_for_timeout(200)
            page.locator("#confirmSkip").check()
            page.locator("#confirmOk").click()
            page.wait_for_timeout(300)
            page.evaluate("() => { const s = document.getElementById('uniPresetSelect'); s.value = 'aktu'; s.dispatchEvent(new Event('change', { bubbles: true })); }")
            page.wait_for_timeout(150)
            page.locator("#uniPresetSelect").click()
            page.locator('#uniPresetMenu .preset-item[data-value^="saved-format:"]').click()
            page.wait_for_timeout(300)
            skipped = page.evaluate("getComputedStyle(document.getElementById('confirmModal')).display === 'none' && document.getElementById('uniPresetSelect').selectedOptions[0].textContent === 'Lab file v2'")
            page.locator("#moreMenuBtn").click()
            no_reset_item = page.locator("#resetHiddenPromptsBtn").count() == 0
            page.keyboard.press("Escape")
            remembered = page.evaluate("JSON.parse(localStorage.getItem('coverdraft_hidden_prompts_v1') || '[]').includes('replace-layout')")
            page.evaluate("localStorage.removeItem('coverdraft_hidden_prompts_v1')")
            checks.append(("Don't show this again skips the replace prompt, with no menu item to bring it back", skipped and no_reset_item and remembered))
            page.locator("#uniPresetSelect").click()
            page.locator('#uniPresetMenu .preset-item[data-value^="saved-format:"]').hover()
            page.locator('#uniPresetMenu .preset-item[data-value^="saved-format:"] .preset-del').click()
            page.wait_for_timeout(150)
            delete_asks = page.locator("#confirmModal").evaluate("el => getComputedStyle(el).display !== 'none'") and page.locator("#confirmOk").evaluate("el => el.classList.contains('btn-danger')") and page.locator("#confirmSkip").is_visible()
            page.locator("#confirmOk").click()
            page.wait_for_function("document.querySelectorAll('#savedLayoutOptions option[value^=\"saved-format:\"]').length === 0", timeout=5000)
            gone = page.evaluate("window.coverdraftFormats.libAll().then((rows) => rows.length === 0)")
            checks.append(("Deleting a saved layout asks first (with Don't show this again) and removes it from the library", gone and delete_asks))
            page.keyboard.press("Escape")

            # Built-in universities can be deleted from the pickers and restored from the picker footer.
            page.locator("#uniPresetSelect").click()
            lpu_item = page.locator('#uniPresetMenu .preset-item[data-value="lpu"]')
            lpu_item.hover()
            lpu_item.locator(".preset-del").click()
            page.wait_for_timeout(150)
            page.locator("#confirmOk").click()
            page.wait_for_timeout(200)
            after_delete = page.evaluate("""() => ({
                picker: [...document.getElementById('uniPresetSelect').options].some((o) => o.value === 'lpu'),
                quick: [...document.getElementById('qsUniversity').options].some((o) => o.value === 'lpu'),
                batch: [...document.getElementById('batchUniSelect').options].some((o) => o.value === 'lpu'),
                menuItem: !!document.querySelector('#uniPresetMenu .preset-item[data-value="lpu"]'),
                restoreShown: !document.getElementById('presetRestoreUniversities').hidden
            })""")
            page.locator("#uniPresetSelect").click()
            page.locator("#presetRestoreUniversities").click()
            page.wait_for_timeout(200)
            after_restore = page.evaluate("""() => ({
                picker: [...document.getElementById('uniPresetSelect').options].map((o) => o.value).join(),
                stored: localStorage.getItem('coverdraft_university_overrides_v1')
            })""")
            checks.append(("Deleting a built-in university removes it from every picker", not after_delete["picker"] and not after_delete["quick"] and not after_delete["batch"] and not after_delete["menuItem"] and after_delete["restoreShown"]))
            checks.append(("Deleted universities return in order from the picker footer", after_restore["picker"].startswith("ptu,lpu,cu,pec,aktu") and after_restore["stored"] is None))

            # The last visible university cannot be deleted.
            last_guard = page.evaluate("""() => {
                const ids = UNIVERSITY_LIST.map((u) => u.id);
                const results = ids.map((id) => window.coverdraftUniversities.remove(id));
                const remaining = [...document.getElementById('uniPresetSelect').options].filter((o) => UNI_CONFIGS[o.value]).length;
                window.coverdraftUniversities.restoreAll();
                return { removedAll: results.every(Boolean), remaining };
            }""")
            checks.append(("At least one university always stays in the list", not last_guard["removedAll"] and last_guard["remaining"] == 1))

            # Add student profile opens under the More actions button, not at the far side of the screen.
            original_viewport = page.viewport_size
            page.set_viewport_size({"width": 1280, "height": 800})
            page.wait_for_timeout(150)
            page.locator("#moreMenuBtn").click()
            page.locator("#addStudentProfileBtn").click()
            page.wait_for_timeout(250)
            geometry = page.evaluate("""() => {
                const button = document.getElementById('moreMenuBtn').getBoundingClientRect();
                const card = document.querySelector('#studentQuickStart .qs-card').getBoundingClientRect();
                return { rightGap: Math.abs(card.right - button.right), below: card.top >= button.bottom, width: card.width };
            }""")
            page.keyboard.press("Escape")
            page.set_viewport_size(original_viewport)
            checks.append(("Add student profile opens anchored under the More actions button", geometry["rightGap"] <= 13 and geometry["below"]))

            # Open a Word file lives in the university picker footer, not in More actions.
            page.locator("#moreMenuBtn").click()
            word_in_more = page.locator("#importDocumentBtn").count()
            page.keyboard.press("Escape")
            page.locator("#uniPresetSelect").click()
            with page.expect_file_chooser() as chooser:
                page.locator("#presetOpenWordFile").click()
            word_input_used = chooser.value.element.evaluate("el => el.id") == "documentImportInput"
            checks.append(("Open a Word file lives in the university picker, not More actions", word_in_more == 0 and word_input_used))

            # Third-party scripts carry an integrity hash (and CORS mode) once one is recorded.
            cdn = page.evaluate("""() => {
                const names = Object.keys(CDN_LIBRARIES);
                const before = createCdnScript('jspdf');
                const saved = CDN_LIBRARIES.jspdf.integrity;
                CDN_LIBRARIES.jspdf.integrity = 'sha384-' + 'A'.repeat(64);
                const hashed = createCdnScript('jspdf');
                CDN_LIBRARIES.jspdf.integrity = saved;
                return { names, pinned: names.every((n) => /\\/\\d+\\.\\d+\\.\\d+\\//.test(CDN_LIBRARIES[n].url)), plainHasIntegrity: !!before.integrity || !saved, hashedIntegrity: hashed.integrity, hashedCors: hashed.crossOrigin };
            }""")
            checks.append(("CDN libraries are pinned and scripts carry integrity and CORS attributes when a hash exists", len(cdn["names"]) == 4 and cdn["pinned"] and cdn["hashedIntegrity"].startswith("sha384-") and cdn["hashedCors"] == "anonymous"))

            # Header and menu: the profile switcher lives at the top of More actions; the command palette is gone.
            checks.append(("Header has no profile icon and no command palette", page.locator("#studentProfileBtn").count() == 0 and page.locator("#commandPalette").count() == 0 and page.locator("#openCommandPaletteBtn").count() == 0))
            page.locator("#moreMenuBtn").click()
            first_menu_child = page.locator("#moreMenu").evaluate("menu => menu.firstElementChild.id")
            switcher_visible = page.locator("#studentProfileSwitchSelect").is_visible()
            page.locator("#addStudentProfileBtn").click()
            page.wait_for_timeout(150)
            menu_closed = not page.locator("#moreMenu").evaluate("menu => menu.classList.contains('open')")
            quick_start_open = page.locator("#studentQuickStart").evaluate("el => el.classList.contains('open')")
            checks.append(("Student profile switcher sits first in More actions and Add profile works", first_menu_child == "studentProfileSwitcher" and switcher_visible and menu_closed and quick_start_open))
            page.keyboard.press("Escape")

            # Focus styling: fields use a thin accent border, never a heavy offset outline.
            page.locator("#uniPresetSelect").focus()
            select_focus = page.evaluate("""() => {
                const picker = document.querySelector('.top-university-picker');
                const select = document.getElementById('uniPresetSelect');
                return { outline: getComputedStyle(select).outlineStyle, wrapperBorder: getComputedStyle(picker).borderTopColor, wrapperGlow: getComputedStyle(picker).boxShadow !== 'none' };
            }""")
            checks.append(("Focused university picker shows a border glow, not a heavy outline", select_focus["outline"] == "none" and select_focus["wrapperGlow"]))
            page.locator("#openCourseSwitcherTopBtn").click()
            page.wait_for_timeout(300)
            search_style = page.evaluate("""() => {
                const input = document.getElementById('batchSubjectSearch');
                const wrap = input.closest('.batch-search-wrap');
                return { outline: getComputedStyle(input).outlineStyle, inputShadow: getComputedStyle(input).boxShadow, wrapGlow: getComputedStyle(wrap).boxShadow !== 'none' };
            }""")
            checks.append(("Subject library search shows a single soft focus state", search_style["outline"] == "none" and search_style["inputShadow"] == "none" and search_style["wrapGlow"]))
            page.keyboard.press("Escape")

            # Exercise the actual IndexedDB format library on a same-origin browser context:
            # create, update by stable ID, read back, and remove a local format.
            format_result = page.evaluate("""async () => {
              const F = window.coverdraftFormats;
              const pack = F.buildPack('Smoke-test layout');
              const id = pack.id;
              await F.libPut(pack);
              const saved = (await F.libAll()).find(row => row.id === id);
              await F.libPut({...pack, name: 'Smoke-test layout updated'});
              const rowsAfterUpdate = await F.libAll();
              const updated = rowsAfterUpdate.find(row => row.id === id);
              await F.libDel(id);
              const removed = !(await F.libAll()).some(row => row.id === id);
              return {
                saved: Boolean(saved && saved.pack.name === 'Smoke-test layout'),
                updateKeepsSingleRecord: rowsAfterUpdate.filter(row => row.id === id).length === 1,
                updatedName: updated?.pack.name === 'Smoke-test layout updated',
                removed
              };
            }""")
            checks.append(("Saved formats persist in browser storage", format_result["saved"]))
            checks.append(("Saving an existing format updates it without duplicates", format_result["updateKeepsSingleRecord"] and format_result["updatedName"]))
            checks.append(("A saved format can be removed cleanly", format_result["removed"]))

            # Exercise the actual import coordinator with deterministic converter mocks. The production
            # build lazily loads pinned CDN converters; this smoke uses representative extraction output.
            import_result = page.evaluate("""async () => {
              const store = Object.create(null);
              Object.defineProperty(window, 'localStorage', { configurable: true, value: {
                getItem: key => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
                setItem: (key, value) => { store[key] = String(value); },
                removeItem: key => { delete store[key]; }
              }});
              window.saveDocumentToLocalStorage = () => {
                store['coverdraft_document_v1'] = JSON.stringify({
                  documentPages, currentPageKey, currentUniKey, currentFormData, experimentsList,
                  savedAt: new Date().toISOString()
                });
                return true;
              };
              window.scheduleAutoCompile = () => {};
              window.mammoth = { convertToHtml: async () => ({
                value: '<h1>Imported assignment title</h1><p>A normal paragraph from Word.</p><ul><li>Editable list item</li></ul><table><tbody><tr><td>Column A</td><td>Column B</td></tr></tbody></table>',
                messages: []
              }) };
              const wordFile = new File([new Uint8Array([0x50,0x4b,0x03,0x04])], 'Sample-Assignment.docx', {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
              await window.coverdraftImportDocumentFile(wordFile);
              const firstKey = currentPageKey;
              const wordText = documentPages[firstKey]?.map(element => element.text).join(' ') || '';
              const wordImported = /^import-\\d+$/.test(firstKey) && wordText.includes('Imported assignment title') && wordText.includes('Column A') && document.querySelector(`.view-tab[data-page="${firstKey}"]`) && document.querySelector(`#pageRows [data-pg="${firstKey}"] input`).checked;
              const allPages = document.querySelectorAll('.view-tab.imported-page-tab').length === 1 && document.querySelectorAll('#pageRows .imported-page-row').length === 1;
              const selectedForPreview = window.pdfPages().includes(firstKey);
              window.saveDocumentToLocalStorage();
              // Simulate a reload while retaining the normal shell and stored draft.
              const builtInPages = documentPages;
              document.querySelectorAll('.view-tab.imported-page-tab, #pageRows .imported-page-row').forEach(node => node.remove());
              documentPages = {cover: builtInPages.cover || [], index: builtInPages.index || []};
              currentPageKey = 'cover';
              canvasElements = documentPages.cover;
              window.loadDocumentFromLocalStorage();
              window.coverdraftSyncImportedPages();
              const restoredKeys = Object.keys(documentPages).filter(key => /^import-\\d+$/.test(key));
              const hasImportedText = Boolean(documentPages[firstKey]?.some(element => String(element.text || '').includes('Imported assignment title')));
              const currentPageAfterRestore = currentPageKey;
              const selectedAfterRestore = window.pdfPages().includes(firstKey);
              const persisted = restoredKeys.includes(firstKey) && hasImportedText && currentPageAfterRestore === 'cover' && selectedAfterRestore;
              const beforeRejectedImports = JSON.stringify(Object.keys(documentPages).sort());
              window.mammoth = { convertToHtml: async () => ({
                value: '<p>Student Name: Alex Chen</p><p>UID: 123456</p><p>' + 'x'.repeat(120001) + '</p>',
                messages: []
              }) };
              await window.coverdraftImportDocumentFile(new File([new Uint8Array([0x50,0x4b,0x03,0x04])], 'Oversized-structured.docx'));
              const oversizedRejected = document.getElementById('toastMsg').textContent.includes('too much text')
                && JSON.stringify(Object.keys(documentPages).sort()) === beforeRejectedImports;
              await window.coverdraftImportDocumentFile(new File(['%PDF-1.7'], 'not-editable.pdf', {type:'application/pdf'}));
              const unsupportedPdfRejected = document.getElementById('toastMsg').textContent.includes('Only DOCX files are supported')
                && JSON.stringify(Object.keys(documentPages).sort()) === beforeRejectedImports;
              window.coverdraftConfirm = async () => true;
              document.getElementById('clearImportedPagesBtn').click();
              await new Promise((resolve) => setTimeout(resolve, 80));
              const cleared = Object.keys(documentPages).every(key => !/^import-\\d+$/.test(key)) && document.querySelectorAll('.view-tab.imported-page-tab').length === 0;
              return {wordImported, allPages, selectedForPreview, persisted, oversizedRejected, unsupportedPdfRejected, restoredKeys, firstKey, hasImportedText, currentPageAfterRestore, selectedAfterRestore, cleared};
            }""")
            checks.append(("DOCX import converts headings, paragraphs, lists, and table rows into editable page elements", import_result["wordImported"]))
            checks.append(("Imported DOCX pages appear in navigation and PDF page-selection controls", import_result["allPages"] and import_result["selectedForPreview"]))
            checks.append(("Imported DOCX content and inclusion selection survive local-draft restoration", import_result["persisted"]))
            checks.append(("Text limits apply even when a DOCX contains recognizable cover fields", import_result["oversizedRejected"]))
            checks.append(("PDF files are rejected by the DOCX importer without changing the draft", import_result["unsupportedPdfRejected"]))
            checks.append(("Removing imported pages clears only imported tabs and layouts", import_result["cleared"]))

            # Layout and parser regression checks.
            regression = page.evaluate("""() => {
              const tiny = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
              documentPages['import-9'] = [
                {id:'bg_r', type:'image', x:97, y:0, w:600, h:1123, src:tiny, preserveOriginal:true},
                {id:'mask_r', type:'shape', x:197, y:100, w:200, h:40, bg:'#ffffff', preserveOriginalMask:true},
                {id:'txt_r', x:200, y:105, w:194, size:14, lineHeight:1.2, text:'x', customContent:'x'}
              ];
              const ratio = () => { const [b,m,t] = documentPages['import-9']; return [(m.x-b.x)/b.w, (m.y-b.y)/b.h, (t.x-b.x)/b.w, (t.y-b.y)/b.h]; };
              const start = ratio();
              const keptRatios = ['letter', 'a5', 'a3', 'a4'].every((size) => { setPageSize(size); return ratio().every((v, i) => Math.abs(v - start[i]) < 0.002); });
              const lineHeightStable = documentPages['import-9'][2].lineHeight === 1.2;
              delete documentPages['import-9'];
              document.getElementById('qsInstructionBox').value = 'Faculty: Dr. A Kumar\\nSemester: 5th\\nCourse Code: BTCS-501\\n1. Implement stack\\n2. Implement queue';
              document.getElementById('qsParseBtn').click();
              const preview = document.getElementById('qsParsePreview').textContent;
              const parsed = preview.includes('2 experiments') && preview.includes('Dr. A Kumar') && !preview.includes('Subject: Code');
              return {keptRatios, lineHeightStable, parsed};
            }""")
            checks.append(("Saved image backgrounds keep overlays aligned across paper sizes", regression["keptRatios"] and regression["lineHeightStable"]))
            checks.append(("Quick Start extracts faculty, semester and numbered experiments from pasted text", regression["parsed"]))

            docx_details = page.evaluate("""() => {
              const root = new DOMParser().parseFromString('<main><p>Chandigarh University, Mohali</p><p>Data Structures Lab (CS-301)</p><p>Submitted By: Riya Sharma</p><p>UID: 21BCS1234</p><p>Submitted To: Dr. Meera Kapoor</p><table><tr><td>S.No</td><td>Experiment</td><td>Date</td></tr><tr><td>1</td><td>Implement stack</td><td>12/08/2025</td></tr><tr><td>2</td><td>Implement queue</td><td>19/08/2025</td></tr></table></main>', 'text/html').querySelector('main');
              const blocks = [...root.querySelectorAll('p')].map((node) => ({ text: node.textContent, tableRow: false }));
              const d = window.coverdraftExtractDocxDetails(root, blocks);
              return d.uni === 'cu' && d.fields.name === 'Riya Sharma' && d.fields.uid === '21BCS1234' && d.fields.prof === 'Dr. Meera Kapoor'
                && d.fields.code === 'CS-301' && d.experiments.length === 2 && d.experiments[0].date === '12/08/2025';
            }""")
            checks.append(("DOCX import extracts cover details and index rows for the normal form", docx_details))

            page.locator("#mobileEditFab").click()
            page.wait_for_timeout(80)
            sidebar_open = "mobile-open" in (page.locator("#appSidebar").get_attribute("class") or "")
            # Done closes the sheet (at half height the page above it stays usable, so there is no blocking backdrop).
            page.locator("#sheetDoneBtn").click()
            page.wait_for_timeout(100)
            sidebar_closed = "mobile-open" not in (page.locator("#appSidebar").get_attribute("class") or "")
            checks.append(("Mobile details sheet opens at half height and closes with Done", sidebar_open and sidebar_closed))

            for width, height in ((320, 740), (360, 800), (390, 844), (768, 900), (1024, 768), (1440, 900)):
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(30)
                no_overflow = page.evaluate(
                    "document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth"
                )
                checks.append((f"No horizontal overflow at {width}px", no_overflow))
                if width <= 600:
                    # Regression guard: at <=380px a fixed grid once squeezed this button to a few pixels.
                    # It only showed in Simple mode (3 action buttons), so measure there and then restore the mode.
                    was_simple = page.evaluate("document.body.classList.contains('simple-mode')")
                    if not was_simple:
                        page.evaluate("document.getElementById('advancedModeSwitch').click()")
                        page.wait_for_timeout(60)
                    main_width = page.evaluate("document.getElementById('exportPdfBtn').getBoundingClientRect().width")
                    checks.append((f"Download PDF icon button stays a usable tap target at {width}px (Simple mode)", main_width >= 32))
                    if not was_simple:
                        page.evaluate("document.getElementById('advancedModeSwitch').click()")
                        page.wait_for_timeout(60)
        except Exception as error:
            checks.append((f"Smoke interaction completed ({type(error).__name__})", False))
            print(f"SMOKE ERROR: {error}")
        finally:
            # Quick Start applies the faculty it was given, and DOCX import keeps the sidebar form in sync.
            page.set_viewport_size({"width": 1440, "height": 900})
            page.evaluate("document.getElementById('quickStartBtn').click()")
            page.wait_for_timeout(120)
            page.fill("#qsName", "Test Student")
            page.fill("#qsProfessor", "Dr. Example Prof")
            page.click("#qsCreate")
            page.wait_for_timeout(250)
            quick_start = page.evaluate("""() => ({
              field: document.getElementById('field_prof')?.value,
              model: currentFormData.prof,
              cover: document.getElementById('page').innerText.includes('Dr. Example Prof')
            })""")
            checks.append(("Quick Start applies the faculty name to the form, data and cover", quick_start == {"field": "Dr. Example Prof", "model": "Dr. Example Prof", "cover": True}))
            docx_form = page.evaluate("""async () => {
              window.mammoth = { convertToHtml: async () => ({ value: '<p>Chandigarh University, Mohali</p><p>Data Structures Lab (CS-301)</p><p>Submitted By: Riya Sharma</p><p>UID: 21BCS1234</p><p>Submitted To: Dr. Meera Kapoor</p>', messages: [] }) };
              await window.coverdraftImportDocumentFile(new File([new Uint8Array([0x50,0x4b,0x03,0x04])], 'cover.docx'));
              await new Promise((resolve) => setTimeout(resolve, 250));
              return { name: document.getElementById('field_name')?.value, prof: document.getElementById('field_prof')?.value, model: currentFormData.name };
            }""")
            checks.append(("DOCX import fills the sidebar form as well as the cover", docx_form == {"name": "Riya Sharma", "prof": "Dr. Meera Kapoor", "model": "Riya Sharma"}))
            checks.append(("No uncaught JavaScript errors", not page_errors))
            if page_errors:
                for error in page_errors[:10]:
                    print(f"JAVASCRIPT ERROR: {error}")
            browser.close()

    return checks


def main() -> int:
    results = run_checks()
    for name, passed in results:
        print(("PASS" if passed else "FAIL"), name)
    passed_count = sum(passed for _, passed in results)
    print(f"Full-source browser smoke: {passed_count}/{len(results)} checks passed")
    return 0 if all(passed for _, passed in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
