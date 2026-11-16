/* Page navigation, batch subjects, PDF merge UI, mobile navigation, and startup. */
const CUSTOM_COURSES_STORAGE_KEY = 'coverdraft_custom_courses_v1';
const COURSE_CATALOG_OVERRIDES_KEY = 'coverdraft_course_catalog_overrides_v1';
function loadSavedCustomCourses() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_COURSES_STORAGE_KEY) || '{}');
    Object.entries(stored).forEach(([uni, semesters]) => {
      if (!UNIVERSITY_SEMESTER_COURSES[uni])
        UNIVERSITY_SEMESTER_COURSES[uni] = {};
      Object.entries(semesters || {}).forEach(([sem, items]) => {
        if (!Array.isArray(UNIVERSITY_SEMESTER_COURSES[uni][sem]))
          UNIVERSITY_SEMESTER_COURSES[uni][sem] = [];
        (Array.isArray(items) ? items : []).forEach((item) => {
          if (item && item.title && !UNIVERSITY_SEMESTER_COURSES[uni][sem].some((x) => x.code === item.code && x.title === item.title)) {
            UNIVERSITY_SEMESTER_COURSES[uni][sem].push(item);
          }
        });
      });
    });
  } catch (_) { }
}
function persistCustomCourse(uni, sem, subject) {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_COURSES_STORAGE_KEY) || '{}');
    if (!stored[uni])
      stored[uni] = {};
    if (!Array.isArray(stored[uni][sem]))
      stored[uni][sem] = [];
    stored[uni][sem] = stored[uni][sem].filter((x) => !(x.code === subject.code && x.title === subject.title));
    stored[uni][sem].push(subject);
    localStorage.setItem(CUSTOM_COURSES_STORAGE_KEY, JSON.stringify(stored));
  } catch (_) {
    showToast('Subject added for this session, but browser storage was unavailable.', false);
  }
}
function persistCourseCatalog(uni, sem) {
  try {
    const stored = JSON.parse(localStorage.getItem(COURSE_CATALOG_OVERRIDES_KEY) || '{}');
    if (!stored[uni])
      stored[uni] = {};
    stored[uni][sem] = (UNIVERSITY_SEMESTER_COURSES[uni]?.[sem] || []).map((item) => ({
      code: String(item.code || ''), title: String(item.title || ''),
      department: String(item.department || 'Department of Computer Science Engineering')
    }));
    localStorage.setItem(COURSE_CATALOG_OVERRIDES_KEY, JSON.stringify(stored));
  } catch (_) {
    showToast('Changes apply for this session, but browser storage was unavailable.', false);
  }
}
function loadCourseCatalogOverrides() {
  try {
    const stored = JSON.parse(localStorage.getItem(COURSE_CATALOG_OVERRIDES_KEY) || '{}');
    Object.entries(stored).forEach(([uni, semesters]) => {
      if (!UNIVERSITY_SEMESTER_COURSES[uni])
        UNIVERSITY_SEMESTER_COURSES[uni] = {};
      Object.entries(semesters || {}).forEach(([sem, items]) => {
        if (!Array.isArray(items))
          return;
        UNIVERSITY_SEMESTER_COURSES[uni][sem] = items.filter((item) => item && item.title).map((item) => ({
          code: String(item.code || ''), title: String(item.title),
          department: String(item.department || 'Department of Computer Science Engineering')
        }));
      });
    });
  } catch (_) { }
}
loadSavedCustomCourses();
// Catalog overrides are applied after custom subjects so edits and deletions persist.
loadCourseCatalogOverrides();
const tabPageCover = document.getElementById('tabPageCover');
const tabPageIndex = document.getElementById('tabPageIndex');
const tabBatch = document.getElementById('tabViewBatch');
function activatePageTab(key) {
  // A page that is missing from a restored draft is recreated empty instead of silently doing nothing.
  if (typeof documentPages === 'object' && !documentPages[key] && ['cover', 'index'].includes(key))
    documentPages[key] = [];
  try {
    switchToPage(key);
  } catch (error) {
    console.error('Could not open page', key, error);
    window.showToast?.(`Could not open the ${key} page: ${error?.message || 'unexpected error'}`, false);
  }
  // Highlight what is really on screen, so a tab can never claim a page the preview is not showing.
  document.querySelectorAll('.view-tab[data-page]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === currentPageKey);
  });
  if (currentPageKey !== key)
    return;
  // Page tabs and sidebar panels are one control: Cover -> cover fields, Index -> index entries.
  if (key === 'cover')
    activateSidebarPanel('doc');
  else if (key === 'index')
    activateSidebarPanel('experiments');
}
window.activateCoverdraftPageTab = activatePageTab;
tabPageCover?.addEventListener('click', () => activatePageTab('cover'));
tabPageIndex?.addEventListener('click', () => activatePageTab('index'));
tabBatch?.addEventListener('click', () => openBatchModal());
function getBatchSwitcherSettings() {
  try {
    const raw = localStorage.getItem('coverdraft_batch_settings');
    if (raw)
      return JSON.parse(raw);
  } catch (e) { }
  return {
    uni: currentUniKey || DEFAULT_UNIVERSITY_ID,
    sem: currentFormData.sem || '6th'
  };
}
function saveBatchSwitcherSettings(uni, sem) {
  try {
    localStorage.setItem('coverdraft_batch_settings', JSON.stringify({ uni, sem }));
  } catch (e) { }
}
function openBatchModal() {
  const settings = getBatchSwitcherSettings();
  const search = document.getElementById('batchSubjectSearch');
  if (search)
    search.value = '';
  const uniSelect = document.getElementById('batchUniSelect');
  const semSelect = document.getElementById('batchSemSelect');
  if (uniSelect) {
    uniSelect.value = (settings.uni in UNIVERSITY_SEMESTER_COURSES) ? settings.uni : (currentUniKey || DEFAULT_UNIVERSITY_ID);
  }
  if (semSelect) {
    semSelect.value = settings.sem || (currentFormData.sem || '6th');
  }
  renderBatchSubjectsList();
  const modal = document.getElementById('batchModal');
  if (modal)
    modal.style.display = 'flex';
  window.setTimeout(() => document.getElementById('batchSubjectSearch')?.focus(), 30);
}
window.openCourseSwitcher = openBatchModal;
function renderBatchSubjectsList() {
  const uniEl = document.getElementById('batchUniSelect');
  const semEl = document.getElementById('batchSemSelect');
  const uni = uniEl ? uniEl.value : (currentUniKey || DEFAULT_UNIVERSITY_ID);
  const sem = semEl ? semEl.value : (currentFormData.sem || '6th');
  const list = document.getElementById('batchSubjectsList');
  if (!list)
    return;
  list.innerHTML = '';
  const uniCatalog = UNIVERSITY_SEMESTER_COURSES[uni] || {};
  const subjects = Array.isArray(uniCatalog[sem]) ? uniCatalog[sem] : [];
  const query = (document.getElementById('batchSubjectSearch')?.value || '').trim().toLocaleLowerCase();
  const matches = subjects.filter(sub => !query || [sub.title, sub.code, sub.department].some(value => String(value || '').toLocaleLowerCase().includes(query)));
  const count = document.getElementById('batchSubjectResultCount');
  if (count)
    count.textContent = query ? `${matches.length} of ${subjects.length} subjects` : `${subjects.length} subjects`;
  if (!subjects.length || !matches.length) {
    const empty = document.createElement('div');
    empty.className = 'batch-empty-state';
    empty.textContent = !subjects.length ? 'No subjects here yet. Use “Add subject” to create one.' : `No subjects match “${query}”. Try a course code or a shorter search.`;
    list.appendChild(empty);
    return;
  }
  matches.forEach((sub) => {
    const row = document.createElement('div');
    row.className = 'batch-subject-row';
    const details = document.createElement('div');
    details.className = 'batch-subject-details';
    const title = document.createElement('div');
    title.className = 'batch-subject-title';
    title.textContent = sub.title;
    const meta = document.createElement('div');
    meta.className = 'batch-subject-meta';
    const code = document.createElement('span');
    code.className = 'batch-subject-code';
    code.textContent = sub.code;
    meta.append(code);
    if (sub.department)
      details.title = sub.department;
    details.append(title, meta);
    const controls = document.createElement('div');
    controls.className = 'batch-subject-controls';
    const actions = document.createElement('div');
    actions.className = 'batch-subject-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'batch-subject-action';
    editButton.title = `Edit ${sub.title}`;
    editButton.setAttribute('aria-label', `Edit ${sub.title}`);
    editButton.innerHTML = lucideSvg('pencil', 14);
    editButton.addEventListener('click', () => beginEditBatchSubject(uni, sem, sub));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'batch-subject-action batch-subject-delete';
    deleteButton.title = `Delete ${sub.title}`;
    deleteButton.setAttribute('aria-label', `Delete ${sub.title}`);
    deleteButton.innerHTML = lucideSvg('trash-2', 14);
    deleteButton.addEventListener('click', () => deleteBatchSubject(uni, sem, sub));
    const pinButton = document.createElement('button');
    pinButton.type = 'button';
    const pinned = !!window.coverdraftIsShortcutPinned?.(uni, sem, sub);
    pinButton.className = 'batch-subject-action batch-subject-pin' + (pinned ? ' is-pinned' : '');
    pinButton.title = pinned ? `Unpin and remove ${sub.title} from top bar` : `Pin ${sub.title} to top bar`;
    pinButton.setAttribute('aria-label', pinButton.title);
    pinButton.innerHTML = lucideSvg('pin', 14);
    pinButton.addEventListener('click', () => {
      window.coverdraftTogglePinShortcut?.(uni, sem, sub);
      renderBatchSubjectsList();
    });
    actions.append(editButton, deleteButton, pinButton);
    const useButton = document.createElement('button');
    useButton.type = 'button';
    useButton.className = 'btn btn-secondary batch-subject-select';
    useButton.textContent = 'Select';
    useButton.addEventListener('click', () => {
      window.applyBatchSubject(encodeURIComponent(JSON.stringify(sub)), sem, uni);
    });
    controls.append(actions, useButton);
    row.append(details, controls);
    list.appendChild(row);
  });
}
document.getElementById('batchUniSelect')?.addEventListener('change', (e) => {
  const uni = e.target.value;
  const sem = document.getElementById('batchSemSelect') ? document.getElementById('batchSemSelect').value : '6th';
  saveBatchSwitcherSettings(uni, sem);
  renderBatchSubjectsList();
});
document.getElementById('batchSemSelect')?.addEventListener('change', (e) => {
  const sem = e.target.value;
  const uni = document.getElementById('batchUniSelect') ? document.getElementById('batchUniSelect').value : DEFAULT_UNIVERSITY_ID;
  saveBatchSwitcherSettings(uni, sem);
  renderBatchSubjectsList();
});
document.getElementById('batchSubjectSearch')?.addEventListener('input', renderBatchSubjectsList);
document.getElementById('openCourseSwitcherTopBtn')?.addEventListener('click', openBatchModal);
window.applyBatchSubject = function (subJsonEncoded, selectedSem, selectedUni) {
  const sub = JSON.parse(decodeURIComponent(subJsonEncoded));
  if (selectedUni !== currentUniKey && selectedUni !== 'custom') {
    const uniSel = document.getElementById('uniPresetSelect');
    if (uniSel)
      uniSel.value = selectedUni;
    loadUniversityPreset(selectedUni);
  }
  currentFormData.code = sub.code;
  currentFormData.title = sub.title;
  currentFormData.department = sub.department;
  currentFormData.sem = selectedSem;
  const fCode = document.getElementById('field_code');
  const fTitle = document.getElementById('field_title');
  const fDept = document.getElementById('field_department');
  const fSem = document.getElementById('field_sem');
  if (fCode)
    fCode.value = sub.code;
  if (fTitle)
    fTitle.value = sub.title;
  if (fDept)
    fDept.value = sub.department;
  if (fSem)
    fSem.value = selectedSem;
  canvasElements.forEach(el => {
    const b = getBoundFieldForElement(el);
    if (b && ['code', 'title', 'department', 'sem'].includes(b)) {
      delete el.customContent;
    }
  });
  const modal = document.getElementById('batchModal');
  if (modal)
    modal.style.display = 'none';
  renderPageCanvas();
  scheduleAutoCompile();
  showToast(`Switched to: ${sub.title} (${selectedSem} Sem)`);
};
document.getElementById('closeBatchModal')?.addEventListener('click', () => {
  const modal = document.getElementById('batchModal');
  if (modal)
    modal.style.display = 'none';
});
document.getElementById('closeBatchModalDone')?.addEventListener('click', () => {
  const modal = document.getElementById('batchModal');
  if (modal)
    modal.style.display = 'none';
});
const batchCustomSubjectForm = document.getElementById('batchCustomSubjectForm');
let editingBatchSubject = null;
function resetBatchSubjectForm(hide = true) {
  if (!batchCustomSubjectForm)
    return;
  editingBatchSubject = null;
  batchCustomSubjectForm.reset();
  const dept = document.getElementById('batchCustomDepartment');
  if (dept)
    dept.value = 'Department of Computer Science Engineering';
  const heading = batchCustomSubjectForm.querySelector('.batch-custom-title');
  if (heading)
    heading.textContent = 'Add a subject to this semester';
  const submit = batchCustomSubjectForm.querySelector('[type="submit"]');
  if (submit)
    submit.textContent = 'Save subject';
  if (hide)
    batchCustomSubjectForm.hidden = true;
}
function beginEditBatchSubject(uni, sem, subject) {
  if (!batchCustomSubjectForm)
    return;
  editingBatchSubject = { uni, sem, code: subject.code, title: subject.title, department: subject.department };
  setUniversityPicker(document.getElementById('batchUniSelect'), uni, document.getElementById('batchUniSelect').options[0]?.value || '');
  document.getElementById('batchSemSelect').value = sem;
  document.getElementById('batchCustomCode').value = subject.code;
  document.getElementById('batchCustomTitle').value = subject.title;
  document.getElementById('batchCustomDepartment').value = subject.department || 'Department of Computer Science Engineering';
  batchCustomSubjectForm.querySelector('.batch-custom-title').textContent = 'Edit subject';
  batchCustomSubjectForm.querySelector('[type="submit"]').textContent = 'Save changes';
  batchCustomSubjectForm.hidden = false;
  document.getElementById('batchCustomCode')?.focus();
}
async function deleteBatchSubject(uni, sem, subject) {
  const list = UNIVERSITY_SEMESTER_COURSES[uni]?.[sem] || [];
  const index = list.findIndex((item) => item.code === subject.code && item.title === subject.title && (item.department || '') === (subject.department || ''));
  if (index < 0)
    return;
  const confirmed = await window.coverdraftConfirm({ title: 'Delete subject?', message: `Delete “${subject.title}” (${subject.code}) from the ${sem} semester?`, confirmLabel: 'Delete', danger: true, skipKey: 'delete-subject' });
  if (!confirmed)
    return;
  window.removeSubjectShortcutReferences?.(uni, sem, subject);
  list.splice(index, 1);
  persistCourseCatalog(uni, sem);
  if (editingBatchSubject && editingBatchSubject.uni === uni && editingBatchSubject.sem === sem && editingBatchSubject.code === subject.code && editingBatchSubject.title === subject.title)
    resetBatchSubjectForm();
  renderBatchSubjectsList();
  window.refreshSubjectShortcutBar?.();
  showToast(`Deleted subject: ${subject.title}`);
}
document.getElementById('addNewBatchSubjectBtn')?.addEventListener('click', () => {
  // Adding uses the short dialog (name, optional code); the longer inline form below is only used to edit a subject.
  resetBatchSubjectForm(true);
  window.coverdraftOpenAddSubject?.({
    uni: document.getElementById('batchUniSelect')?.value,
    sem: document.getElementById('batchSemSelect')?.value
  });
});
document.getElementById('cancelBatchCustomSubject')?.addEventListener('click', () => resetBatchSubjectForm());
batchCustomSubjectForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const uni = document.getElementById('batchUniSelect')?.value || DEFAULT_UNIVERSITY_ID;
  const sem = document.getElementById('batchSemSelect')?.value || '6th';
  const code = (document.getElementById('batchCustomCode')?.value || '').trim();
  const title = (document.getElementById('batchCustomTitle')?.value || '').trim();
  const department = (document.getElementById('batchCustomDepartment')?.value || '').trim();
  if (!code || !title || !department)
    return;
  if (!UNIVERSITY_SEMESTER_COURSES[uni])
    UNIVERSITY_SEMESTER_COURSES[uni] = {};
  if (!Array.isArray(UNIVERSITY_SEMESTER_COURSES[uni][sem]))
    UNIVERSITY_SEMESTER_COURSES[uni][sem] = [];
  const catalog = UNIVERSITY_SEMESTER_COURSES[uni][sem];
  const isEditing = !!editingBatchSubject;
  const old = editingBatchSubject;
  if (isEditing && (old.uni !== uni || old.sem !== sem)) {
    showToast('Choose the original university and semester to save this edit.', false);
    return;
  }
  const duplicate = catalog.some((item) => {
    const sameOriginal = isEditing && item.code === old.code && item.title === old.title && (item.department || '') === (old.department || '');
    return !sameOriginal && (String(item.code).toLowerCase() === code.toLowerCase() || String(item.title).toLowerCase() === title.toLowerCase());
  });
  if (duplicate) {
    showToast('A subject with this code or name already exists in the semester.', false);
    return;
  }
  const subject = { code, title, department };
  if (isEditing) {
    const index = catalog.findIndex((item) => item.code === old.code && item.title === old.title && (item.department || '') === (old.department || ''));
    if (index < 0) {
      showToast('This subject no longer exists. Refresh the list and try again.', false);
      resetBatchSubjectForm();
      return;
    }
    window.updateSubjectShortcutReferences?.(uni, sem, old, subject);
    catalog[index] = subject;
  } else {
    catalog.push(subject);
    persistCustomCourse(uni, sem, subject);
  }
  persistCourseCatalog(uni, sem);
  resetBatchSubjectForm();
  renderBatchSubjectsList();
  window.refreshSubjectShortcutBar?.();
  const wasCurrent = isEditing && currentUniKey === uni && currentFormData.sem === sem && currentFormData.code === old.code && currentFormData.title === old.title;
  if (wasCurrent) {
    window.applyBatchSubject(encodeURIComponent(JSON.stringify(subject)), sem, uni);
    const modal = document.getElementById('batchModal');
    if (modal)
      modal.style.display = 'flex';
  }
  showToast(isEditing ? `Updated subject: ${title}` : `Added subject: ${title}`);
});
const mergerModal = document.getElementById('mergerModal');
document.getElementById('openMergerBtn')?.addEventListener('click', () => {
  if (mergerModal)
    mergerModal.style.display = 'flex';
});
document.getElementById('closeMergerModal')?.addEventListener('click', () => {
  if (mergerModal)
    mergerModal.style.display = 'none';
});
document.getElementById('cancelMergerBtn')?.addEventListener('click', () => {
  if (mergerModal)
    mergerModal.style.display = 'none';
});
document.getElementById('assignmentPdfInput')?.addEventListener('change', async function (e) {
  const selectionToken = window.noteAttachmentSelection?.();
  const file = e.target.files?.[0];
  if (!file)
    return;
  const maxAttachmentBytes = 40 * 1024 * 1024;
  const status = document.getElementById('attachedPdfStatus');
  if (file.size > maxAttachmentBytes) {
    e.target.value = '';
    if (status)
      status.textContent = 'The selected file is too large. Choose a PDF smaller than 40 MB.';
    showToast('PDF is too large. The maximum attachment size is 40 MB.', false);
    return;
  }
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    e.target.value = '';
    if (status)
      status.textContent = 'Choose a PDF document to attach.';
    showToast('Only PDF files can be attached.', false);
    return;
  }
  let signature;
  try {
    signature = await file.slice(0, 5).arrayBuffer();
  } catch (_) {
    if (selectionToken && !window.isCurrentAttachmentSelection?.(selectionToken))
      return;
    e.target.value = '';
    if (status)
      status.textContent = 'Could not read the selected file. Try again.';
    showToast('Could not read the selected file. Try again.', false);
    return;
  }
  if (selectionToken && !window.isCurrentAttachmentSelection?.(selectionToken))
    return;
  if (new TextDecoder().decode(signature) !== '%PDF-') {
    e.target.value = '';
    if (status)
      status.textContent = 'This file does not appear to be a valid PDF.';
    showToast('The selected file is not a valid PDF.', false);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (selectionToken && !window.isCurrentAttachmentSelection?.(selectionToken))
      return;
    uploadedAssignmentPdf = reader.result;
    uploadedAssignmentFileName = file.name;
    document.getElementById('pdfDropZone')?.classList.add('has-file');
    const meta = document.getElementById('attachedPdfMeta');
    const nameEl = document.getElementById('attachedPdfName');
    if (meta)
      meta.style.display = 'block';
    if (nameEl)
      nameEl.innerHTML = `${lucideSvg('check', 14)} ${escHtml(file.name)} (${Math.round(file.size / 1024)} KB)`;
    if (status)
      status.textContent = 'Ready for front-page injection. Saving attachment locally…';
    window.persistAttachedPdf?.(file.name, reader.result, file.size);
    showToast('Assignment attached for front-page merger');
  };
  reader.onerror = () => {
    if (selectionToken && !window.isCurrentAttachmentSelection?.(selectionToken))
      return;
    e.target.value = '';
    if (status)
      status.textContent = 'Could not read the selected file. Try again.';
    showToast('Could not read the selected PDF.', false);
  };
  reader.onabort = () => {
    if (selectionToken && !window.isCurrentAttachmentSelection?.(selectionToken))
      return;
    if (status)
      status.textContent = 'PDF loading was cancelled. Try again.';
  };
  reader.readAsArrayBuffer(file);
});
document.getElementById('confirmMergeDownloadBtn')?.addEventListener('click', async () => {
  if (mergerModal)
    mergerModal.style.display = 'none';
  await exportFinalPdf(true);
});
function openMobileSidebar() {
  document.getElementById('appSidebar')?.classList.add('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.add('visible');
}
function closeMobileSidebar() {
  document.getElementById('appSidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('visible');
}
document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
  const sidebar = document.getElementById('appSidebar');
  if (sidebar?.classList.contains('mobile-open')) {
    closeMobileSidebar();
  } else {
    openMobileSidebar();
  }
});
document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);
tabBatch?.addEventListener('click', closeMobileSidebar);
// Draggable sidebar width with a remembered desktop preference.
(function setupSidebarResizing() {
  const sidebar = document.getElementById('appSidebar');
  const handle = document.getElementById('sidebarResizeHandle');
  if (!sidebar || !handle)
    return;
  const root = document.documentElement;
  const key = 'coverdraft_sidebar_width_v1';
  const clamp = (value) => Math.max(280, Math.min(680, value));
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && saved >= 280)
      root.style.setProperty('--sidebar-width', `${clamp(saved)}px`);
  } catch (_) { }
  let startX = 0, startWidth = 0;
  handle.addEventListener('pointerdown', (event) => {
    if (window.innerWidth <= 860 || sidebar.classList.contains('sidebar-collapsed'))
      return;
    if (event.button !== 0)
      return;
    event.preventDefault();
    startX = event.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    document.body.classList.add('resizing-sidebar');
    handle.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      const width = clamp(startWidth + moveEvent.clientX - startX);
      root.style.setProperty('--sidebar-width', `${width}px`);
    };
    const finish = () => {
      document.body.classList.remove('resizing-sidebar');
      try {
        localStorage.setItem(key, String(Math.round(sidebar.getBoundingClientRect().width)));
      } catch (_) { }
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key) || window.innerWidth <= 860)
      return;
    event.preventDefault();
    const current = sidebar.getBoundingClientRect().width;
    const width = event.key === 'Home' ? 400 : clamp(current + (event.key === 'ArrowRight' ? 16 : -16));
    root.style.setProperty('--sidebar-width', `${width}px`);
    try {
      localStorage.setItem(key, String(width));
    } catch (_) { }
  });
  handle.addEventListener('dblclick', () => {
    root.style.setProperty('--sidebar-width', '400px');
    try {
      localStorage.setItem(key, '400');
    } catch (_) { }
  });
})();
window.addEventListener('load', () => {
  const loadedFromShare = loadFromUrlHash();
  if (!loadedFromShare) {
    loadUniversityPreset(DEFAULT_UNIVERSITY_ID);
    loadDocumentFromLocalStorage();
  }
  initAppMode();
  if (experimentsList.length === 0) {
    experimentsList = [{ no: 1, title: '', page: '', date: '' }];
  }
  renderExperimentsPanel();
  document.getElementById('zoomFitBtn')?.click();
});
function loadDocumentFromLocalStorage() {
  try {
    let raw = localStorage.getItem('coverdraft_document_v1');
    if (!raw) {
      const previous = localStorage.getItem('coverdraft_document_backup_v1');
      if (previous) {
        try {
          const parsed = JSON.parse(previous);
          if (parsed?.documentPages && parsed?.currentFormData) {
            raw = previous;
            localStorage.setItem('coverdraft_document_v1', previous);
            showToast('Recovered your previous local save');
          }
        } catch (_) { }
      }
      if (!raw)
        return;
    }
    const saved = JSON.parse(raw);
    const isImportedPageKey = (key) => typeof key === 'string' && /^import-\d+$/.test(key);
    const allowedPages = [...new Set(['cover', 'index', ...Object.keys(saved.documentPages || {}).filter(isImportedPageKey)])].slice(0, 36);
    if (saved.currentUniKey && UNI_CONFIGS[saved.currentUniKey] && saved.currentUniKey !== currentUniKey) {
      currentUniKey = saved.currentUniKey;
      setUniversityPicker(document.getElementById('uniPresetSelect'), currentUniKey);
      loadUniversityPreset(currentUniKey);
    }
    renderDynamicForm(currentUniKey);
    if (saved.currentFormData && typeof saved.currentFormData === 'object')
      Object.assign(currentFormData, saved.currentFormData);
    if (saved.documentPages && typeof saved.documentPages === 'object') {
      const restored = {};
      allowedPages.forEach(k => restored[k] = Array.isArray(saved.documentPages[k]) ? saved.documentPages[k] : []);
      documentPages = restored;
    }
    if (saved.experimentsList && Array.isArray(saved.experimentsList))
      experimentsList = saved.experimentsList;
    // Always reopen on the Cover, whichever page the previous session ended on.
    currentPageKey = 'cover';
    if (saved.activeTemplateId)
      activeTemplateId = saved.activeTemplateId;
    const restoredLogo = window.coverdraftValidateLogoData?.(saved.userUploadedLogo);
    if (restoredLogo) {
      userUploadedLogo = restoredLogo;
      document.getElementById('logoDropZone')?.classList.add('has-file');
      const logoLabel = document.getElementById('logoDropText');
      if (logoLabel)
        logoLabel.textContent = 'Saved emblem restored from this device';
    } else if (saved.userUploadedLogo) {
      userUploadedLogo = null;
      document.getElementById('logoDropZone')?.classList.remove('has-file');
    }
    const design = saved.design || {};
    const setVal = (id, value, prop = 'value') => {
      const el = document.getElementById(id);
      if (el && value !== undefined && value !== null)
        el[prop] = value;
    };
    setVal('f_fontFamily', design.fontFamily);
    setVal('f_fontScale', design.fontScale);
    setVal('f_lineSpacing', design.lineSpacing);
    setVal('f_showBorder', design.showBorder, 'checked');
    setVal('f_borderStyle', design.borderStyle);
    setVal('f_borderWidth', design.borderWidth);
    setVal('f_borderInset', design.borderInset);
    setVal('f_borderColor', design.borderColor);
    const fields = (UNI_CONFIGS[currentUniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID]).fields;
    fields.forEach(field => {
      const input = document.getElementById(`field_${field.id}`);
      if (input && currentFormData[field.id] !== undefined)
        input.value = currentFormData[field.id];
    });
    // A saved cover with no elements would open as an empty page, so rebuild it from the university template.
    if (!Array.isArray(documentPages.cover) || documentPages.cover.length === 0) {
      documentPages.cover = [];
      try {
        applyTemplate(UNI_CONFIGS[currentUniKey]?.styleId || DEFAULT_STYLE_ID);
      } catch (error) {
        console.warn('Could not rebuild an empty cover', error);
      }
    }
    canvasElements = documentPages[currentPageKey] || documentPages.cover;
    document.querySelectorAll('.view-tab[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === currentPageKey));
    renderExperimentsPanel();
    renderPageCanvas();
    activateSidebarPanel('doc');
    window.updateDesignControlLabels?.();
    window.updateSaveStatus?.('saved', saved.savedAt);
  } catch (e) {
    console.warn('Could not restore saved document:', e);
    try {
      const rawBackup = localStorage.getItem('coverdraft_document_backup_v1');
      if (!rawBackup)
        return;
      const backup = JSON.parse(rawBackup);
      if (!backup || !backup.documentPages || !backup.currentFormData)
        return;
      localStorage.setItem('coverdraft_document_v1', rawBackup);
      if (backup.currentUniKey && UNI_CONFIGS[backup.currentUniKey]) {
        currentUniKey = backup.currentUniKey;
        setUniversityPicker(document.getElementById('uniPresetSelect'), currentUniKey);
        loadUniversityPreset(currentUniKey);
      }
      if (backup.documentPages)
        documentPages = backup.documentPages;
      if (backup.experimentsList)
        experimentsList = backup.experimentsList;
      if (['cover', 'index'].includes(backup.currentPageKey) || (typeof backup.currentPageKey === 'string' && /^import-\d+$/.test(backup.currentPageKey) && backup.documentPages[backup.currentPageKey]))
        currentPageKey = backup.currentPageKey;
      if (backup.design) {
        const design = backup.design;
        const setVal = (id, value, prop = 'value') => {
          const el = document.getElementById(id);
          if (el && value != null)
            el[prop] = value;
        };
        setVal('f_fontFamily', design.fontFamily);
        setVal('f_fontScale', design.fontScale);
        setVal('f_lineSpacing', design.lineSpacing);
        setVal('f_showBorder', design.showBorder, 'checked');
        setVal('f_borderStyle', design.borderStyle);
        setVal('f_borderWidth', design.borderWidth);
        setVal('f_borderInset', design.borderInset);
        setVal('f_borderColor', design.borderColor);
      }
      renderDynamicForm(currentUniKey);
      Object.assign(currentFormData, backup.currentFormData);
      (UNI_CONFIGS[currentUniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID]).fields.forEach(field => {
        const el = document.getElementById(`field_${field.id}`);
        if (el && currentFormData[field.id] !== undefined)
          el.value = currentFormData[field.id];
      });
      canvasElements = documentPages[currentPageKey] || documentPages.cover;
      renderExperimentsPanel();
      renderPageCanvas();
      window.updateSaveStatus?.('saved', backup.savedAt);
      showToast('Recovered your previous local save');
    } catch (backupError) {
      console.warn('Previous local save could not be recovered:', backupError);
    }
  }
}
