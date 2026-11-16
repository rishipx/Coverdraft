/* Subject bar: stable order, pin/unpin/remove actions, adding a subject, class subject lists, and Quick Start index entries. */
(function () {
  const $ = id => document.getElementById(id), LS = window.coverdraftStorage;
  const { subjects, setField, saveExp } = window.coverdraftSubjectState;
  // Subject shortcuts: stable order with explicit pin/unpin and remove actions.
  const SHORTCUTS_KEY = 'coverdraft_subject_shortcuts_v1';
  const subKey = sub => `${String(sub?.code || '').trim()}::${String(sub?.title || '').trim()}`;
  const shortcutCatalogKey = (uni, sem) => `${uni}:${sem}`;
  function readShortcutRoot() {
    return LS.get(SHORTCUTS_KEY, {}) || {};
  }
  function writeShortcutRoot(root) {
    LS.set(SHORTCUTS_KEY, root);
  }
  function defaultShortcuts(list, active) {
    const core = list.filter(sub => !/(?:\blab\b|elective|industrial training|semester training|mentoring|workshop)/i.test(sub.title)).slice(0, 3);
    if (active && !core.some(item => subKey(item) === subKey(active)))
      core.push(active);
    return [...new Map(core.map(item => [subKey(item), item])).values()];
  }
  function getShortcutState(uni, sem, list, active) {
    const root = readShortcutRoot(), k = shortcutCatalogKey(uni, sem);
    let state = root[k];
    if (!state || !Array.isArray(state.shortcuts)) {
      const defaults = defaultShortcuts(list, active).map(subKey);
      state = { shortcuts: [...defaults], pinned: [], defaults: [...defaults] };
      root[k] = state;
      writeShortcutRoot(root);
    }
    state.shortcuts = [...new Set(state.shortcuts.filter(x => typeof x === 'string'))];
    state.pinned = [...new Set((Array.isArray(state.pinned) ? state.pinned : []).filter(x => typeof x === 'string'))];
    if (!Array.isArray(state.defaults))
      state.defaults = [...state.shortcuts];
    state.defaults = [...new Set(state.defaults.filter(x => typeof x === 'string'))];
    return { root, state, k };
  }
  function isPinnedShortcut(uni, sem, sub) {
    const list = ((UNIVERSITY_SEMESTER_COURSES[uni] || {})[sem]) || [], active = list.find(x => subKey(x) === subKey(sub));
    if (!active)
      return false;
    return getShortcutState(uni, sem, list, active).state.pinned.includes(subKey(sub));
  }
  window.coverdraftIsShortcutPinned = isPinnedShortcut;
  window.coverdraftTogglePinShortcut = function (uni, sem, sub) {
    const list = ((UNIVERSITY_SEMESTER_COURSES[uni] || {})[sem]) || [], active = list.find(x => subKey(x) === subKey(sub)) || sub;
    const { root, state, k } = getShortcutState(uni, sem, list, active), key = subKey(sub), idx = state.shortcuts.indexOf(key), pinIdx = state.pinned.indexOf(key);
    if (pinIdx >= 0) {
      state.pinned.splice(pinIdx, 1);
      if (!state.defaults.includes(key))
        state.shortcuts = state.shortcuts.filter(x => x !== key);
    } else {
      if (idx < 0)
        state.shortcuts.push(key);
      state.pinned.push(key);
    }
    root[k] = state;
    writeShortcutRoot(root);
    if (typeof window.refreshSubjectShortcutBar === 'function')
      window.refreshSubjectShortcutBar();
    return pinIdx < 0;
  };
  window.coverdraftRemoveShortcut = function (uni, sem, sub) {
    const list = ((UNIVERSITY_SEMESTER_COURSES[uni] || {})[sem]) || [], active = list.find(x => subKey(x) === subKey(sub)) || sub;
    const { root, state, k } = getShortcutState(uni, sem, list, active), key = subKey(sub);
    state.shortcuts = state.shortcuts.filter(x => x !== key);
    state.pinned = state.pinned.filter(x => x !== key);
    root[k] = state;
    writeShortcutRoot(root);
    if (typeof window.refreshSubjectShortcutBar === 'function')
      window.refreshSubjectShortcutBar();
  };
  window.updateSubjectShortcutReferences = function (uni, sem, oldSub, newSub) {
    const root = readShortcutRoot(), k = shortcutCatalogKey(uni, sem), state = root[k];
    if (!state)
      return;
    const oldKey = subKey(oldSub), newKey = subKey(newSub);
    state.shortcuts = state.shortcuts.map(x => x === oldKey ? newKey : x);
    state.pinned = state.pinned.map(x => x === oldKey ? newKey : x);
    state.defaults = (Array.isArray(state.defaults) ? state.defaults : []).map(x => x === oldKey ? newKey : x);
    state.shortcuts = [...new Set(state.shortcuts)];
    state.pinned = [...new Set(state.pinned)];
    state.defaults = [...new Set(state.defaults)];
    root[k] = state;
    writeShortcutRoot(root);
  };
  window.removeSubjectShortcutReferences = function (uni, sem, sub) {
    const root = readShortcutRoot(), k = shortcutCatalogKey(uni, sem), state = root[k];
    if (!state)
      return;
    const key = subKey(sub);
    state.shortcuts = state.shortcuts.filter(x => x !== key);
    state.pinned = state.pinned.filter(x => x !== key);
    state.defaults = (Array.isArray(state.defaults) ? state.defaults : []).filter(x => x !== key);
    root[k] = state;
    writeShortcutRoot(root);
  };
  function refreshBar() {
    const sem = $('sbSem'), cur = currentFormData.sem || '6th';
    if (!sem.options.length) {
      sem.innerHTML = $('batchSemSelect').innerHTML;
      window.coverdraftShortSelects && window.coverdraftShortSelects.init(sem);
    }
    sem.value = cur;
    window.coverdraftShortSelects && window.coverdraftShortSelects.collapse(sem);
    const uniSel = $('uniPresetSelect');
    if (uniSel && uniSel.value !== currentUniKey && !isSavedLayoutValue(uniSel.value)) {
      setUniversityPicker(uniSel, currentUniKey);
      window.coverdraftShortSelects && window.coverdraftShortSelects.collapse(uniSel);
    }
    const uni = currentUniKey || DEFAULT_UNIVERSITY_ID, list = subjects();
    const active = list.find(sub => sub.code === currentFormData.code && sub.title === currentFormData.title)
      || list.find(sub => (sub.code && sub.code === currentFormData.code) || sub.title === currentFormData.title);
    const { state } = getShortcutState(uni, cur, list, active);
    const visible = state.shortcuts.map(key => list.find(sub => subKey(sub) === key)).filter(Boolean);
    const wrap = $('sbChips');
    wrap.replaceChildren();
    visible.forEach(sub => {
      const key = subKey(sub), isActive = !!active && key === subKey(active), isPinned = state.pinned.includes(key);
      const group = document.createElement('div');
      group.className = 'subject-chip-wrap' + (isPinned ? ' is-pinned' : '');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (isActive ? ' active' : '');
      b.textContent = sub.title;
      b.title = `${sub.code} · Select subject`;
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      b.onclick = () => window.applyBatchSubject(encodeURIComponent(JSON.stringify(sub)), cur, uni);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'chip-action chip-pin';
      pin.title = isPinned ? 'Unpin and remove from top bar' : 'Pin to top bar';
      pin.setAttribute('aria-label', pin.title);
      pin.innerHTML = lucideSvg('pin', 14);
      pin.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        window.coverdraftTogglePinShortcut(uni, cur, sub);
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-action chip-remove';
      remove.title = 'Remove shortcut (does not delete subject)';
      remove.setAttribute('aria-label', `Remove ${sub.title} from top bar`);
      remove.innerHTML = lucideSvg('x', 14);
      remove.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        window.coverdraftRemoveShortcut(uni, cur, sub);
      };
      const acts = document.createElement('span');
      acts.className = 'chip-actions';
      acts.append(pin, remove);
      group.append(b, acts);
      wrap.appendChild(group);
    });
    if (!visible.length) {
      const empty = document.createElement('span');
      empty.className = 'chips-empty';
      empty.textContent = 'No subjects yet · open Subject library to add yours';
      wrap.appendChild(empty);
    }
  }
  // Normalises text that arrives from a form or a shared link.
  const cleanSub = (v, n) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const DEFAULT_DEPT = 'Department of Computer Science Engineering';
  function ensureCatalog(uni, sem) {
    if (!UNIVERSITY_SEMESTER_COURSES[uni])
      UNIVERSITY_SEMESTER_COURSES[uni] = {};
    if (!Array.isArray(UNIVERSITY_SEMESTER_COURSES[uni][sem]))
      UNIVERSITY_SEMESTER_COURSES[uni][sem] = [];
    return UNIVERSITY_SEMESTER_COURSES[uni][sem];
  }
  const sameSubject = (a, code, title) => String(a.title).toLowerCase() === title.toLowerCase() || (!!code && String(a.code || '').toLowerCase() === code.toLowerCase());
  // Add a subject the student typed: save it for this university + semester, pin it, and switch to it.
  window.coverdraftAddMySubject = function ({ title, code, department, uni: scopeUni, sem: scopeSem }) {
    title = cleanSub(title, 100);
    code = cleanSub(code, 40);
    department = cleanSub(department, 120) || cleanSub(currentFormData.department, 120) || DEFAULT_DEPT;
    if (!title)
      return null;
    const uni = UNI_CONFIGS[scopeUni] ? scopeUni : (currentUniKey || DEFAULT_UNIVERSITY_ID), sem = /^[1-8](?:st|nd|rd|th)$/.test(String(scopeSem)) ? scopeSem : (currentFormData.sem || '6th'), catalog = ensureCatalog(uni, sem);
    let subject = catalog.find(item => sameSubject(item, code, title)), existed = !!subject;
    if (!subject) {
      subject = { code, title, department };
      catalog.push(subject);
      persistCustomCourse(uni, sem, subject);
      persistCourseCatalog(uni, sem);
    }
    if (!isPinnedShortcut(uni, sem, subject))
      window.coverdraftTogglePinShortcut(uni, sem, subject);
    window.applyBatchSubject(encodeURIComponent(JSON.stringify(subject)), sem, uni);
    if (existed)
      showToast(`"${subject.title}" was already in your list. Selected it.`);
    return subject;
  };
  const subjectModal = $('mySubjectModal'), subjectForm = $('mySubjectForm');
  let addScope = {};
  window.coverdraftOpenAddSubject = function (scope = {}) {
    if (!subjectModal)
      return;
    addScope = { uni: UNI_CONFIGS[scope.uni] ? scope.uni : currentUniKey, sem: /^[1-8](?:st|nd|rd|th)$/.test(String(scope.sem)) ? scope.sem : (currentFormData.sem || '6th') };
    $('mySubjectScope').textContent = `${(UNI_CONFIGS[addScope.uni]?.name) || 'this university'} · ${addScope.sem} sem`;
    subjectForm.reset();
    $('mySubjectDept').value = cleanSub(currentFormData.department, 120) || DEFAULT_DEPT;
    subjectModal.style.display = 'flex';
    window.setTimeout(() => $('mySubjectName').focus(), 30);
  };
  const closeSubjectModal = () => {
    if (subjectModal)
      subjectModal.style.display = 'none';
    const library = $('batchModal');
    (library && getComputedStyle(library).display !== 'none' ? $('addNewBatchSubjectBtn') : $('openCourseSwitcherTopBtn'))?.focus();
  };
  $('mySubjectClose')?.addEventListener('click', closeSubjectModal);
  $('mySubjectCancel')?.addEventListener('click', closeSubjectModal);
  subjectModal?.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSubjectModal();
    }
  });
  subjectForm?.addEventListener('submit', e => {
    e.preventDefault();
    const subject = window.coverdraftAddMySubject({ title: $('mySubjectName').value, code: $('mySubjectCode').value, department: $('mySubjectDept').value, ...addScope });
    if (!subject)
      return;
    if (subjectModal)
      subjectModal.style.display = 'none';
  });
  // The subjects on the bar are the class list that "Copy class link" shares.
  window.coverdraftClassSubjects = function () {
    const uni = currentUniKey || DEFAULT_UNIVERSITY_ID, sem = currentFormData.sem || '6th', list = subjects();
    const { state } = getShortcutState(uni, sem, list, null);
    const chosen = state.shortcuts.map(key => list.find(sub => subKey(sub) === key)).filter(Boolean).slice(0, 15);
    return chosen.length ? { sem, d: cleanSub(chosen[0].department || currentFormData.department, 120), list: chosen.map(s => ({ c: cleanSub(s.code, 40), t: cleanSub(s.title, 100) })) } : null;
  };
  // Open a class link: add its subjects to this device and make them the subject bar for that semester.
  window.coverdraftApplyClassSubjects = function (subs, uni) {
    if (!subs || typeof subs !== 'object' || !Array.isArray(subs.list) || !UNI_CONFIGS[uni])
      return { added: 0, total: 0 };
    const sem = /^[1-8](?:st|nd|rd|th)$/.test(String(subs.sem)) ? String(subs.sem) : null;
    if (!sem)
      return { added: 0, total: 0 };
    const dept = cleanSub(subs.d, 120) || DEFAULT_DEPT, catalog = ensureCatalog(uni, sem), keys = [];
    let added = 0;
    subs.list.slice(0, 20).forEach(item => {
      const title = cleanSub(item && item.t, 100), code = cleanSub(item && item.c, 40);
      if (!title)
        return;
      let subject = catalog.find(x => sameSubject(x, code, title));
      if (!subject) {
        subject = { code, title, department: dept };
        catalog.push(subject);
        persistCustomCourse(uni, sem, subject);
        added++;
      }
      keys.push(subKey(subject));
    });
    if (!keys.length)
      return { added: 0, total: 0 };
    if (added)
      persistCourseCatalog(uni, sem);
    const root = readShortcutRoot();
    root[shortcutCatalogKey(uni, sem)] = { shortcuts: keys, pinned: [...keys], defaults: [] };
    writeShortcutRoot(root);
    refreshBar();
    return { added, total: keys.length };
  };
  window.refreshSubjectShortcutBar = refreshBar;
  $('sbSem').addEventListener('change', e => {
    currentFormData.sem = e.target.value;
    setField('sem', e.target.value);
    refreshBar();
  });
  // Import detected Quick Start experiment titles directly into the index without a separate bulk-tools UI.
  window.coverdraftAppendIndexEntries = function (titles) {
    const clean = (title) => String(title ?? '').replace(/^\s*(?:exp(?:eriment)?\.?\s*)?(?:no\.?\s*)?\d+\s*[.):\-–]\s*/i, '').trim();
    const rows = (Array.isArray(titles) ? titles : [])
      .map((value) => (value && typeof value === 'object')
        ? { title: clean(value.title), page: String(value.page ?? '').trim().slice(0, 12), date: String(value.date ?? '').trim().slice(0, 20) }
        : { title: clean(String(value ?? '').trim()), page: '', date: '' })
      .filter((row) => row.title);
    if (!rows.length)
      return false;
    if (experimentsList.length === 1 && !String(experimentsList[0].title || '').trim())
      experimentsList = [];
    experimentsList.push(...rows);
    experimentsList.forEach((row, index) => {
      row.no = index + 1;
    });
    renderExperimentsPanel();
    if (currentPageKey === 'index')
      renderPageCanvas();
    scheduleAutoCompile();
    saveExp();
    showToast(`Added ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`);
    return true;
  };
})();
