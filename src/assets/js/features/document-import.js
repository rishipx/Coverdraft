/* Import DOCX text as editable pages. PDF attachments use the dedicated PDF merger. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TITLE_KEY = 'coverdraft_imported_page_titles_v1';
  const SETTINGS_KEY = 'coverdraft_pages_v2';
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_PAGES = 30;
  const MAX_TEXT_CHARS = 120000;
  const MAX_ELEMENTS = 4500;
  let mammothLibraryPromise = null;
  const importedKey = (key) => typeof key === 'string' && /^import-\d+$/.test(key);
  window.coverdraftIsImportedPageKey = importedKey;
  const safeRead = window.coverdraftStorage.get;
  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  };
  const getTitles = () => {
    const value = safeRead(TITLE_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  const setTitles = (value) => safeWrite(TITLE_KEY, value);
  const importedKeys = () => Object.keys(documentPages || {}).filter(importedKey).sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));
  const titleFor = (key) => String(getTitles()[key] || `Imported page ${Number(String(key).slice(7)) || ''}`).slice(0, 100);
  window.coverdraftPageTitle = (key) => importedKey(key) ? titleFor(key) : '';
  // Built-in pages occupy tab numbers 1-3, so imported pages continue from 4.
  const BUILT_IN_PAGE_COUNT = 3;
  const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
  function loadScriptOnce(globalName, libraryName, currentPromise) {
    if (window[globalName])
      return Promise.resolve(window[globalName]);
    if (currentPromise)
      return currentPromise;
    const promise = new Promise((resolve, reject) => {
      const script = createCdnScript(libraryName);
      script.dataset.coverdraftLibrary = globalName;
      script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error(`${globalName} loaded without exposing its API`));
      script.onerror = () => {
        script.remove();
        reject(new Error('Could not load the document converter. Connect to the internet and try again.'));
      };
      document.head.appendChild(script);
    });
    return promise;
  }
  function loadMammoth() {
    mammothLibraryPromise = loadScriptOnce('mammoth', 'mammoth', mammothLibraryPromise)
      .catch((error) => {
        mammothLibraryPromise = null;
        throw error;
      });
    return mammothLibraryPromise;
  }
  function pageDimensions() {
    const d = window.coverdraftPageDimensions?.() || { width: 794, height: 1123 };
    return { width: clamp(Number(d.width), 400, 1600), height: clamp(Number(d.height), 600, 2000) };
  }
  function lineElement(line, index, dimensions) {
    const text = String(line.text || '').replace(/\s+$/g, '').slice(0, 4000);
    if (!text.trim())
      return null;
    const fontSize = clamp(Number(line.size) || 12, 6, 52);
    const x = clamp(Number(line.x) || 44, 8, dimensions.width - 36);
    const y = clamp(Number(line.y) || 40, 8, dimensions.height - 24);
    const maxWidth = Math.max(32, dimensions.width - x - 20);
    const width = clamp(Number(line.w) || Math.max(fontSize * 2, text.length * fontSize * 0.48), 32, maxWidth);
    return {
      id: `imp_${index + 1}`,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      w: Math.round(width * 100) / 100,
      align: 'left',
      weight: line.weight || 'normal',
      size: Math.round(fontSize * 100) / 100,
      lineHeight: 1.35,
      color: '#111111',
      font: line.font || 'Arial, sans-serif',
      text,
      // Keep imported literal text from being interpreted as a Coverdraft {token} binding.
      customContent: line.html || escapeHtml(text).replace(/\n/g, '<br>')
    };
  }
  function escapeInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE)
      return escapeHtml(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE)
      return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'img')
      return '';
    const allowed = new Set(['strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'br']);
    const content = [...node.childNodes].map(escapeInlineNode).join('');
    if (!allowed.has(tag))
      return content;
    if (tag === 'br')
      return '<br>';
    return `<${tag}>${content}</${tag}>`;
  }
  function collectDocxBlocks(root) {
    const blocks = [];
    function visit(node) {
      for (const child of [...(node.children || [])]) {
        const tag = child.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag) || ['p', 'blockquote'].includes(tag)) {
          const text = String(child.textContent || '').trim();
          if (text)
            blocks.push({ node: child, tag, text, html: escapeInlineNode(child), tableRow: false });
        } else if (tag === 'table') {
          child.querySelectorAll('tr').forEach((tr) => {
            const cells = [...tr.querySelectorAll(':scope > th, :scope > td')].map((cell) => String(cell.textContent || '').trim());
            const text = cells.filter(Boolean).join('   |   ');
            if (text)
              blocks.push({ node: tr, tag: 'p', text, html: escapeHtml(text), tableRow: true });
          });
        } else if (tag === 'ul' || tag === 'ol') {
          child.querySelectorAll(':scope > li').forEach((li) => {
            const text = String(li.textContent || '').trim();
            if (text)
              blocks.push({ node: li, tag: 'li', text: `• ${text}`, html: `• ${escapeInlineNode(li)}`, tableRow: false });
          });
        } else if (tag === 'img') {
          // Images are not converted to editable text; keep text blocks and explain the limitation after import.
        } else if (child.children.length)
          visit(child);
        else {
          const text = String(child.textContent || '').trim();
          if (text)
            blocks.push({ node: child, tag: 'p', text, html: escapeHtml(text), tableRow: false });
        }
      }
    }
    visit(root);
    return blocks;
  }
  /* ---- DOCX detail extraction: read cover-page fields and the experiment list so the normal form can be used ---- */
  const FIELD_LABELS = [
    ['regNo', /^reg(?:istration)?\.?\s*(?:no\.?|number|#)$/i],
    ['usn', /^usn$/i],
    ['sid', /^(?:sid|student\s*id)(?:\s*\(sid\))?$/i],
    ['uid', /^(?:u\.?i\.?d\.?|university\s*uid|student\s*uid)$/i],
    ['secGroup', /^section\s*(?:&|and)\s*group$/i],
    ['subgroup', /^sub\s*-?\s*group$/i],
    ['section', /^(?:section|sec)(?:\s*code)?$/i],
    ['roll', /^(?:(?:class|university|college|tiet|entry)\s*(?:\/\s*)?)?roll\s*(?:no\.?|number|#)?(?:\s*\(.*\))?$/i],
    ['name', /^(?:student(?:'s)?\s*(?:full\s*)?name|candidate(?:'s)?\s*(?:full\s*)?name|name\s*of\s*(?:the\s*)?(?:student|candidate)|submitted\s*by|name)$/i],
    ['branch', /^(?:branch|programme?|stream)$/i],
    ['sem', /^(?:semester|sem)$/i],
    ['session', /^(?:academic\s*)?(?:session|year)$/i],
    ['code', /^(?:(?:course|subject|paper)\s*code|code)$/i],
    ['taskNo', /^(?:assignment|experiment|practical|task|assessment)\s*(?:no\.?|number|identifier|#)$/i],
    ['title', /^(?:subject|course|paper|lab(?:oratory)?|title|subject\s*name|course\s*(?:title|name)|assignment\s*title|lab\s*name)$/i],
    ['prof', /^(?:submitted\s*to|faculty(?:\s*(?:name|guide|in-?\s*charge))?|professor|teacher|instructor|evaluated\s*by|guided\s*by|supervisor|course\s*instructor)$/i],
    ['department', /^(?:department|dept\.?|school)$/i],
    ['college', /^(?:college|institute)$/i]
  ];
  const UNIVERSITY_HINTS = UNIVERSITY_LIST.map((u) => [u.id, new RegExp(u.detect, 'i')]);
  const labelFieldFor = (text) => {
    const key = String(text || '').replace(/\s+/g, ' ').replace(/[:–—-]+\s*$/, '').trim();
    if (!key || key.length > 40)
      return '';
    const hit = FIELD_LABELS.find(([, re]) => re.test(key));
    return hit ? hit[0] : '';
  };
  const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  function normaliseSemester(value) {
    const m = /\b([1-8])(?:st|nd|rd|th)?\b/i.exec(String(value || ''));
    return m ? ordinal(Number(m[1])) : '';
  }
  function tableRowsOf(root) {
    return [...root.querySelectorAll('table')].map((table) => [...table.querySelectorAll('tr')]
      .map((tr) => [...tr.querySelectorAll(':scope > th, :scope > td')].map((cell) => String(cell.textContent || '').replace(/\s+/g, ' ').trim())));
  }
  const DATE_RE = /^\d{1,2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{2,4}$/;
  function extractIndexRows(root, blocks) {
    let best = [];
    for (const rows of tableRowsOf(root)) {
      const headerIndex = rows.findIndex((cells) => cells.some((c) => /^(?:experiment|title|aim|topic|program|particulars?|name of|description|list of)/i.test(c)));
      let titleCol = -1, pageCol = -1, dateCol = -1, start = 0;
      if (headerIndex >= 0) {
        const header = rows[headerIndex];
        titleCol = header.findIndex((c) => /experiment|title|aim|topic|program|particular|name of|description/i.test(c) && !/^(?:s\.?\s*no|sr\.?\s*no|no)\.?$/i.test(c));
        pageCol = header.findIndex((c) => /page|p\.?\s*no|^pg/i.test(c));
        dateCol = header.findIndex((c) => /date/i.test(c));
        start = headerIndex + 1;
      }
      const found = [];
      for (const cells of rows.slice(start)) {
        if (!cells.length)
          continue;
        let title = titleCol >= 0 ? cells[titleCol] : '';
        if (!title) {
          if (headerIndex >= 0 || !/^\d+\.?$/.test(cells[0] || ''))
            continue;
          title = cells.slice(1).filter((c) => c && !/^\d{1,3}$/.test(c) && !DATE_RE.test(c)).sort((a, b) => b.length - a.length)[0] || '';
        }
        if (!title || title.length < 3 || labelFieldFor(title))
          continue;
        const date = dateCol >= 0 ? cells[dateCol] : (cells.find((c) => DATE_RE.test(c)) || '');
        const page = pageCol >= 0 ? cells[pageCol] : '';
        found.push({ title: title.slice(0, 160), page: /^\d{1,4}$/.test(page) ? page : '', date: DATE_RE.test(date) ? date : '' });
      }
      if (found.length > best.length)
        best = found;
    }
    if (best.length >= 2)
      return best.slice(0, 80);
    // No index table: accept an explicit run of "Experiment 1: …" / "1. …" paragraphs.
    const listed = [];
    for (const block of blocks) {
      if (block.tableRow)
        continue;
      const m = /^(?:exp(?:eriment)?\.?\s*(?:no\.?)?\s*\d+\s*[:.\-–)]\s*|\d{1,2}\s*[.)]\s+)(.{6,160})$/i.exec(block.text.trim());
      if (m && !labelFieldFor(m[1].split(':')[0]))
        listed.push({ title: m[1].trim(), page: '', date: '' });
    }
    return listed.length >= 3 ? listed.slice(0, 80) : best;
  }
  function extractDocxDetails(root, blocks) {
    const lines = blocks.map((b) => b.text.split(/\s+\|\s+|\t+/).map((s) => s.trim()).filter(Boolean)).filter((s) => s.length);
    const fields = {};
    const set = (id, value) => {
      const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!v || fields[id] || labelFieldFor(v))
        return;
      fields[id] = id === 'sem' ? (normaliseSemester(v) || v) : v;
    };
    const consumed = new Set();
    const pair = /^\s*([^:|]{2,40}?)\s*(?::|\s[-–—]\s)\s*(.*)$/;
    for (let li = 0; li < lines.length; li++) {
      if (consumed.has(li))
        continue;
      const segs = lines[li];
      const allLabelOnly = segs.length > 1 && segs.every((s) => labelFieldFor(s) && !/:\s*\S/.test(s));
      if (allLabelOnly && lines[li + 1]) {
        segs.forEach((s, i) => set(labelFieldFor(s), lines[li + 1][i]));
        consumed.add(li + 1);
        continue;
      }
      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        const m = pair.exec(seg);
        if (m && labelFieldFor(m[1])) {
          let value = m[2];
          if (!value)
            value = segs[si + 1] || (lines[li + 1] && lines[li + 1][0]) || '';
          set(labelFieldFor(m[1]), value);
        } else if (labelFieldFor(seg) && !m) {
          const next = segs[si + 1] || (lines[li + 1] && lines[li + 1][0]) || '';
          if (next && !labelFieldFor(next)) {
            set(labelFieldFor(seg), next);
            if (!segs[si + 1])
              consumed.add(li + 1);
            si++;
          }
        }
      }
    }
    // Unlabelled cover lines: institution, department, degree, semester, session, subject and code.
    const flat = lines.flat();
    const first = (re, max = 120) => flat.find((s) => s.length <= max && re.test(s) && !pair.test(s));
    const uniLine = first(/\b(?:university|institute\s+of\s+technology|institute|college)\b/i);
    let uni = '';
    for (const [key, re] of UNIVERSITY_HINTS)
      if (flat.slice(0, 12).some((s) => re.test(s))) {
        uni = key;
        break;
      }
    if (!uni && uniLine)
      fields.university = fields.university || uniLine;
    const dept = first(/^(?:department|dept\.?|school)\s+of\s+/i);
    if (dept)
      set('department', dept);
    const degree = first(/^(?:bachelor|master)\b/i);
    if (degree)
      set('degreeFull', degree);
    if (!fields.sem) {
      const s = flat.find((x) => /\b[1-8](?:st|nd|rd|th)\s*sem(?:ester)?\b/i.test(x) && x.length < 60);
      if (s)
        set('sem', s);
    }
    if (!fields.session) {
      const s = flat.find((x) => /\b20\d\d\s*[-–\/]\s*(?:20)?\d\d\b/.test(x) && x.length < 40);
      if (s)
        set('session', (/\b20\d\d\s*[-–\/]\s*(?:20)?\d\d\b/.exec(s) || [''])[0]);
    }
    if (!fields.title) {
      const s = first(/\b(?:lab(?:oratory)?|practical(?:\s+file)?|assignment|record|report)\b/i, 90);
      if (s && !/^(?:department|dept|school)\b/i.test(s) && !/\b(?:university|institute|college)\b/i.test(s))
        set('title', s.replace(/\s*\([^)]*\)\s*$/, ''));
    }
    if (!fields.code) {
      const s = flat.map((x) => /\(([A-Z]{2,5}\s?-?\s?\d{2,4}[A-Z]?)\)/.exec(x)).find(Boolean) || flat.map((x) => /^([A-Z]{2,5}\s?-?\s?\d{3,4}[A-Z]?)$/.exec(x)).find(Boolean);
      if (s)
        set('code', s[1]);
    }
    const experiments = extractIndexRows(root, blocks);
    return { fields, uni, experiments };
  }
  window.coverdraftExtractDocxDetails = extractDocxDetails;
  function applyDocxDetails(details) {
    const { fields, uni, experiments } = details;
    if (uni && typeof UNI_CONFIGS !== 'undefined' && UNI_CONFIGS[uni] && uni !== currentUniKey) {
      const select = $('uniPresetSelect');
      if (select)
        select.value = uni;
      loadUniversityPreset(uni);
    }
    const cfg = (typeof UNI_CONFIGS !== 'undefined' && UNI_CONFIGS[currentUniKey]) || { fields: [] };
    const available = new Set(cfg.fields.map((f) => f.id));
    const filled = [], skipped = [];
    Object.entries(fields).forEach(([id, value]) => {
      if (!available.has(id)) {
        skipped.push(id);
        return;
      }
      const input = $(`field_${id}`);
      if (input && (input.tagName !== 'SELECT' || [...input.options].some((option) => option.value === value)))
        input.value = value;
      currentFormData[id] = value;
      filled.push(id);
    });
    let rows = 0;
    if (experiments.length && typeof window.coverdraftAppendIndexEntries === 'function')
      rows = window.coverdraftAppendIndexEntries(experiments) ? experiments.length : 0;
    currentPageKey !== 'cover' && window.activateCoverdraftPageTab?.('cover');
    renderPageCanvas();
    scheduleAutoCompile();
    window.saveDocumentToLocalStorage?.();
    return { filled, skipped, rows };
  }
  async function convertDocx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const signature = new Uint8Array(arrayBuffer.slice(0, 4));
    if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4B)
      throw new Error('This file does not look like a valid DOCX package.');
    const mammoth = await loadMammoth();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const parsed = new DOMParser().parseFromString(`<main>${result.value || ''}</main>`, 'text/html');
    const content = parsed.querySelector('main');
    const blocks = collectDocxBlocks(content || parsed.body);
    if (!blocks.length)
      throw new Error('No editable text was found in this DOCX file.');
    const totalChars = blocks.reduce((sum, block) => sum + block.text.length, 0);
    if (totalChars > MAX_TEXT_CHARS || blocks.length > MAX_ELEMENTS)
      throw new Error('This Word document contains too much text to import safely. Try a smaller document.');
    const details = extractDocxDetails(content || parsed.body, blocks);
    const detailCount = Object.keys(details.fields).length;
    // Enough recognisable cover/index details: fill the normal form instead of building loose text pages.
    if (detailCount >= 2 || (detailCount >= 1 && details.experiments.length) || details.experiments.length >= 3)
      return { details };
    const dimensions = pageDimensions();
    const marginX = 50, usableWidth = dimensions.width - marginX * 2;
    let y = 48, pageNo = 1;
    const pages = [[]];
    blocks.forEach((block) => {
      const heading = /^h([1-6])$/.exec(block.tag);
      const size = heading ? [0, 26, 22, 19, 17, 15, 14][Number(heading[1])] : block.tag === 'blockquote' ? 12 : 13;
      const capacity = Math.max(24, Math.floor(usableWidth / (size * 0.53)));
      const lineCount = Math.max(1, Math.ceil(block.text.length / capacity));
      const estimatedHeight = Math.max(size * 1.45, lineCount * size * (heading ? 1.28 : 1.48)) + (heading ? 12 : 7);
      if (y + estimatedHeight > dimensions.height - 48) {
        if (pageNo >= MAX_PAGES)
          throw new Error(`This Word document exceeds ${MAX_PAGES} estimated pages. Import a smaller document.`);
        pages.push([]);
        pageNo++;
        y = 48;
      }
      const element = lineElement({
        text: block.text,
        html: block.html,
        x: marginX,
        y,
        w: usableWidth,
        size,
        weight: heading || block.tag === 'blockquote' ? 'bold' : 'normal',
        font: 'Arial, sans-serif'
      }, pages[pageNo - 1].length, dimensions);
      pages[pageNo - 1].push(element);
      y += estimatedHeight;
    });
    const fallbackNote = 'No cover details (name, roll no., subject…) were recognised, so the text was imported as editable text pages.';
    return { pages: pages.filter((page) => page.length), note: result.messages?.length ? `${fallbackNote} Some Word formatting or embedded objects could not be reproduced exactly.` : fallbackNote };
  }
  function syncImportedPages() {
    const tabs = document.querySelector('.view-tabs');
    const rows = $('pageRows');
    if (!tabs || !rows || typeof documentPages === 'undefined')
      return;
    const keys = importedKeys();
    // Drop tabs/rows whose page no longer exists (e.g. after undo or a restored draft).
    tabs.querySelectorAll('.imported-page-tab').forEach((tab) => {
      if (!keys.includes(tab.dataset.page))
        tab.remove();
    });
    rows.querySelectorAll('.imported-page-row').forEach((row) => {
      if (!keys.includes(row.dataset.pg))
        row.remove();
    });
    for (const key of keys) {
      const title = titleFor(key);
      const tabNumber = String(BUILT_IN_PAGE_COUNT + keys.indexOf(key) + 1);
      let tab = tabs.querySelector(`.view-tab[data-page="${key}"]`);
      if (!tab) {
        tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'view-tab imported-page-tab';
        tab.dataset.page = key;
        tab.title = title;
        tab.setAttribute('aria-label', `Edit ${title}`);
        const number = document.createElement('span');
        number.className = 'page-tab-num';
        number.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'imported-tab-label';
        text.textContent = title.replace(/\s+[·|]\s+Page\s+\d+$/i, '');
        tab.append(number, text);
        tab.addEventListener('click', () => window.activateCoverdraftPageTab?.(key));
        tabs.insertBefore(tab, tabs.querySelector('.view-tab-design'));
      }
      const numberEl = tab.querySelector('.page-tab-num');
      if (numberEl)
        numberEl.textContent = tabNumber;
      tab.classList.toggle('active', currentPageKey === key);
      let row = rows.querySelector(`[data-pg="${key}"]`);
      const isNewRow = !row;
      if (!row) {
        row = document.createElement('div');
        row.className = 'page-row imported-page-row';
        row.dataset.pg = key;
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.setAttribute('aria-label', `Include ${title} in PDF export`);
        label.append(checkbox, document.createTextNode(` ${title}`));
        const controls = document.createElement('span');
        [-1, 1].forEach((direction) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'mv';
          button.dataset.d = String(direction);
          button.innerHTML = lucideSvg(direction < 0 ? 'chevron-up' : 'chevron-down', 14);
          button.setAttribute('aria-label', `Move ${title} ${direction < 0 ? 'up' : 'down'}`);
          controls.appendChild(button);
        });
        row.append(label, controls);
        rows.appendChild(row);
      }
      const savedPageSettings = safeRead(SETTINGS_KEY, {});
      const hasSavedRow = Array.isArray(savedPageSettings.order) && savedPageSettings.order.includes(key);
      if (Array.isArray(savedPageSettings.on) && hasSavedRow)
        row.querySelector('input').checked = savedPageSettings.on.includes(key);
      else
        row.querySelector('input').checked = isNewRow || !hasSavedRow;
    }
    window.coverdraftRefreshPageRowBehaviors?.();
    // Restore saved ordering while placing new pages at the end by default.
    const savedPageSettings = safeRead(SETTINGS_KEY, {});
    const savedOrder = Array.isArray(savedPageSettings.order) ? savedPageSettings.order : [];
    const rowList = [...rows.querySelectorAll('[data-pg]')];
    rowList.sort((a, b) => {
      const ai = savedOrder.indexOf(a.dataset.pg), bi = savedOrder.indexOf(b.dataset.pg);
      if (ai < 0 && bi < 0)
        return 0;
      if (ai < 0)
        return 1;
      if (bi < 0)
        return -1;
      return ai - bi;
    }).forEach((row) => rows.appendChild(row));
    const hasImported = keys.length > 0;
    const clearButton = $('clearImportedPagesBtn');
    if (clearButton) {
      clearButton.hidden = !hasImported;
      clearButton.disabled = !hasImported;
    }
    document.querySelectorAll('.view-tab[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === currentPageKey));
    window.coverdraftSavePageManager?.();
  }
  window.coverdraftSyncImportedPages = syncImportedPages;
  function nextKeys(count) {
    const existing = importedKeys().map((key) => Number(key.slice(7))).filter(Number.isFinite);
    let next = existing.length ? Math.max(...existing) + 1 : 1;
    return Array.from({ length: count }, () => `import-${next++}`);
  }
  async function importDocumentFile(file) {
    if (!file)
      return;
    if (file.size > MAX_FILE_BYTES) {
      showToast('Choose a DOCX smaller than 25 MB.', false);
      return;
    }
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (extension !== 'docx') {
      showToast('Only DOCX files are supported for import. PDF files can still be attached to your assignment.', false);
      return;
    }
    if (window.coverdraftIsExportBusy?.()) {
      showToast('Wait for the current document task to finish before importing.', false);
      return;
    }
    const previousPageKey = currentPageKey;
    let createdKeys = [];
    let titlesBefore = null;
    try {
      showToast(`Importing ${file.name}…`);
      const result = await convertDocx(file);
      if (result.details) {
        const applied = applyDocxDetails(result.details);
        const parts = [];
        if (applied.filled.length)
          parts.push(`${applied.filled.length} cover field${applied.filled.length === 1 ? '' : 's'}`);
        if (applied.rows)
          parts.push(`${applied.rows} index entr${applied.rows === 1 ? 'y' : 'ies'}`);
        const extra = applied.skipped.length ? ` Not in this university template: ${applied.skipped.join(', ')}.` : '';
        showToast(`Filled ${parts.join(' and ') || 'details'} from ${file.name}. Edit them in the form as usual.${extra}`);
        return;
      }
      const pages = result.pages;
      if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES || !pages.some((page) => Array.isArray(page) && page.length))
        throw new Error('No editable page content was found in this document.');
      documentPages[currentPageKey] = canvasElements;
      const keys = nextKeys(pages.length);
      createdKeys = keys;
      const titles = getTitles();
      titlesBefore = { ...titles };
      const baseName = String(file.name).replace(/\.docx$/i, '').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').trim().slice(0, 60) || 'Imported document';
      keys.forEach((key, index) => {
        documentPages[key] = pages[index];
        titles[key] = `${baseName} · Page ${index + 1}`;
      });
      if (!setTitles(titles))
        throw new Error('The document was imported but page titles could not be saved. Check browser storage.');
      syncImportedPages();
      if (document.body.classList.contains('simple-mode'))
        setAppMode(true);
      currentPageKey = keys[0];
      canvasElements = documentPages[currentPageKey];
      syncImportedPages();
      renderPageCanvas();
      window.activateCoverdraftPageTab?.(currentPageKey);
      if (typeof window.saveDocumentToLocalStorage === 'function' && !window.saveDocumentToLocalStorage()) {
        throw new Error('The imported text exceeded available browser storage. Remove older drafts or import a smaller document.');
      }
      scheduleAutoCompile();
      const textNote = result.note ? ` ${result.note}` : '';
      showToast(`Imported ${pages.length} editable page${pages.length === 1 ? '' : 's'}.${textNote}`, !result.note);
    } catch (error) {
      if (createdKeys.length) {
        createdKeys.forEach((key) => {
          delete documentPages[key];
          document.querySelector(`.view-tab[data-page="${key}"]`)?.remove();
          document.querySelector(`#pageRows [data-pg="${key}"]`)?.remove();
        });
        if (titlesBefore)
          setTitles(titlesBefore);
        currentPageKey = documentPages[previousPageKey] ? previousPageKey : 'cover';
        canvasElements = documentPages[currentPageKey] || [];
        syncImportedPages();
        renderPageCanvas();
      }
      console.warn('Document import failed:', error);
      showToast(error?.message || 'Could not import this document. Try another file.', false);
    }
  }
  window.coverdraftImportDocumentFile = importDocumentFile;
  async function clearImportedPages() {
    const keys = importedKeys();
    if (!keys.length)
      return;
    const confirmed = await window.coverdraftConfirm({
      title: 'Remove imported pages?',
      message: `Remove ${keys.length} imported page${keys.length === 1 ? '' : 's'}? This does not affect the Cover or Index pages.`,
      confirmLabel: 'Remove',
      danger: true,
      skipKey: 'remove-imported-pages'
    });
    if (!confirmed)
      return;
    keys.forEach((key) => {
      delete documentPages[key];
      document.querySelector(`.view-tab[data-page="${key}"]`)?.remove();
      document.querySelector(`#pageRows [data-pg="${key}"]`)?.remove();
    });
    const titles = getTitles();
    keys.forEach((key) => delete titles[key]);
    setTitles(titles);
    if (importedKey(currentPageKey)) {
      currentPageKey = 'cover';
      canvasElements = documentPages.cover || [];
      window.activateCoverdraftPageTab?.('cover');
      renderPageCanvas();
    }
    syncImportedPages();
    const settings = safeRead(SETTINGS_KEY, {});
    if (settings && typeof settings === 'object') {
      settings.order = (settings.order || []).filter((key) => !importedKey(key));
      settings.on = (settings.on || []).filter((key) => !importedKey(key));
      if (!settings.on.some((key) => ['cover', 'index'].includes(key)))
        settings.on = ['cover'];
      if (!settings.order.some((key) => ['cover', 'index'].includes(key)))
        settings.order = ['cover', 'index'];
      safeWrite(SETTINGS_KEY, settings);
      const coverCheck = $('pageRows')?.querySelector('[data-pg="cover"] input');
      if (coverCheck && !settings.on.includes('cover') && !settings.on.includes('index'))
        coverCheck.checked = true;
    }
    scheduleAutoCompile();
    showToast('Imported pages removed. Your Cover and Index pages are unchanged.');
  }
  window.coverdraftOpenWordImport = () => $('documentImportInput')?.click();
  $('documentImportInput')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file)
      importDocumentFile(file);
  });
  $('clearImportedPagesBtn')?.addEventListener('click', clearImportedPages);
  window.addEventListener('load', () => window.setTimeout(syncImportedPages, 50));
  // Keep page rows/tabs in sync if the app restores a draft after this module has initialized.
  window.setTimeout(syncImportedPages, 1200);
})();
