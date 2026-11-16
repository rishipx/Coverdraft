/* User edits to the built-in universities: menu name, short name, cover-page name, default cover layout, and
   deleting a university from the pickers (it stays in the app and can be restored).
   The repository templates are never modified. Edits live in localStorage and are applied over the generated
   registry (UNIVERSITY_LIST, UNI_CONFIGS, TEMPLATES) at startup and whenever they change. */
(function () {
  'use strict';

  const KEY = 'coverdraft_university_overrides_v1';
  const LIMITS = { label: 80, shortName: 24, name: 120 };
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const original = {};
  UNIVERSITY_LIST.forEach((university) => {
    const config = UNI_CONFIGS[university.id];
    const template = TEMPLATES[config.styleId];
    original[university.id] = clone({
      label: university.label,
      shortName: university.shortName,
      name: config.name,
      layout: template.layout,
      font: template.font,
      border: template.border
    });
  });

  function readAll() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeAll(value) {
    try {
      if (Object.keys(value).length) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const validLayout = (layout) => Array.isArray(layout) && layout.length > 0 && layout.length <= 200
    && layout.every((element) => element && typeof element === 'object' && typeof element.id === 'string');

  function applyOne(id) {
    const base = original[id];
    const saved = readAll()[id] || {};
    const university = UNIVERSITY_LIST.find((item) => item.id === id);
    const config = UNI_CONFIGS[id];
    const template = TEMPLATES[config.styleId];
    university.label = text(saved.label, LIMITS.label) || base.label;
    university.shortName = text(saved.shortName, LIMITS.shortName) || base.shortName;
    university.hidden = saved.hidden === true;
    config.name = text(saved.name, LIMITS.name) || base.name;
    const customLayout = validLayout(saved.layout);
    template.layout = clone(customLayout ? saved.layout : base.layout);
    template.font = customLayout && typeof saved.font === 'string' ? saved.font : base.font;
    template.border = customLayout && saved.border && typeof saved.border === 'object' ? clone(saved.border) : clone(base.border);
  }

  /* Keeps every university picker in step with UNIVERSITY_LIST. */
  function refreshPickers() {
    window.coverdraftFillUniversityPickers();
  }

  function info(id) {
    const university = UNIVERSITY_LIST.find((item) => item.id === id);
    if (!university) return null;
    const saved = readAll()[id] || {};
    return {
      id,
      label: university.label,
      shortName: university.shortName,
      name: UNI_CONFIGS[id].name,
      customLayout: validLayout(saved.layout),
      edited: Object.keys(saved).some((field) => field !== 'hidden'),
      hidden: saved.hidden === true
    };
  }

  /* patch: { label?, shortName?, name?, layout?: { layout, font, border } | null }  (null resets the layout) */
  function update(id, patch) {
    if (!original[id]) return false;
    const all = readAll();
    const next = { ...(all[id] || {}) };
    ['label', 'shortName', 'name'].forEach((field) => {
      if (!(field in patch)) return;
      const value = text(patch[field], LIMITS[field]);
      if (value && value !== original[id][field]) next[field] = value;
      else delete next[field];
    });
    if ('layout' in patch) {
      delete next.layout; delete next.font; delete next.border;
      if (patch.layout && validLayout(patch.layout.layout)) {
        next.layout = clone(patch.layout.layout);
        next.font = patch.layout.font;
        next.border = clone(patch.layout.border);
      }
    }
    if (Object.keys(next).length) all[id] = next; else delete all[id];
    if (!writeAll(all)) return false;
    applyOne(id);
    refreshPickers();
    return true;
  }

  const visibleCount = () => UNIVERSITY_LIST.filter((university) => !university.hidden).length;
  const hiddenIds = () => UNIVERSITY_LIST.filter((university) => university.hidden).map((university) => university.id);

  /* Removes a university from every picker. The last visible one cannot be removed. */
  function remove(id) {
    if (!original[id] || visibleCount() <= 1) return false;
    const all = readAll();
    all[id] = { ...(all[id] || {}), hidden: true };
    if (!writeAll(all)) return false;
    applyOne(id);
    refreshPickers();
    return true;
  }

  function restoreAll() {
    const all = readAll();
    hiddenIds().forEach((id) => {
      if (!all[id]) return;
      delete all[id].hidden;
      if (!Object.keys(all[id]).length) delete all[id];
    });
    if (!writeAll(all)) return false;
    UNIVERSITY_LIST.forEach((university) => applyOne(university.id));
    refreshPickers();
    return true;
  }

  function reset(id) {
    const all = readAll();
    delete all[id];
    if (!writeAll(all)) return false;
    applyOne(id);
    refreshPickers();
    return true;
  }

  UNIVERSITY_LIST.forEach((university) => applyOne(university.id));
  refreshPickers();

  window.coverdraftUniversities = { info, update, reset, remove, restoreAll, hiddenIds, isHidden: (id) => hiddenIds().includes(id), limits: LIMITS };
})();
