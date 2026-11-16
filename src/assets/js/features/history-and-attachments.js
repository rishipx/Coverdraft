/* Undo/redo history and attachment page ordering. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stateKey = 'coverdraft_workflow_plus_v1';
  let state = { attachmentOrder: 'after', history: [], future: [] };
  let isRestoringHistory = false;
  try {
    state = { ...state, ...JSON.parse(localStorage.getItem(stateKey) || '{}') };
  } catch (_) { }
  const persist = () => {
    try {
      localStorage.setItem(stateKey, JSON.stringify({ attachmentOrder: state.attachmentOrder }));
    } catch (_) { }
  };
  function toast(msg, ok = true) {
    if (typeof window.showToast === 'function')
      showToast(msg, ok);
    else
      console.info(msg);
  }
  // Design controls tracked by undo/redo and the "reset a section" buttons.
  const DESIGN_DEFAULTS = {
    f_fontFamily: "'Times New Roman', Times, serif", f_fontScale: '100', f_lineSpacing: '135',
    f_showBorder: true, f_borderStyle: 'solid', f_borderWidth: '2', f_borderInset: '28', f_borderColor: '#111111'
  };
  const DESIGN_IDS = Object.keys(DESIGN_DEFAULTS);
  const readDesignControl = (id) => {
    const el = $(id);
    return !el ? undefined : (el.type === 'checkbox' ? el.checked : el.value);
  };
  const writeDesignControl = (id, value) => {
    const el = $(id);
    if (!el || value == null)
      return;
    const prop = el.type === 'checkbox' ? 'checked' : 'value';
    if (el[prop] === value)
      return; // only notify listeners when something really changed
    el[prop] = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // Preserved PDF page images are several hundred KB each. Keep them out of every history snapshot
  // (stringifying them on each pointer-up made the editor stutter) and re-attach them on restore.
  const IMAGE_REF = '\u0000coverdraft-image:';
  const imageStore = new Map();
  function serializePages(pages) {
    return JSON.parse(JSON.stringify(pages, function (key, value) {
      if (key === 'src' && typeof value === 'string' && value.length > 2000 && this && this.type === 'image' && this.id) {
        imageStore.set(this.id, value);
        return IMAGE_REF + this.id;
      }
      return value;
    }));
  }
  function resolveImageRefs(pages) {
    Object.values(pages || {}).forEach((layout) => {
      if (!Array.isArray(layout))
        return;
      layout.forEach((el) => {
        if (el && el.type === 'image' && typeof el.src === 'string' && el.src.startsWith(IMAGE_REF)) {
          el.src = imageStore.get(el.src.slice(IMAGE_REF.length)) || '';
        }
      });
    });
    return pages;
  }
  function snapshot() {
    let form = {}, experiments = [], pageState = {};
    try {
      form = typeof currentFormData !== 'undefined' ? JSON.parse(JSON.stringify(currentFormData)) : {};
    } catch (_) { }
    try {
      experiments = typeof experimentsList !== 'undefined' ? JSON.parse(JSON.stringify(experimentsList)) : [];
    } catch (_) { }
    try {
      pageState = JSON.parse(localStorage.getItem('coverdraft_pages_v2') || '{}');
    } catch (_) { }
    let pages = null;
    try {
      pages = typeof documentPages !== 'undefined' ? serializePages(documentPages) : null;
    } catch (_) { }
    return JSON.stringify({
      form, experiments, pageState, pages,
      pageKey: typeof currentPageKey !== 'undefined' ? currentPageKey : 'cover',
      designs: Object.fromEntries(DESIGN_IDS.map(id => [id, readDesignControl(id)]))
    });
  }
  function restore(raw) {
    isRestoringHistory = true;
    try {
      const s = JSON.parse(raw);
      if (Array.isArray(s.experiments) && typeof experimentsList !== 'undefined')
        experimentsList = s.experiments;
      if (s.pages && typeof documentPages !== 'undefined') {
        documentPages = resolveImageRefs(s.pages);
        window.coverdraftSyncImportedPages?.();
        if (['cover', 'index'].includes(s.pageKey) || (window.coverdraftIsImportedPageKey?.(s.pageKey) && documentPages[s.pageKey]))
          currentPageKey = s.pageKey;
        canvasElements = documentPages[currentPageKey] || documentPages.cover || [];
        document.querySelectorAll('.view-tab[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === currentPageKey));
      }
      Object.entries(s.designs || {}).forEach(([id, v]) => writeDesignControl(id, v));
      if (s.pageState) {
        try {
          localStorage.setItem('coverdraft_pages_v2', JSON.stringify(s.pageState));
        } catch (_) { }
      }
      if (typeof renderDynamicForm === 'function' && typeof currentUniKey !== 'undefined')
        renderDynamicForm(currentUniKey);
      // renderDynamicForm resets the form to the university preset, so restore the saved values afterwards.
      if (s.form && typeof currentFormData !== 'undefined') {
        Object.keys(currentFormData).forEach(k => {
          if (!(k in s.form))
            delete currentFormData[k];
        });
        Object.assign(currentFormData, s.form);
        document.querySelectorAll('#dynamicCourseFieldsContainer [data-id], #dynamicStudentFieldsContainer [data-id]').forEach((input) => {
          if (input.dataset.id in currentFormData)
            input.value = currentFormData[input.dataset.id];
        });
      }
      window.refreshSubjectShortcutBar?.();
      if (typeof renderExperimentsPanel === 'function')
        renderExperimentsPanel();
      if (typeof renderPageCanvas === 'function')
        renderPageCanvas();
      if (typeof scheduleAutoCompile === 'function')
        scheduleAutoCompile();
      if (typeof saveDocumentToLocalStorage === 'function')
        saveDocumentToLocalStorage();
    } catch (err) {
      console.warn('Could not restore Coverdraft history state', err);
    } finally {
      setTimeout(() => {
        isRestoringHistory = false;
      }, 0);
    }
  }
  function record() {
    if (isRestoringHistory)
      return;
    const now = snapshot();
    if (state.history[state.history.length - 1] === now)
      return;
    state.history.push(now);
    if (state.history.length > 60)
      state.history.shift();
    state.future = [];
  }
  let inputHistoryTimer = null;
  document.addEventListener('input', e => {
    if (!e.target.matches('input,textarea,select') || e.target.closest('#workflowPlusModal'))
      return;
    clearTimeout(inputHistoryTimer);
    inputHistoryTimer = setTimeout(record, 320);
  });
  document.addEventListener('change', e => {
    if (!e.target.matches('input,textarea,select') || e.target.closest('#workflowPlusModal'))
      return;
    clearTimeout(inputHistoryTimer);
    record();
  });
  document.addEventListener('pointerup', () => {
    if (!isRestoringHistory)
      setTimeout(record, 0);
  }, true);
  document.addEventListener('click', (e) => {
    if (e.target.closest('#tbDuplicate,#tbDelete,#tbBoldBtn,#tbItalicBtn,#tbUnderlineBtn,#tbAlignLeft,#tbAlignCenter,#tbAlignRight,#tbSizeDown,#tbSizeUp'))
      setTimeout(record, 0);
  }, true);
  record();
  window.addEventListener('load', () => setTimeout(record, 240));
  function addToolbar() {
    const toolbar = document.querySelector('.canvas-toolbar-overlay') || document.querySelector('.stage-toolbar');
    if (toolbar && !$('workflowHistoryGroup')) {
      const g = document.createElement('div');
      g.id = 'workflowHistoryGroup';
      g.hidden = true;
      g.style.cssText = 'display:none';
      g.innerHTML = `<button class="canvas-tool-btn" id="workflowUndo" title="Undo (Ctrl+Z)" aria-label="Undo">${lucideSvg('undo-2', 14)}</button><button class="canvas-tool-btn" id="workflowRedo" title="Redo (Ctrl+Y)" aria-label="Redo">${lucideSvg('redo-2', 14)}</button>`;
      toolbar.append(g);
      $('workflowUndo').onclick = () => {
        if (state.history.length < 2)
          return;
        state.future.push(state.history.pop());
        restore(state.history[state.history.length - 1]);
      };
      $('workflowRedo').onclick = () => {
        if (!state.future.length)
          return;
        const s = state.future.pop();
        state.history.push(s);
        restore(s);
      };
      const syncHistoryButtons = () => {
        $('workflowUndo').disabled = state.history.length < 2;
        $('workflowRedo').disabled = !state.future.length;
      };
      const undo = $('workflowUndo').onclick, redo = $('workflowRedo').onclick;
      $('workflowUndo').onclick = () => {
        undo();
        syncHistoryButtons();
      };
      $('workflowRedo').onclick = () => {
        redo();
        syncHistoryButtons();
      };
      document.addEventListener('input', syncHistoryButtons, true);
      document.addEventListener('change', syncHistoryButtons, true);
      document.addEventListener('pointerup', () => setTimeout(syncHistoryButtons, 15), true);
      document.addEventListener('click', () => setTimeout(syncHistoryButtons, 35), true);
      window.addEventListener('load', () => setTimeout(syncHistoryButtons, 280));
      syncHistoryButtons();
    }
  }
  function installResetSections() {
    const design = $('panelStyling');
    if (!design || $('sectionResetControls'))
      return;
    const box = document.createElement('div');
    box.id = 'sectionResetControls';
    box.className = 'panel-section';
    box.innerHTML = '<div class="section-heading">Reset a section</div><div style="display:flex;flex-wrap:wrap;gap:6px"><button class="btn btn-secondary" data-reset-section="type">Reset typography</button><button class="btn btn-secondary" data-reset-section="spacing">Reset spacing</button><button class="btn btn-secondary" data-reset-section="border">Reset border</button></div>';
    design.append(box);
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      const ids = b.dataset.resetSection === 'type' ? ['f_fontFamily', 'f_fontScale'] : b.dataset.resetSection === 'spacing' ? ['f_lineSpacing'] : ['f_showBorder', 'f_borderStyle', 'f_borderWidth', 'f_borderInset', 'f_borderColor'];
      ids.forEach(id => writeDesignControl(id, DESIGN_DEFAULTS[id]));
      window.updateDesignControlLabels?.();
      record();
      toast('Design section reset');
    });
  }
  function installAttachmentOrder() {
    const meta = $('attachedPdfMeta');
    if (!meta || $('attachmentOrderSelect'))
      return;
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px';
    label.innerHTML = 'Append attached PDF <select id="attachmentOrderSelect" class="select-box"><option value="after">After generated pages</option><option value="before">Before generated pages</option></select>';
    meta.append(label);
    $('attachmentOrderSelect').value = state.attachmentOrder;
    $('attachmentOrderSelect').onchange = e => {
      state.attachmentOrder = e.target.value;
      persist();
    };
  }
  window.coverdraftAttachmentOrder = () => state.attachmentOrder;
  function init() {
    addToolbar();
    installResetSections();
    installAttachmentOrder();
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();
  setTimeout(init, 500);
  setTimeout(init, 1500);
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const target = e.target;
    const isFormField = target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable || !!target.closest('[contenteditable="true"]'));
    const isCanvasText = target instanceof HTMLElement && (!!target.closest('#page [contenteditable="true"]') || target.isContentEditable);
    const click = (id) => {
      const button = $(id);
      if (button && !button.disabled)
        button.click();
    };
    if (mod && key === 'z') {
      if (isFormField)
        return; // Let the browser undo text while the caret is inside an input or editable object.
      e.preventDefault();
      click(e.shiftKey ? 'workflowRedo' : 'workflowUndo');
      return;
    }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      if (isFormField)
        return;
      e.preventDefault();
      click('workflowRedo');
      return;
    }
    if (mod && key === 's') {
      e.preventDefault();
      const saved = typeof saveDocumentToLocalStorage === 'function' && saveDocumentToLocalStorage();
      if (saved)
        toast('Saved on this device');
      else
        toast('Could not save. Browser storage may be full.', false);
      return;
    }
    if (mod && key === 'd' && (!isFormField || isCanvasText)) {
      e.preventDefault();
      click('tbDuplicate');
      return;
    }
    if (mod && ['b', 'i', 'u'].includes(key) && (!isFormField || isCanvasText)) {
      e.preventDefault();
      click(key === 'b' ? 'tbBoldBtn' : key === 'i' ? 'tbItalicBtn' : 'tbUnderlineBtn');
      return;
    }
    if (!mod && !e.altKey && (key === 'delete' || key === 'backspace') && !isFormField) {
      if (typeof selectedDomEl !== 'undefined' && selectedDomEl) {
        e.preventDefault();
        click('tbDelete');
      }
      return;
    }
    if (mod && key === '0' && !isFormField) {
      e.preventDefault();
      click('zoomFitBtn');
      return;
    }
    if (mod && (key === '+' || key === '=' || key === '-')) {
      if (isFormField)
        return;
      e.preventDefault();
      click(key === '-' ? 'zoomOutBtn' : 'zoomInBtn');
    }
  });
})();
