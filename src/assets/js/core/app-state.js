/* Shared application state and page-level helpers. University presets, crests, layouts and subject
   lists live in src/templates/<id>/ and arrive through data/templates.generated.js. */

function getLogoMarkup() {
  if (userUploadedLogo) {
    return `<img src="${userUploadedLogo}" alt="Custom Emblem" style="width:100%;height:100%;object-fit:contain;">`;
  }
  return UNI_CRESTS[currentUniKey] || UNI_CRESTS[DEFAULT_UNIVERSITY_ID];
}

const DEFAULT_UNIVERSITY_ID = (UNIVERSITY_LIST.find((university) => !university.hidden) || UNIVERSITY_LIST[0]).id;
const DEFAULT_STYLE_ID = UNI_CONFIGS[DEFAULT_UNIVERSITY_ID].styleId;
let currentUniKey = DEFAULT_UNIVERSITY_ID;
let activeTemplateId = DEFAULT_STYLE_ID;
let canvasElements = [];
let customIdCount = 0;
let userUploadedLogo = null;

let documentPages = { cover: [], index: [] };
let currentPageKey = 'cover';
let experimentsList = [];

/* =========================================================
   TWO-WAY TOKEN BINDING (Single Source of Truth)
   Maps element IDs to data fields so on-canvas typing keeps
   currentFormData & sidebar inputs in continuous synchronization.
   ========================================================= */
function getBoundFieldForElement(el) {
  if (!el) return null;
  if (el.bindField) return el.bindField;
  if (el.id === 'uni_name' || el.id === 'idx_uni') return 'university';
  if (el.id === 'dept_line') return 'department';
  if (el.id === 'title') return 'title';
  if (el.id === 'code_line') return 'code';
  if (el.id === 'degree_title') return 'degreeFull';
  if (el.id === 'specialization') return 'specialization';
  if (el.id === 'submitted_to') return 'prof';
  if (el.id === 'college_line') return 'college';
  if (el.id === 'task_line') return 'taskNo';

  const match = typeof el.text === 'string' && el.text.trim().match(/^\{([a-zA-Z0-9_]+)\}$/);
  if (match) return match[1];
  return null;
}

// New index rows start with today's local date; the student can change or clear it.
function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function switchToPage(key) {
  if (!documentPages[key]) return;
  documentPages[currentPageKey] = canvasElements;
  currentPageKey = key;
  canvasElements = documentPages[key];
  if (canvasElements.length === 0) {
    if (key === 'index') canvasElements = documentPages.index = window.coverdraftScaleA4Layout?.(buildIndexTemplate()) || buildIndexTemplate();
  }
  deselectAll();
  renderPageCanvas();
}

function buildIndexTemplate() {
  return [
    { id: 'idx_uni', x: 60, y: 60, w: 674, align: 'center', weight: 'bold', size: 18, text: '{university}', color: '#111' },
    { id: 'idx_title', x: 60, y: 100, w: 674, align: 'center', weight: 'bold', size: 20, underline: true, text: 'INDEX', color: '#111' },
    { id: 'idx_meta', x: 60, y: 150, w: 674, align: 'left', weight: 'normal', size: 13.5, text: 'Subject: <b>{title}</b> &nbsp;&nbsp;|&nbsp;&nbsp; Student: <b>{name}</b>', color: '#111' },
    { id: 'idx_table', type: 'expTable', x: 60, y: 190, w: 674 }
  ];
}

const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/* Index rows are { no, title, page, date }. */
function indexRowDate(row) { return String(row.date ?? ''); }
function normalizeIndexRows(list) {
  (list || []).forEach((row, i) => {
    if (row.date === undefined) row.date = '';
    if (row.page === undefined) row.page = '';
    row.no = i + 1;
  });
}
function formatIndexDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : escHtml(value || '');
}

function renderExperimentTable(experiments) {
  const cols = ['Sr. No.', 'Title', 'Page No.', 'Date', 'Signature'];
  const widths = ['9%', '50%', '12%', '14%', '15%'];
  let html = '<table class="exp-table"><thead><tr>';
  cols.forEach((c, i) => { html += `<th style="width:${widths[i]}">${c}</th>`; });
  html += '</tr></thead><tbody>';
  (experiments.length ? experiments : [{ no: 1, title: '', page: '', date: '' }]).forEach((row, rowIndex) => {
    html += `<tr>
      <td>${escHtml(row.no ?? '')}</td>
      <td class="exp-title-cell" data-index-field="title" data-index-row="${rowIndex}">${escHtml(row.title || '')}</td>
      <td data-index-field="page" data-index-row="${rowIndex}">${escHtml(row.page || '')}</td>
      <td data-index-field="date" data-index-row="${rowIndex}">${formatIndexDate(indexRowDate(row))}</td>
      <td></td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

function persistIndexRows() {
  if (typeof window.coverdraftSaveExp === 'function') window.coverdraftSaveExp();
}
function refreshIndexPreview() {
  if (currentPageKey === 'index') renderPageCanvas();
  if (typeof scheduleAutoCompile === 'function') scheduleAutoCompile();
}

function renderExperimentsPanel() {
  const wrap = document.getElementById('experimentsListWrap');
  if (!wrap) return;
  normalizeIndexRows(experimentsList);
  const count = document.getElementById('indexEntryCount');
  const filled = experimentsList.filter((r) => String(r.title || '').trim()).length;
  if (count) count.textContent = filled === 1 ? '1 entry' : `${filled} entries`;
  const clearBtn = document.getElementById('clearIndexBtn');
  if (clearBtn) clearBtn.hidden = experimentsList.length === 0;

  if (experimentsList.length === 0) {
    wrap.innerHTML = '<div class="index-empty">No entries yet. Add an entry below to build your index.</div>';
    return;
  }
  const last = experimentsList.length - 1;
  wrap.innerHTML = experimentsList.map((row, i) => `
    <div class="exp-row-card index-entry" data-idx="${i}">
      <div class="index-entry-top">
        <span class="index-entry-no">${row.no}</span>
        <input type="text" class="input-box exp-field" data-field="title" aria-label="Title for entry ${row.no}" placeholder="Title" value="${escHtml(row.title)}">
        <div class="index-entry-actions">
          <button type="button" class="icon-btn" data-act="up" title="Move up" aria-label="Move entry ${row.no} up" ${i === 0 ? 'disabled' : ''}>${lucideSvg('chevron-up')}</button>
          <button type="button" class="icon-btn" data-act="down" title="Move down" aria-label="Move entry ${row.no} down" ${i === last ? 'disabled' : ''}>${lucideSvg('chevron-down')}</button>
          <button type="button" class="icon-btn danger exp-remove-btn" data-act="remove" title="Remove" aria-label="Remove entry ${row.no}">${lucideSvg('trash-2')}</button>
        </div>
      </div>
      <div class="index-entry-meta">
        <input type="text" class="input-box exp-field" data-field="page" aria-label="Page number for entry ${row.no}" placeholder="Page no." value="${escHtml(row.page)}" maxlength="12">
        <input type="date" class="input-box exp-field" data-field="date" aria-label="Date for entry ${row.no}" value="${escHtml(row.date)}">
      </div>
    </div>`).join('');
}

(function bindIndexPanel() {
  const wrap = document.getElementById('experimentsListWrap');
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = '1';
  const rowOf = (el) => el.closest('.exp-row-card');
  const focusTitle = (idx) => wrap.querySelector(`.exp-row-card[data-idx="${idx}"] [data-field="title"]`)?.focus();
  wrap.addEventListener('input', (e) => {
    const input = e.target.closest('.exp-field');
    const card = input && rowOf(input);
    if (!card) return;
    const row = experimentsList[parseInt(card.dataset.idx, 10)];
    if (!row) return;
    row[input.dataset.field] = input.value;
    if (input.dataset.field === 'title') {
      const n = experimentsList.filter((r) => String(r.title || '').trim()).length;
      const count = document.getElementById('indexEntryCount');
      if (count) count.textContent = n === 1 ? '1 entry' : `${n} entries`;
    }
    refreshIndexPreview();
  });
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const card = btn && rowOf(btn);
    if (!card || btn.disabled) return;
    const idx = parseInt(card.dataset.idx, 10);
    const act = btn.dataset.act;
    if (act === 'remove') experimentsList.splice(idx, 1);
    else if (act === 'up' && idx > 0) [experimentsList[idx - 1], experimentsList[idx]] = [experimentsList[idx], experimentsList[idx - 1]];
    else if (act === 'down' && idx < experimentsList.length - 1) [experimentsList[idx + 1], experimentsList[idx]] = [experimentsList[idx], experimentsList[idx + 1]];
    experimentsList.forEach((r, i) => { r.no = i + 1; });
    renderExperimentsPanel();
    persistIndexRows();
    refreshIndexPreview();
    if (act !== 'remove') wrap.querySelector(`.exp-row-card[data-idx="${act === 'up' ? idx - 1 : idx + 1}"] [data-act="${act}"]`)?.focus();
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || !e.target.matches('[data-field="title"]')) return;
    e.preventDefault();
    const idx = parseInt(rowOf(e.target).dataset.idx, 10);
    experimentsList.splice(idx + 1, 0, { no: idx + 2, title: '', page: '', date: todayIsoDate() });
    experimentsList.forEach((r, i) => { r.no = i + 1; });
    renderExperimentsPanel();
    persistIndexRows();
    refreshIndexPreview();
    focusTitle(idx + 1);
  });
  document.getElementById('addExperimentBtn')?.addEventListener('click', () => {
    experimentsList.push({ no: experimentsList.length + 1, title: '', page: '', date: todayIsoDate() });
    renderExperimentsPanel();
    persistIndexRows();
    refreshIndexPreview();
    focusTitle(experimentsList.length - 1);
    wrap.scrollTop = wrap.scrollHeight;
  });
  document.getElementById('clearIndexBtn')?.addEventListener('click', async () => {
    if (!experimentsList.length) return;
    const confirmed = await window.coverdraftConfirm({ title: 'Remove all index entries?', message: 'Every entry in this subject’s index will be removed.', confirmLabel: 'Remove all', danger: true, skipKey: 'clear-index-entries' });
    if (!confirmed) return;
    experimentsList = [];
    renderExperimentsPanel();
    persistIndexRows();
    refreshIndexPreview();
  });
})();

let uploadedAssignmentPdf = null;
let uploadedAssignmentFileName = '';
let selectedDomEl = null;
let zoomLevel = 0.85;
let isSmartSnapEnabled = true;
let autoCompileTimer = null;
let currentFormData = {};

/* True for picker values that are user-saved layouts rather than universities. */
const isSavedLayoutValue = (value) => /^saved-(layout|format):/.test(String(value || ''));

/* Selects `key` in a university picker. A university that was deleted from the picker shows as `fallback`. */
function setUniversityPicker(select, key, fallback = 'custom') {
  if (!select) return;
  select.value = [...select.options].some((option) => option.value === key) ? key : fallback;
}
