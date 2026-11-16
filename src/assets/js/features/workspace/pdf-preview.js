/* Page selection manager (choose, reorder, persist) and the Preview PDF dialog. They share the page order and the ticked-subject selection. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { set: safeSet } = window.coverdraftStorage;
  const PAGE_SETTINGS_KEY = 'coverdraft_pages_v2';
  const ALLOWED_PAGES = ['cover', 'index'];
  const isPageKeyAllowed = (key) => ALLOWED_PAGES.includes(key) || (typeof key === 'string' && /^import-\d+$/.test(key));
  let previewImages = [];
  let previewLabels = [];
  let previewIndex = 0;
  let previewBusy = false;
  let previewSequence = 0;
  let previewRefreshRequested = false;
  let previewRefreshTimer = 0;
  let dragRow = null;
  let subjectSelectionSignature = '';
  let selectedSubjectKeySet = new Set();
  // How many copies (full sets of the chosen pages) each subject gets, by subject key.
  const subjectCopies = new Map();
  const MAX_COPIES = 50;
  const copiesFor = (key) => Math.max(1, Math.min(MAX_COPIES, subjectCopies.get(key) || 1));
  const tickedSubjectKeys = () => [...document.querySelectorAll('#subjectRows input[type="checkbox"]:checked')].map(input => input.value);
  const copiesObject = () => Object.fromEntries(tickedSubjectKeys().map(key => [key, copiesFor(key)]));
  window.coverdraftPreviewSelection = () => ({
    multi: Boolean($('multiSubjectExportCheck')?.checked),
    keys: tickedSubjectKeys(),
    copies: copiesObject()
  });
  const syncRowState = (label) => {
    const input = label.querySelector('input[type="checkbox"]');
    const on = Boolean(input?.checked);
    label.classList.toggle('is-off', !on);
    const key = input?.value;
    const value = label.querySelector('.subject-qty-value');
    const minus = label.querySelector('.subject-qty-btn[data-step="-1"]');
    const plus = label.querySelector('.subject-qty-btn[data-step="1"]');
    const copies = copiesFor(key);
    if (value)
      value.textContent = String(copies);
    if (minus)
      minus.disabled = !on || copies <= 1;
    if (plus)
      plus.disabled = !on || copies >= MAX_COPIES;
  };
  // Page selection manager: checkbox selection, drag reordering, safe defaults, count, and persistent settings.
  const pageRows = $('pageRows');
  function rowsInOrder() {
    return pageRows ? [...pageRows.querySelectorAll('.page-row[data-pg]')] : [];
  }
  function savePageManager() {
    if (!pageRows)
      return;
    const ordered = rowsInOrder();
    if (ordered.length && !ordered.some((row) => row.querySelector('input[type="checkbox"]')?.checked)) {
      const cover = pageRows.querySelector('[data-pg="cover"] input[type="checkbox"]');
      if (cover)
        cover.checked = true;
    }
    const order = rowsInOrder().map((row) => row.dataset.pg).filter(isPageKeyAllowed);
    const on = rowsInOrder().filter((row) => row.querySelector('input[type="checkbox"]')?.checked).map((row) => row.dataset.pg);
    safeSet(PAGE_SETTINGS_KEY, { order, on });
    const count = $('pagesIncludedCount');
    if (count)
      count.textContent = document.body.classList.contains('simple-mode')
        ? 'Cover only in Simple mode'
        : `${on.length} page${on.length === 1 ? '' : 's'} included`;
    syncSelectAllLabels();
    if (typeof scheduleAutoCompile === 'function')
      scheduleAutoCompile();
  }
  function syncSelectAllLabels() {
    const pages = rowsInOrder().map((row) => row.querySelector('input[type="checkbox"]')).filter(Boolean);
    if ($('selectAllPagesBtn'))
      $('selectAllPagesBtn').textContent = pages.length && pages.every((input) => input.checked) ? 'Deselect all' : 'Select all';
    const subjects = availableExportSubjects();
    if ($('selectAllSubjectsBtn'))
      $('selectAllSubjectsBtn').textContent = subjects.length && subjects.every((subject) => selectedSubjectKeySet.has(subjectKey(subject))) ? 'Deselect all' : 'Select all';
  }
  // ▲ is disabled on the first row and ▼ on the last; Simple mode locks everything except the cover.
  function refreshMoveButtons() {
    const simple = document.body.classList.contains('simple-mode');
    const ordered = rowsInOrder();
    ordered.forEach((row, index) => {
      const locked = simple && row.dataset.pg !== 'cover';
      row.querySelectorAll('.mv').forEach((button) => {
        const direction = Number(button.dataset.d);
        button.disabled = locked || (direction < 0 && index === 0) || (direction > 0 && index === ordered.length - 1);
      });
    });
  }
  function makePageRowsDraggable() {
    rowsInOrder().forEach((row) => {
      if (row.dataset.dragEnabled === 'true')
        return;
      row.dataset.dragEnabled = 'true';
      row.draggable = true;
      row.title = 'Drag to reorder pages, or use the arrow buttons';
      row.addEventListener('dragstart', (event) => {
        dragRow = row;
        row.classList.add('dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', row.dataset.pg);
        }
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        rowsInOrder().forEach((r) => r.classList.remove('drag-over'));
        dragRow = null;
        savePageManager();
        refreshMoveButtons();
      });
      row.addEventListener('dragover', (event) => {
        if (!dragRow || dragRow === row)
          return;
        event.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (event) => {
        if (!dragRow || dragRow === row)
          return;
        event.preventDefault();
        row.classList.remove('drag-over');
        const box = row.getBoundingClientRect();
        if (event.clientY < box.top + box.height / 2)
          pageRows.insertBefore(dragRow, row);
        else
          pageRows.insertBefore(dragRow, row.nextSibling);
        savePageManager();
      });
    });
  }
  window.coverdraftRefreshPageRowBehaviors = makePageRowsDraggable;
  window.coverdraftSavePageManager = savePageManager;
  pageRows?.addEventListener('change', (event) => {
    if (event.target?.matches('input[type="checkbox"]'))
      savePageManager();
  });
  pageRows?.addEventListener('click', (event) => {
    const move = event.target.closest('.mv');
    if (!move)
      return;
    savePageManager();
    refreshMoveButtons();
    // The row was moved in the DOM, so keep keyboard focus on a working arrow of the same row.
    const row = move.closest('[data-pg]');
    (move.disabled ? row?.querySelector('.mv:not(:disabled)') : move)?.focus();
  });
  // Select all / Deselect all: a second click clears. At least one page must stay (savePageManager keeps the cover).
  $('selectAllPagesBtn')?.addEventListener('click', () => {
    const inputs = rowsInOrder().map((row) => row.querySelector('input[type="checkbox"]')).filter(Boolean);
    const allOn = inputs.every((input) => input.checked);
    inputs.forEach((input) => {
      input.checked = !allOn;
    });
    savePageManager();
    refreshMoveButtons();
  });
  $('resetPageOrderBtn')?.addEventListener('click', () => {
    ['cover', 'index', ...rowsInOrder().map((row) => row.dataset.pg).filter((key) => /^import-\d+$/.test(key)).sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))].forEach((key) => {
      const row = pageRows?.querySelector(`[data-pg="${key}"]`);
      if (row)
        pageRows.appendChild(row);
    });
    savePageManager();
    refreshMoveButtons();
    showToast('Default page order restored');
  });
  const originalPdfPages = window.pdfPages;
  window.pdfPages = function () {
    if (document.body.classList.contains('simple-mode'))
      return ['cover'];
    return typeof originalPdfPages === 'function' ? originalPdfPages() : ['cover', 'index'];
  };
  // Keep multi-page captures nondestructive: preview and export leave the editor on the same page.
  const rawCaptureDocPages = window.captureDocPages;
  if (typeof rawCaptureDocPages === 'function') {
    window.captureDocPages = async function (target, scale, options) {
      const originalZoom = zoomLevel;
      const hiddenEls = [...document.querySelectorAll('.el-badge, .guide-line, .resize-handle')].map((el) => ({ el, display: el.style.display }));
      try {
        document.querySelectorAll('.el-badge, .guide-line, .resize-handle').forEach((el) => {
          el.style.display = 'none';
        });
        if (document.fonts?.ready)
          await document.fonts.ready;
        return await rawCaptureDocPages(target, scale, options);
      } finally {
        hiddenEls.forEach(({ el, display }) => {
          if (el.isConnected)
            el.style.display = display;
        });
        updateZoom(originalZoom);
        if (typeof renderExperimentsPanel === 'function')
          renderExperimentsPanel();
        if (typeof renderPageCanvas === 'function')
          renderPageCanvas();
      }
    };
  }
  // Preview and export use the same page capture pipeline and page order.
  function updatePreviewPage() {
    const img = $('pdfPreviewImage');
    const loading = $('pdfPreviewLoading');
    if (!img || !previewImages.length)
      return;
    previewIndex = Math.max(0, Math.min(previewImages.length - 1, previewIndex));
    img.src = previewImages[previewIndex];
    img.hidden = false;
    if (loading)
      loading.hidden = true;
    if ($('pdfPreviewPageLabel'))
      $('pdfPreviewPageLabel').textContent = `${previewLabels[previewIndex] || `Page ${previewIndex + 1}`} · ${previewIndex + 1} of ${previewImages.length}`;
    if ($('previewPrevBtn'))
      $('previewPrevBtn').disabled = previewIndex === 0;
    if ($('previewNextBtn'))
      $('previewNextBtn').disabled = previewIndex >= previewImages.length - 1;
    $('pdfPreviewThumbs')?.querySelectorAll('.pdf-preview-thumb').forEach((button, i) => button.classList.toggle('active', i === previewIndex));
  }
  const labelForPageKey = (key) => key === 'cover' ? 'Cover'
    : key === 'index' ? 'Index'
      : (window.coverdraftPageTitle?.(key) || String(key));
  function pageNamesForShots(count) {
    const selected = window.pdfPages();
    const indexPages = selected.includes('index') ? Math.max(1, count - selected.filter((key) => key !== 'index').length) : 0;
    const labels = [];
    selected.forEach((key) => {
      if (key === 'index')
        for (let i = 0; i < indexPages; i++)
          labels.push(i ? `Index · continuation ${i + 1}` : 'Index');
      else
        labels.push(labelForPageKey(key));
    });
    while (labels.length < count)
      labels.push(`Page ${labels.length + 1}`);
    return labels.slice(0, count);
  }
  function syncPreviewPageControls() {
    const simple = document.body.classList.contains('simple-mode');
    rowsInOrder().forEach((row) => {
      const lockedInSimpleMode = simple && row.dataset.pg !== 'cover';
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (checkbox)
        checkbox.disabled = lockedInSimpleMode;
      row.draggable = !lockedInSimpleMode;
      row.classList.toggle('page-row-locked', lockedInSimpleMode);
    });
    refreshMoveButtons();
    if ($('selectAllPagesBtn'))
      $('selectAllPagesBtn').disabled = simple;
    const hint = $('pdfPageSelectionHint');
    if (hint)
    {
      hint.textContent = simple ? 'Simple mode exports the Cover only. Switch to Advanced mode for more pages.' : '';
      hint.hidden = !simple;
    }
    const count = $('pagesIncludedCount');
    if (count) {
      const selectedCount = rowsInOrder().filter((row) => row.querySelector('input[type="checkbox"]')?.checked).length;
      count.textContent = simple ? 'Cover only in Simple mode' : `${selectedCount} page${selectedCount === 1 ? '' : 's'} included`;
    }
  }
  const subjectKey = (subject) => String(subject?.code || subject?.title || '');
  function availableExportSubjects() {
    return ((UNIVERSITY_SEMESTER_COURSES[currentUniKey] || {})[currentFormData.sem]) || [];
  }
  function renderSubjectSelectionRows(force = false) {
    const container = $('subjectRows');
    if (!container)
      return [];
    const catalog = availableExportSubjects();
    const signature = `${currentUniKey}:${currentFormData.sem}:${catalog.map(subject => `${subjectKey(subject)}=${subject.title || ''}`).join('|')}`;
    const catalogChanged = force || signature !== subjectSelectionSignature;
    if (catalogChanged) {
      subjectSelectionSignature = signature;
      selectedSubjectKeySet = new Set(catalog.map(subjectKey));
    }
    if (!catalogChanged && container.dataset.signature === signature && container.childElementCount) {
      container.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.checked = selectedSubjectKeySet.has(input.value);
      });
      container.querySelectorAll('.subject-check-row').forEach(syncRowState);
      return catalog;
    }
    container.replaceChildren();
    container.dataset.signature = signature;
    if (!catalog.length) {
      const empty = document.createElement('p');
      empty.className = 'subject-check-empty';
      empty.textContent = 'No preset subjects are available for this semester.';
      container.appendChild(empty);
      return catalog;
    }
    catalog.forEach((subject) => {
      const key = subjectKey(subject);
      const label = document.createElement('label');
      label.className = 'subject-check-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = key;
      input.checked = selectedSubjectKeySet.has(key);
      input.addEventListener('change', () => {
        if (input.checked)
          selectedSubjectKeySet.add(key);
        else
          selectedSubjectKeySet.delete(key);
        syncRowState(label);
        updateSubjectExportUI();
      });
      const details = document.createElement('span');
      details.className = 'subject-check-details';
      const title = document.createElement('span');
      title.className = 'subject-check-title';
      title.textContent = subject.title || 'Untitled subject';
      const code = document.createElement('small');
      code.textContent = subject.code || 'No subject code';
      details.append(title, code);
      const stepper = document.createElement('span');
      stepper.className = 'subject-qty';
      stepper.setAttribute('role', 'group');
      stepper.setAttribute('aria-label', `Copies of ${subject.title || 'this subject'}`);
      const makeStep = (step, text, name) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'subject-qty-btn';
        button.dataset.step = String(step);
        button.textContent = text;
        button.setAttribute('aria-label', `${name} copies of ${subject.title || 'this subject'}`);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          subjectCopies.set(key, Math.max(1, Math.min(MAX_COPIES, copiesFor(key) + step)));
          syncRowState(label);
          updateSubjectExportUI();
        });
        return button;
      };
      const value = document.createElement('span');
      value.className = 'subject-qty-value';
      value.setAttribute('aria-live', 'polite');
      stepper.append(makeStep(-1, '−', 'Fewer'), value, makeStep(1, '+', 'More'));
      label.append(input, details, stepper);
      syncRowState(label);
      container.appendChild(label);
    });
    return catalog;
  }
  function updateSubjectExportUI() {
    const toggle = $('multiSubjectExportCheck');
    const controls = $('subjectSelectionControls');
    const count = $('subjectsIncludedCount');
    const description = $('subjectSelectionDescription');
    const button = $('downloadPreviewPdfBtn');
    if (!toggle)
      return;
    const catalog = renderSubjectSelectionRows();
    const isMulti = toggle.checked;
    const selectedCount = catalog.filter(subject => selectedSubjectKeySet.has(subjectKey(subject))).length;
    const totalSets = catalog.filter(subject => selectedSubjectKeySet.has(subjectKey(subject)))
      .reduce((sum, subject) => sum + copiesFor(subjectKey(subject)), 0);
    if (controls)
      controls.hidden = !isMulti;
    if (count)
      count.textContent = isMulti ? (totalSets > selectedCount ? `${selectedCount} of ${catalog.length} · ${totalSets} sets` : `${selectedCount} of ${catalog.length}`) : 'Current subject';
    if (description)
      description.textContent = isMulti
        ? 'Each checked subject gets the pages chosen above. Use − / + for how many copies of each.'
        : 'Only the current subject is exported.';
    toggle.disabled = catalog.length === 0;
    if ($('printVectorBtn')) {
      $('printVectorBtn').disabled = isMulti && selectedCount === 0;
      $('printVectorBtn').title = isMulti
        ? 'Print every ticked subject, with the number of copies you set for each.'
        : "Open your browser's print dialog (sharp, vector text). Choose Save as PDF there.";
    }
    if (button) {
      button.textContent = isMulti
        ? (selectedCount
          ? `Download ${selectedCount > 1 || totalSets > 1 ? 'one PDF' : 'PDF'} · ${totalSets > selectedCount ? `${totalSets} sets` : `${selectedCount} subject${selectedCount === 1 ? '' : 's'}`}`
          : 'Choose subjects')
        : 'Download PDF';
      button.disabled = previewBusy || !previewImages.length || (isMulti && selectedCount === 0);
    }
    // With two or more subjects the same pages can also go out as one separate PDF per subject.
    const individualButton = $('downloadIndividualPdfBtn');
    if (individualButton) {
      individualButton.hidden = !(isMulti && selectedCount > 1);
      individualButton.textContent = `Download individually • ${selectedCount} file${selectedCount === 1 ? '' : 's'}`;
      individualButton.title = totalSets > selectedCount ? `${selectedCount} separate PDFs, one per subject. A subject with more than one copy repeats its pages inside its own file.` : `${selectedCount} separate PDFs, one per subject.`;
      individualButton.disabled = previewBusy || !previewImages.length;
    }
    if ($('pdfPreviewHint'))
      $('pdfPreviewHint').textContent = previewHintText();
    setPreviewMeta();
    syncSelectAllLabels();
  }
  function previewHintText() {
    if ($('multiSubjectExportCheck')?.checked)
      return '';
    return uploadedAssignmentPdf ? `Your attached PDF (${uploadedAssignmentFileName || 'assignment.pdf'}) is added after these pages.` : '';
  }
  function setPreviewMeta() {
    if (!$('pdfPreviewMeta') || !previewImages.length)
      return;
    const order = window.pdfPages().map(labelForPageKey).join(' → ');
    const multi = Boolean($('multiSubjectExportCheck')?.checked);
    const subjects = availableExportSubjects().filter((subject) => selectedSubjectKeySet.has(subjectKey(subject))).length;
    $('pdfPreviewMeta').textContent = `${previewImages.length} page${previewImages.length === 1 ? '' : 's'} · ${order}${multi ? ` · ${subjects} subject${subjects === 1 ? '' : 's'}` : ''}`;
  }
  $('multiSubjectExportCheck')?.addEventListener('change', updateSubjectExportUI);
  $('selectAllSubjectsBtn')?.addEventListener('click', () => {
    const catalog = availableExportSubjects();
    const allOn = catalog.length > 0 && catalog.every((subject) => selectedSubjectKeySet.has(subjectKey(subject)));
    selectedSubjectKeySet = allOn ? new Set() : new Set(catalog.map(subjectKey));
    renderSubjectSelectionRows();
    updateSubjectExportUI();
  });
  $('clearAllSubjectsBtn')?.addEventListener('click', () => {
    selectedSubjectKeySet.clear();
    renderSubjectSelectionRows();
    updateSubjectExportUI();
  });
  // Rendered pages are cached per page key while the dialog is open, so reordering or hiding a page
  // updates instantly instead of re-capturing everything.
  let previewCache = null;
  function applyPreviewImages() {
    previewLabels = pageNamesForShots(previewImages.length);
    previewIndex = Math.max(0, Math.min(previewIndex, previewImages.length - 1));
    const strip = $('pdfPreviewThumbs');
    strip?.replaceChildren();
    previewImages.forEach((src, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pdf-preview-thumb';
      const image = document.createElement('img');
      image.alt = '';
      image.src = src;
      const caption = document.createElement('span');
      caption.textContent = `${i + 1}. ${previewLabels[i] || 'Page'}`;
      button.append(image, caption);
      button.addEventListener('click', () => {
        previewIndex = i;
        updatePreviewPage();
      });
      strip?.appendChild(button);
    });
    setPreviewMeta();
    updatePreviewPage();
  }
  function requestPreviewRefresh() {
    const modal = $('pdfPreviewModal');
    if (!modal || modal.style.display !== 'flex')
      return;
    const keys = window.pdfPages();
    if (!previewBusy && previewCache && keys.length && keys.every((key) => previewCache[key])) {
      previewImages = keys.map((key) => previewCache[key]);
      applyPreviewImages();
      updateSubjectExportUI();
      return;
    }
    previewSequence += 1;
    previewImages = [];
    if ($('downloadPreviewPdfBtn'))
      $('downloadPreviewPdfBtn').disabled = true;
    if ($('downloadIndividualPdfBtn'))
      $('downloadIndividualPdfBtn').disabled = true;
    if ($('pdfPreviewImage'))
      $('pdfPreviewImage').hidden = true;
    $('pdfPreviewThumbs')?.replaceChildren();
    if ($('pdfPreviewLoading')) {
      $('pdfPreviewLoading').hidden = false;
      $('pdfPreviewLoading').textContent = 'Updating preview…';
    }
    if ($('pdfPreviewPageLabel'))
      $('pdfPreviewPageLabel').textContent = 'Updating preview…';
    previewRefreshRequested = true;
    if (previewBusy)
      return;
    window.clearTimeout(previewRefreshTimer);
    previewRefreshTimer = window.setTimeout(() => {
      previewRefreshRequested = false;
      window.openPdfPreview();
    }, 140);
  }
  $('pageRows')?.addEventListener('change', (event) => {
    if (event.target?.matches('input[type="checkbox"]'))
      requestPreviewRefresh();
  });
  $('pageRows')?.addEventListener('click', (event) => {
    if (event.target.closest('.mv'))
      requestPreviewRefresh();
  });
  $('pageRows')?.addEventListener('dragend', requestPreviewRefresh);
  $('selectAllPagesBtn')?.addEventListener('click', requestPreviewRefresh);
  $('resetPageOrderBtn')?.addEventListener('click', requestPreviewRefresh);
  window.openPdfPreview = async function () {
    const modal = $('pdfPreviewModal'), target = $('page');
    if (!modal || !target || previewBusy)
      return;
    if (typeof window.coverdraftBeginExport === 'function' && !window.coverdraftBeginExport())
      return;
    previewBusy = true;
    const sequence = ++previewSequence;
    modal.style.display = 'flex';
    renderSubjectSelectionRows();
    updateSubjectExportUI();
    syncPreviewPageControls();
    $('pdfPreviewThumbs')?.replaceChildren();
    if ($('downloadPreviewPdfBtn'))
      $('downloadPreviewPdfBtn').disabled = true;
    if ($('downloadIndividualPdfBtn'))
      $('downloadIndividualPdfBtn').disabled = true;
    if ($('previewPrevBtn'))
      $('previewPrevBtn').disabled = true;
    if ($('previewNextBtn'))
      $('previewNextBtn').disabled = true;
    $('pdfPreviewImage').hidden = true;
    $('pdfPreviewLoading').hidden = false;
    $('pdfPreviewLoading').textContent = 'Preparing your pages…';
    $('pdfPreviewPageLabel').textContent = 'Preparing preview…';
    $('pdfPreviewMeta').textContent = 'Preparing your pages…';
    $('pdfPreviewHint').textContent = previewHintText();
    const previousZoom = zoomLevel;
    previewImages = [];
    previewLabels = [];
    previewCache = null;
    updateZoom(1);
    try {
      if (typeof scheduleAutoCompile === 'function')
        scheduleAutoCompile();
      await window.captureDocPages(target, 0.85, {
        onPage: (canvas) => {
          if (sequence === previewSequence)
            previewImages.push(canvas.toDataURL('image/jpeg', 0.76));
          canvas.width = 1;
          canvas.height = 1;
        }
      });
      if (sequence !== previewSequence)
        return;
      if (!previewImages.length)
        throw new Error('No pages are selected for preview.');
      const capturedKeys = window.pdfPages();
      previewCache = capturedKeys.length === previewImages.length ? Object.fromEntries(capturedKeys.map((key, i) => [key, previewImages[i]])) : null;
      previewIndex = 0;
      applyPreviewImages();
    } catch (error) {
      if (sequence !== previewSequence)
        return;
      console.error('PDF preview failed:', error);
      $('pdfPreviewLoading').hidden = false;
      $('pdfPreviewLoading').textContent = 'Preview could not be generated. Close this window and try again.';
      $('pdfPreviewMeta').textContent = error.message || 'Preview failed';
    } finally {
      previewBusy = false;
      try {
        updateSubjectExportUI();
        updateZoom(previousZoom);
      } finally {
        window.coverdraftEndExport?.();
      }
      if (previewRefreshRequested && modal.style.display === 'flex') {
        previewRefreshRequested = false;
        window.clearTimeout(previewRefreshTimer);
        previewRefreshTimer = window.setTimeout(() => window.openPdfPreview(), 0);
      } else if (modal.style.display !== 'flex') {
        previewRefreshRequested = false;
      }
    }
  };
  function closePdfPreview() {
    previewSequence += 1;
    previewCache = null;
    previewRefreshRequested = false;
    window.clearTimeout(previewRefreshTimer);
    if ($('pdfPreviewModal'))
      $('pdfPreviewModal').style.display = 'none';
  }
  window.coverdraftClosePdfPreview = closePdfPreview;
  $('previewPdfMenuBtn')?.addEventListener('click', () => window.openPdfPreview());
  $('closePdfPreviewBtn')?.addEventListener('click', closePdfPreview);
  $('previewPrevBtn')?.addEventListener('click', () => {
    previewIndex--;
    updatePreviewPage();
  });
  $('previewNextBtn')?.addEventListener('click', () => {
    previewIndex++;
    updatePreviewPage();
  });
  // Runs the multi-subject export for the ticked subjects: one combined PDF, or one PDF per subject.
  function downloadSelectedSubjects(individual) {
    const selected = tickedSubjectKeys();
    if (!selected.length)
      return showToast('Choose at least one subject to include.', false);
    closePdfPreview();
    const run = () => window.coverdraftExportMultipleSubjects?.(selected, { individual, copies: copiesObject() });
    if (typeof window.coverdraftRunExportPreflight === 'function')
      window.coverdraftRunExportPreflight(run, { scope: 'selected' });
    else
      run();
  }
  $('downloadPreviewPdfBtn')?.addEventListener('click', () => {
    if ($('multiSubjectExportCheck')?.checked)
      return downloadSelectedSubjects(false);
    closePdfPreview();
    const run = () => window.coverdraftExportPdf?.({ selectedPages: true });
    if (typeof window.coverdraftRunExportPreflight === 'function')
      window.coverdraftRunExportPreflight(run, { scope: 'selected' });
    else
      run();
  });
  $('downloadIndividualPdfBtn')?.addEventListener('click', () => downloadSelectedSubjects(true));
  $('pdfPreviewModal')?.addEventListener('click', (event) => {
    if (event.target === $('pdfPreviewModal'))
      closePdfPreview();
  });
  document.addEventListener('keydown', (event) => {
    if ($('pdfPreviewModal')?.style.display === 'flex') {
      if (event.key === 'Escape')
        closePdfPreview();
      if (event.key === 'ArrowLeft') {
        previewIndex--;
        updatePreviewPage();
      }
      if (event.key === 'ArrowRight') {
        previewIndex++;
        updatePreviewPage();
      }
    }
  });
  window.addEventListener('load', () => {
    makePageRowsDraggable();
    savePageManager();
  });
})();
