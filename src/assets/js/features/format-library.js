/* Saved layouts: build, sanitize and store (IndexedDB with a localStorage fallback).
   The university picker lists them and offers save, edit and delete. */
(function () {
  const $ = id => document.getElementById(id);
  const cfg = () => UNI_CONFIGS[currentUniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID];
  // format library: share and import layouts (layout only, sanitized on import)
  // Storage model: exported .json files are the source of truth. This library is a working
  // copy kept in IndexedDB (localStorage is the fallback). Built-in templates ship with the
  // app (src/templates/) and never depend on user storage.
  const LIBK = 'coverdraft_formats_v1', DB_NAME = 'coverdraft', DB_STORE = 'formats';
  const PACK_V = 2, ID_RE = /^[\w.-]{1,64}$/, MAX_FORMATS = 500;
  const newId = () => 'fmt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const cleanText = (s, n) => typeof s === 'string' ? s.replace(/<[^>]*>?/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';
  const cleanDate = s => {
    const t = typeof s === 'string' ? Date.parse(s) : NaN;
    return isFinite(t) ? new Date(t).toISOString() : '';
  };
  const HEX = /^#[0-9a-f]{3,8}$/i, FONT = /^[\w\s,'"\-]{1,120}$/, okNum = v => typeof v === 'number' && isFinite(v) && Math.abs(v) < 5000;
  const cleanHtml = t => String(t).slice(0, 2000).replace(/<(\/?)(b|i|u|br)\b[^>]*>/gi, '\u0001$1$2\u0002').replace(/<[^>]*>?/g, '').replace(/\u0001(\/?)(\w+)\u0002/g, '<$1$2>');
  function cleanEl(e) {
    if (!e || typeof e !== 'object')
      return null;
    const t = e.type;
    if (t && !['shape', 'logo', 'expTable'].includes(t))
      return null;
    if (!okNum(e.x) || !okNum(e.y) || !okNum(e.w))
      return null;
    const o = { x: e.x, y: e.y, w: e.w };
    if (t)
      o.type = t;
    ['h', 'size', 'lineHeight'].forEach(k => {
      if (okNum(e[k]))
        o[k] = e[k];
    });
    if (typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id))
      o.id = e.id;
    if (['left', 'center', 'right', 'justify'].includes(e.align))
      o.align = e.align;
    if (['normal', 'bold', '500', '600', '700', '800'].includes(String(e.weight)))
      o.weight = String(e.weight);
    if (HEX.test(e.color))
      o.color = e.color;
    if (HEX.test(e.bg))
      o.bg = e.bg;
    if (FONT.test(e.font || ''))
      o.font = e.font;
    if (e.italic)
      o.italic = true;
    if (e.underline)
      o.underline = true;
    if (!t) {
      if (typeof e.text !== 'string')
        return null;
      o.text = cleanHtml(e.text);
    }
    return o;
  }
  function cleanPack(p) {
    if (!p || typeof p !== 'object' || p.app !== 'coverdraft' || !p.pages || typeof p.pages !== 'object' || !Number.isInteger(p.v) || p.v < 1)
      throw new Error('This is not a Coverdraft format file');
    if (p.v > PACK_V)
      throw new Error('This format was made by a newer version of Coverdraft. Update the app to use it.');
    const pages = {};
    ['cover', 'index'].forEach(k => pages[k] = (Array.isArray(p.pages[k]) ? p.pages[k] : []).slice(0, 60).map(cleanEl).filter(Boolean));
    if (!pages.cover.length)
      throw new Error('This format has no cover page');
    const b = p.border || {}, name = String(p.name || 'Untitled format').slice(0, 80).replace(/[<>]/g, '');
    return {
      app: 'coverdraft', v: PACK_V,
      id: typeof p.id === 'string' && ID_RE.test(p.id) ? p.id : newId(),
      name, description: cleanText(p.description, 200), author: cleanText(p.author, 60), updated: cleanDate(p.updated) || new Date().toISOString(),
      uni: UNI_CONFIGS[p.uni] ? p.uni : null,
      font: typeof p.font === 'string' && FONT.test(p.font) ? p.font : null,
      border: { show: !!b.show, style: ['solid', 'double', 'dashed', 'dotted'].includes(b.style) ? b.style : 'solid', width: okNum(+b.width) ? +b.width : 2, inset: okNum(+b.inset) ? +b.inset : 28, color: HEX.test(b.color) ? b.color : '#111111' }, pages
    };
  }
  function buildPack(name, meta = {}) {
    documentPages[currentPageKey] = canvasElements;
    const mine = ['name', 'uid', 'usn', 'sid', 'roll', 'email', 'phone', 'mobile'].map(k => String(currentFormData[k] || '').trim().toLowerCase()).filter(v => v.length >= 4);
    const hit = t => mine.some(v => String(t).toLowerCase().includes(v));
    const pages = {};
    ['cover', 'index'].forEach(k => pages[k] = (documentPages[k] || []).map(e => {
      const c = e.customContent !== undefined && !hit(e.customContent) ? e.customContent : e.text;
      return cleanEl({ ...e, text: c });
    }).filter(Boolean));
    const g = id => $(id);
    const pack = {
      app: 'coverdraft', v: PACK_V, id: meta.id || newId(), name, description: meta.description || '', author: meta.author || '', updated: new Date().toISOString(), uni: currentUniKey, font: g('f_fontFamily')?.value,
      border: { show: !!g('f_showBorder')?.checked, style: g('f_borderStyle')?.value, width: +g('f_borderWidth')?.value, inset: +g('f_borderInset')?.value, color: g('f_borderColor')?.value }, pages
    };
    if (hit(JSON.stringify(pack)))
      throw new Error('Your name or ID appears in the layout text. Replace it with the field placeholder first.');
    return cleanPack(pack);
  }
  function applyPack(p) {
    if (p.uni && p.uni !== currentUniKey) {
      $('uniPresetSelect').value = p.uni;
      loadUniversityPreset(p.uni);
    }
    // A format file only describes Cover and Index; keep imported pages (and their tabs) intact.
    const importedPages = Object.fromEntries(Object.entries(documentPages).filter(([k]) => /^import-\d+$/.test(k)));
    documentPages = Object.assign(JSON.parse(JSON.stringify(p.pages)), importedPages);
    canvasElements = documentPages[currentPageKey] || documentPages.cover;
    const set = (id, v) => {
      const el = $(id);
      if (el)
        el[el.type === 'checkbox' ? 'checked' : 'value'] = v;
    };
    set('f_showBorder', p.border.show);
    set('f_borderStyle', p.border.style);
    set('f_borderWidth', p.border.width);
    set('f_borderInset', p.border.inset);
    set('f_borderColor', p.border.color);
    const ff = $('f_fontFamily');
    if (ff && p.font && [...ff.options].some(o => o.value === p.font))
      ff.value = p.font;
    renderPageCanvas();
    scheduleAutoCompile();
    showToast(`Applied "${p.name}"`);
  }
  // ---- storage layer: IndexedDB, with a localStorage fallback when IndexedDB is unavailable ----
  let useLS = false, dbp = null;
  function openDb() {
    if (dbp)
      return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB)
        return rej(new Error('IndexedDB is not available'));
      let r;
      try {
        r = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        return rej(e);
      }
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(DB_STORE))
          r.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('Could not open storage'));
      r.onblocked = () => rej(new Error('Storage is busy in another tab'));
    }).catch(e => {
      dbp = null;
      throw e;
    });
    return dbp;
  }
  async function backend() {
    if (useLS)
      return null;
    try {
      return await openDb();
    } catch (e) {
      useLS = true;
      return null;
    }
  }
  const tx = (mode, fn) => openDb().then(db => new Promise((res, rej) => {
    let t, out;
    try {
      t = db.transaction(DB_STORE, mode);
      out = fn(t.objectStore(DB_STORE));
    } catch (e) {
      return rej(e);
    }
    t.oncomplete = () => res(out && out.result);
    t.onabort = () => rej(t.error || new Error('Storage transaction was cancelled'));
  }));
  function normRec(x) {
    try {
      const pack = cleanPack(x.pack);
      return { id: pack.id, savedAt: Number(x.savedAt) || Number(x.id) || 0, pack };
    } catch (e) {
      return null;
    }
  }
  const lsRead = () => {
    let a;
    try {
      a = JSON.parse(localStorage.getItem(LIBK));
    } catch (e) {
      a = null;
    }
    return Array.isArray(a) ? a.map(normRec).filter(Boolean) : [];
  };
  async function libAll() {
    const db = await backend(), rows = db ? await tx('readonly', s => s.getAll()) : lsRead();
    return (rows || []).map(normRec).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
  }
  async function libPut(pack) {
    const all = await libAll();
    if (all.length >= MAX_FORMATS && !all.some(r => r.id === pack.id))
      throw new Error(`Saved layouts is full (${MAX_FORMATS}). Remove some first.`);
    const rec = { id: pack.id, savedAt: Date.now(), pack }, db = await backend();
    if (db) {
      try {
        await tx('readwrite', s => {
          s.put(rec);
        });
      } catch (e) {
        throw new Error(e && e.name === 'QuotaExceededError' ? 'Browser storage is full. Remove some saved layouts first.' : 'Could not save to browser storage.');
      }
      await syncPickerOptions();
      return rec;
    }
    const l = lsRead().filter(x => x.id !== rec.id);
    l.unshift(rec);
    try {
      localStorage.setItem(LIBK, JSON.stringify(l));
    } catch (e) {
      throw new Error('Browser storage is full or blocked.');
    }
    await syncPickerOptions();
    return rec;
  }
  async function libDel(id) {
    const db = await backend();
    if (db) {
      await tx('readwrite', s => {
        s.delete(id);
      });
      await syncPickerOptions();
      return;
    }
    try {
      localStorage.setItem(LIBK, JSON.stringify(lsRead().filter(x => x.id !== id)));
    } catch (e) {
      throw new Error('Could not update browser storage.');
    }
    await syncPickerOptions();
  }
  // ---- university picker: saved layouts appear in the picker's "Saved layouts" group ----
  const PICKER_PREFIX = 'saved-format:';
  async function syncPickerOptions() {
    const group = $('savedLayoutOptions'), select = $('uniPresetSelect');
    if (!group || !select)
      return;
    let rows = [];
    try {
      rows = await libAll();
    } catch (e) { }
    const selected = select.value;
    group.querySelectorAll(`option[value^="${PICKER_PREFIX}"]`).forEach(o => o.remove());
    group.prepend(...rows.map(r => {
      const o = document.createElement('option');
      o.value = PICKER_PREFIX + r.id;
      o.textContent = o.dataset.long = r.pack.name;
      o.dataset.short = r.pack.name.length > 16 ? r.pack.name.slice(0, 15) + '…' : r.pack.name;
      return o;
    }));
    group.hidden = group.children.length === 0;
    if (selected && [...select.options].some(o => o.value === selected))
      select.value = selected;
    window.coverdraftShortSelects?.collapse(select);
  }
  // Applies a saved layout chosen in the picker. Resolves true when it was applied.
  window.coverdraftUseSavedFormat = async id => {
    const rec = (await libAll()).find(r => r.id === id);
    if (!rec) {
      showToast('Saved layout not found', false);
      return false;
    }
    const confirmed = await window.coverdraftConfirm({
      title: 'Replace the current layout?',
      message: `“${rec.pack.name}” will replace the cover and index layout on this page.`,
      confirmLabel: 'Replace',
      skipKey: 'replace-layout'
    });
    if (!confirmed)
      return false;
    applyPack(cleanPack(rec.pack));
    $('uniPresetSelect').value = PICKER_PREFIX + id;
    window.coverdraftShortSelects?.collapse($('uniPresetSelect'));
    return true;
  };
  // Saves the page on screen into Saved layouts (same name = update) and selects it in the picker.
  window.coverdraftSaveLayout = async () => {
    const raw = prompt('Name this layout:', `${cfg().name} layout`);
    if (!raw || !raw.trim())
      return false;
    try {
      const name = raw.trim().slice(0, 80), old = (await libAll()).find(r => r.pack.name.toLowerCase() === name.toLowerCase());
      const pack = buildPack(name, { id: old?.id, description: old?.pack.description, author: old?.pack.author });
      await libPut(pack);
      $('uniPresetSelect').value = PICKER_PREFIX + pack.id;
      window.coverdraftShortSelects?.collapse($('uniPresetSelect'));
      showToast(`${old ? 'Updated' : 'Saved'} "${pack.name}".`);
      askPersist();
      return true;
    } catch (e) {
      showToast(e.message || 'Could not save this layout', false);
      return false;
    }
  };
  // Rename a saved layout and optionally replace its design with the page on screen.
  window.coverdraftEditSavedFormat = async (id, { name, useCurrentLayout = false }) => {
    const rec = (await libAll()).find(r => r.id === id), clean = String(name || '').trim().slice(0, 80);
    if (!rec || !clean)
      return false;
    const pack = useCurrentLayout
      ? buildPack(clean, { id: rec.id, description: rec.pack.description, author: rec.pack.author })
      : cleanPack({ ...rec.pack, name: clean, updated: new Date().toISOString() });
    await libPut(pack);
    return true;
  };
  window.coverdraftDeleteSavedFormat = async id => {
    try {
      await libDel(id);
      return true;
    } catch (e) {
      showToast(e.message || 'Could not delete this layout', false);
      return false;
    }
  };
  syncPickerOptions();
  // Ask the browser not to evict this storage automatically (best effort; the answer can be "no").
  async function askPersist() {
    try {
      if (navigator.storage?.persist) {
        return await navigator.storage.persisted() || await navigator.storage.persist();
      }
    } catch (e) { }
    return null;
  }
  // Handle used by the browser tests.
  window.coverdraftFormats = { buildPack, cleanPack, applyPack, libAll, libPut, libDel };
})();
