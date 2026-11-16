/* Autosave, printing, share links, PDF export, and profile persistence. */
function scheduleAutoCompile() {
  clearTimeout(autoCompileTimer);
  autoCompileTimer = setTimeout(() => {
    saveDocumentToLocalStorage();
  }, 350);
}
function saveDocumentToLocalStorage() {
  try {
    documentPages[currentPageKey] = canvasElements;
    localStorage.setItem('coverdraft_document_v1', JSON.stringify({
      documentPages,
      currentFormData,
      experimentsList,
      currentUniKey,
      currentPageKey
    }));
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}
/* Native vector print engine */
function beginPrintBuild(options = {}) {
  if (!options.alreadyBusy && window.coverdraftIsExportBusy?.()) {
    showToast('Wait for the current document task to finish.', false);
    return null;
  }
  deselectAll();
  const printMount = document.getElementById('printMount');
  if (!printMount)
    return null;
  printMount.innerHTML = '';
  documentPages[currentPageKey] = canvasElements;
  const pageDims = window.coverdraftPageDimensions?.() || { width: 794, height: 1123, print: 'A4' };
  let pageStyle = document.getElementById('dynamicPrintPageStyle');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'dynamicPrintPageStyle';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: ${pageDims.print || 'A4'} portrait; margin: 0; } @media print { .print-page { width: ${pageDims.width}px !important; height: ${pageDims.height}px !important; zoom: min(tan(atan2(100vw, ${pageDims.width}px)), tan(atan2(100vh, ${pageDims.height}px))) !important; } }`;
  const selectedFont = document.getElementById('f_fontFamily')?.value || "'Times New Roman', serif";
  const fontScale = (Number(document.getElementById('f_fontScale')?.value) || 100) / 100;
  const lineSpacing = (Number(document.getElementById('f_lineSpacing')?.value) || 135) / 100;
  const showBorder = document.getElementById('f_showBorder')?.checked;
  const borderStyle = document.getElementById('f_borderStyle')?.value || 'solid';
  const borderWidth = document.getElementById('f_borderWidth')?.value || 2;
  const borderInset = document.getElementById('f_borderInset')?.value || 28;
  const borderColor = document.getElementById('f_borderColor')?.value || '#111111';
  return { printMount, pageDims, selectedFont, fontScale, lineSpacing, showBorder, borderStyle, borderWidth, borderInset, borderColor };
}
function appendPrintPages(ctx) {
  const { printMount, pageDims, selectedFont, fontScale, lineSpacing, showBorder, borderStyle, borderWidth, borderInset, borderColor } = ctx;
  documentPages[currentPageKey] = canvasElements;
  const pageKeys = typeof window.pdfPages === 'function' ? window.pdfPages() : ['cover', 'index'];
  pageKeys.forEach(pKey => {
    let pEls = documentPages[pKey];
    if (!pEls || pEls.length === 0) {
      pEls = pKey === 'index' ? (window.coverdraftScaleA4Layout?.(buildIndexTemplate()) || buildIndexTemplate()) : [];
    }
    const pDiv = document.createElement('div');
    pDiv.className = 'print-page';
    pDiv.style.width = `${pageDims.width}px`;
    pDiv.style.height = `${pageDims.height}px`;
    pDiv.style.fontFamily = selectedFont;
    if (showBorder) {
      const bFrame = document.createElement('div');
      bFrame.className = 'page-border-frame';
      bFrame.style.display = 'block';
      bFrame.style.top = `${borderInset}px`;
      bFrame.style.left = `${borderInset}px`;
      bFrame.style.right = `${borderInset}px`;
      bFrame.style.bottom = `${borderInset}px`;
      bFrame.style.border = `${borderWidth}px ${borderStyle} ${borderColor}`;
      pDiv.appendChild(bFrame);
    }
    pEls.forEach((el) => {
      const domEl = document.createElement('div');
      domEl.className = 'c-el';
      domEl.style.left = el.x + 'px';
      domEl.style.top = el.y + 'px';
      domEl.style.width = el.w + 'px';
      if (el.type !== 'image')
        domEl.style.zIndex = '2';
      if (el.type === 'image') {
        domEl.style.height = (el.h || el.w) + 'px';
        domEl.style.padding = '0';
        domEl.style.borderRadius = '0';
        domEl.style.outline = 'none';
        domEl.style.pointerEvents = 'none';
        domEl.style.zIndex = el.preserveOriginal ? '0' : '1';
        const image = document.createElement('img');
        image.src = String(el.src || '');
        image.alt = String(el.alt || 'Imported document image');
        image.draggable = false;
        image.style.cssText = 'display:block;width:100%;height:100%;object-fit:fill;pointer-events:none;';
        domEl.appendChild(image);
      } else if (el.type === 'shape') {
        domEl.style.height = el.h + 'px';
        domEl.style.background = el.bg || '#000000';
        domEl.style.padding = '0';
        if (typeof el.border === 'string' && /^\d+(\.\d+)?px (solid|dashed|dotted) #[0-9a-fA-F]{3,8}$/.test(el.border))
          domEl.style.border = el.border;
      } else if (el.type === 'logo') {
        domEl.style.height = (el.h || el.w) + 'px';
        const logoBox = document.createElement('div');
        logoBox.className = 'logo-box';
        logoBox.innerHTML = getLogoMarkup();
        domEl.appendChild(logoBox);
      } else if (el.type === 'expTable') {
        domEl.style.padding = '0';
        domEl.innerHTML = renderExperimentTable(experimentsList);
      } else {
        domEl.style.textAlign = el.align || 'center';
        domEl.style.fontSize = ((el.size || 16) * fontScale) + 'px';
        domEl.style.fontWeight = el.weight || 'bold';
        domEl.style.color = el.color || '#111111';
        domEl.style.fontFamily = el.font || selectedFont;
        domEl.style.lineHeight = el.lineHeight ? (el.lineHeight * lineSpacing / 1.35) : lineSpacing;
        if (el.italic)
          domEl.style.fontStyle = 'italic';
        if (el.underline)
          domEl.style.textDecoration = 'underline';
        let content = el.customContent !== undefined ? sanitizeRichContent(el.customContent) : replaceTokens(el.text, currentFormData);
        content = content.replace(/\\textbf\{([^}]+)\}/g, '<b>$1</b>');
        domEl.innerHTML = sanitizeRichContent(content).replace(/\n/g, '<br>');
      }
      pDiv.appendChild(domEl);
    });
    printMount.appendChild(pDiv);
  });
}
function prepareAndPrintDocument() {
  const ctx = beginPrintBuild();
  if (!ctx)
    return;
  appendPrintPages(ctx);
  window.print();
}
window.coverdraftBeginPrintBuild = beginPrintBuild;
window.coverdraftAppendPrintPages = appendPrintPages;
document.getElementById('printVectorBtn')?.addEventListener('click', () => {
  // With "combine subjects" ticked, print every ticked subject with its number of copies.
  const selection = window.coverdraftPreviewSelection?.();
  const multi = Boolean(selection?.multi && selection.keys.length);
  window.coverdraftClosePdfPreview?.();
  const run = () => multi
    ? window.coverdraftPrintMultipleSubjects?.(selection.keys, { copies: selection.copies })
    : prepareAndPrintDocument();
  if (typeof window.coverdraftRunExportPreflight === 'function')
    window.coverdraftRunExportPreflight(run, multi ? { scope: 'selected' } : undefined);
  else
    run();
});
/* Portable class presets */
function generateShareableLink() {
  documentPages[currentPageKey] = canvasElements;
  // Class links intentionally exclude student identity/contact fields. Anything
  // placed in a URL may be copied into chat logs, browser history, or analytics.
  const shareableKeys = ['university', 'department', 'title', 'code', 'sem', 'session', 'taskNo', 'degreeFull', 'specialization', 'college'];
  const safeForm = Object.fromEntries(shareableKeys
    .filter((key) => currentFormData?.[key] !== undefined && currentFormData?.[key] !== null)
    .map((key) => [key, String(currentFormData[key]).slice(0, 240)]));
  const safeExperiments = (Array.isArray(experimentsList) ? experimentsList : []).slice(0, 250).map((row, index) => ({
    no: index + 1,
    title: String(row?.title ?? '').slice(0, 300),
    page: String(row?.page ?? '').slice(0, 40),
    date: String(row?.date ?? '').slice(0, 40)
  }));
  const payload = {
    uni: currentUniKey,
    tpl: typeof activeTemplateId === 'string' ? activeTemplateId.slice(0, 80) : '',
    form: safeForm,
    exps: safeExperiments
  };
  // The subjects on the subject bar travel with the link, so a whole class can start from one list.
  const classSubjects = window.coverdraftClassSubjects?.();
  if (classSubjects)
    payload.subs = classSubjects;
  const copiedMessage = classSubjects ? `Class link copied. It includes ${classSubjects.list.length} subject${classSubjects.list.length === 1 ? '' : 's'}.` : 'Class link copied to clipboard!';
  try {
    const jsonStr = JSON.stringify(payload);
    const b64 = btoa(encodeURIComponent(jsonStr));
    const url = window.location.origin + window.location.pathname + '#share=' + b64;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast(copiedMessage);
      }).catch(() => fallbackCopy(url, copiedMessage));
    } else {
      fallbackCopy(url, copiedMessage);
    }
  } catch (e) {
    showToast('Failed to create share link: ' + e.message, false);
  }
}
function fallbackCopy(text, message = 'Class link copied to clipboard!') {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (_) { }
  ta.remove();
  if (copied) {
    showToast(message);
  } else {
    try {
      window.prompt('Automatic copy was blocked. Copy this class link:', text);
    } catch (_) { }
    showToast('Copy the class link from the dialog if it opened.', false);
  }
}
function loadFromUrlHash() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#share='))
    return false;
  try {
    const b64 = hash.slice('#share='.length);
    const data = JSON.parse(decodeURIComponent(atob(b64)));
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid shared preset');
    if (typeof data.uni === 'string' && UNI_CONFIGS[data.uni]) {
      currentUniKey = data.uni;
      const sel = document.getElementById('uniPresetSelect');
      if (sel)
        sel.value = data.uni;
    }
    renderDynamicForm(currentUniKey);
    const shareableKeys = new Set(['university', 'department', 'title', 'code', 'sem', 'session', 'taskNo', 'degreeFull', 'specialization', 'college']);
    const safeForm = {};
    if (data.form && typeof data.form === 'object' && !Array.isArray(data.form)) {
      Object.entries(data.form).forEach(([key, value]) => {
        if (shareableKeys.has(key) && (typeof value === 'string' || typeof value === 'number')) {
          safeForm[key] = String(value).slice(0, 240);
        }
      });
    }
    Object.assign(currentFormData, safeForm);
    (UNI_CONFIGS[currentUniKey]?.fields || []).forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(safeForm, field.id)) {
        const input = document.getElementById(`field_${field.id}`);
        if (input)
          input.value = safeForm[field.id];
      }
    });
    if (Array.isArray(data.exps)) {
      experimentsList = data.exps.slice(0, 250).map((row, index) => ({
        no: index + 1,
        title: String(row?.title ?? '').slice(0, 300),
        page: String(row?.page ?? '').slice(0, 40),
        date: String(row?.date ?? '').slice(0, 40)
      }));
    }
    const tpl = typeof data.tpl === 'string' && TEMPLATES[data.tpl]
      ? data.tpl
      : (UNI_CONFIGS[currentUniKey]?.styleId || DEFAULT_STYLE_ID);
    renderExperimentsPanel();
    applyTemplate(tpl);
    window.coverdraftSaveExp?.();
    const classList = window.coverdraftApplyClassSubjects?.(data.subs, currentUniKey) || { added: 0, total: 0 };
    showToast(classList.total
      ? `Loaded your class link with ${classList.total} subject${classList.total === 1 ? '' : 's'}. Student details were not shared.`
      : 'Loaded shared class preset. Student details were not shared.');
    return true;
  } catch (e) {
    console.warn('Could not parse share hash:', e);
    showToast('This shared link is invalid or incomplete.', false);
    return false;
  }
}
document.getElementById('sharePresetBtn')?.addEventListener('click', generateShareableLink);
let pdfExportInProgress = false;
const exportControlStates = new Map();
const exportControlIds = ['exportPdfBtn', 'downloadDocxBtn', 'printVectorBtn', 'exportSeparatePdfBtn', 'exportPngBtn', 'previewPdfMenuBtn'];
const blockDocumentMutationDuringExport = (event) => {
  if (!pdfExportInProgress || !event.isTrusted || event.target?.closest?.('#pdfPreviewModal'))
    return;
  if (event.type === 'keydown' && ['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key))
    return;
  // Preserve native pointer defaults so users can still scroll/read while a document task runs.
  if (event.type !== 'pointerdown')
    event.preventDefault();
  event.stopImmediatePropagation();
};
[
  'click', 'pointerdown', 'input', 'beforeinput', 'change', 'keydown',
  'paste', 'cut', 'drop', 'submit', 'compositionstart', 'compositionupdate', 'compositionend'
].forEach((type) => {
  document.addEventListener(type, blockDocumentMutationDuringExport, true);
});
window.coverdraftBeginExport = function () {
  if (pdfExportInProgress) {
    showToast('Another document task is already running. Please wait for it to finish.', false);
    return false;
  }
  pdfExportInProgress = true;
  document.body?.classList.add('document-task-busy');
  document.querySelector('.app-container')?.setAttribute('aria-busy', 'true');
  exportControlIds.forEach((id) => {
    const control = document.getElementById(id);
    if (!control)
      return;
    exportControlStates.set(control, {
      disabled: control.disabled,
      ariaDisabled: control.getAttribute('aria-disabled')
    });
    control.disabled = true;
    control.setAttribute('aria-disabled', 'true');
  });
  return true;
};
window.coverdraftEndExport = function () {
  exportControlStates.forEach((state, control) => {
    if (!control.isConnected)
      return;
    control.disabled = state.disabled;
    if (state.ariaDisabled === null)
      control.removeAttribute('aria-disabled');
    else
      control.setAttribute('aria-disabled', state.ariaDisabled);
  });
  exportControlStates.clear();
  document.body?.classList.remove('document-task-busy');
  document.querySelector('.app-container')?.removeAttribute('aria-busy');
  pdfExportInProgress = false;
};
window.coverdraftIsExportBusy = () => pdfExportInProgress;
function safePdfFilePart(value, fallback = 'submission') {
  const cleaned = String(value ?? '').normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^[_ .]+|[_ .]+$/g, '').slice(0, 80);
  return cleaned || fallback;
}
window.coverdraftSafePdfFilePart = safePdfFilePart;
async function exportFinalPdf(forceMerge = false, options = {}) {
  if (pdfExportInProgress) {
    showToast('Another document task is already running. Please wait.', false);
    return;
  }
  await window.coverdraftEnsurePdfLibs?.();
  if (typeof window.html2canvas !== 'function' || typeof window.jspdf?.jsPDF !== 'function') {
    showToast('PDF tools are not available offline yet. Connect once, reload Coverdraft, then retry the export.', false);
    return;
  }
  if ((uploadedAssignmentPdf || forceMerge) && !window.PDFLib?.PDFDocument) {
    showToast('PDF merge tools are not cached. Reconnect and reload once before merging an attached PDF.', false);
    return;
  }
  const targetElement = document.getElementById('page');
  if (!targetElement)
    return;
  if (!window.coverdraftBeginExport())
    return;
  const exportButton = document.getElementById('exportPdfBtn');
  const exportLabel = exportButton?.querySelector('.lbl');
  const originalLabel = exportLabel?.textContent || 'Download PDF';
  const prevZoom = zoomLevel;
  const originalPageKey = currentPageKey;
  const isSinglePageExport = Boolean(options.onlyCurrentPage || options.share);
  if (exportButton) {
    exportButton.disabled = true;
    exportButton.setAttribute('aria-busy', 'true');
    exportButton.setAttribute('aria-label', 'Preparing PDF');
  }
  try {
    deselectAll();
    updateZoom(1.0);
    document.querySelectorAll('.el-badge, .guide-line, .resize-handle').forEach(el => {
      el.style.display = 'none';
    });
    if (exportLabel)
      exportLabel.textContent = 'Preparing…';
    showToast('Preparing your PDF…', true);
    const { jsPDF } = window.jspdf;
    const pageDims = window.coverdraftPageDimensions?.() || { width: 794, height: 1123 };
    const pdfFormat = [pageDims.width, pageDims.height];
    const pdfDoc = new jsPDF({ orientation: 'portrait', unit: 'px', format: pdfFormat });
    // Smaller captures and JPEG encoding reduce the canvas workload and keep PDFs lightweight.
    // The browser print action remains available under Advanced export tools for vector-quality text.
    const isSmallScreen = window.matchMedia?.('(max-width: 760px)').matches;
    const exportScale = isSmallScreen ? 1.6 : 2.0;
    let capturedPages = 0;
    await window.captureDocPages(targetElement, exportScale, {
      onlyCurrentPage: isSinglePageExport,
      pageKey: originalPageKey,
      onPage: (canvas, index) => {
        if (index > 0)
          pdfDoc.addPage(pdfFormat, 'portrait');
        const imageData = canvas.toDataURL('image/jpeg', 0.88);
        pdfDoc.addImage(imageData, 'JPEG', 0, 0, pdfFormat[0], pdfFormat[1]);
        capturedPages += 1;
        canvas.width = 1;
        canvas.height = 1;
      }
    });
    if (!capturedPages)
      throw new Error('No pages were captured. Select at least one page and retry.');
    const coverPdfBytes = pdfDoc.output('arraybuffer');
    let finalPdfBytes;
    const data = currentFormData;
    const idKey = safePdfFilePart(data.name || data.uid || data.usn || data.sid || data.roll || 'submission');
    const pageFilePart = ({ cover: 'Cover', index: 'Index' })[originalPageKey] || 'Page';
    const cleanFileName = `${idKey}_${isSinglePageExport ? pageFilePart : 'Document'}.pdf`;
    if (uploadedAssignmentPdf || forceMerge) {
      if (!uploadedAssignmentPdf) {
        showToast('Choose an assignment PDF before using Merge & Download.', false);
        return;
      }
      showToast('Combining your cover with the assignment PDF…', true);
      const { PDFDocument } = window.PDFLib;
      const frontDoc = await PDFDocument.load(coverPdfBytes);
      const assignmentDoc = await PDFDocument.load(uploadedAssignmentPdf);
      const mergedPdf = await PDFDocument.create();
      const frontPageIndices = frontDoc.getPageIndices();
      const assignmentPageIndices = assignmentDoc.getPageIndices();
      const assignmentPages = await mergedPdf.copyPages(assignmentDoc, assignmentPageIndices);
      const frontPages = await mergedPdf.copyPages(frontDoc, frontPageIndices);
      const orderedPages = window.coverdraftAttachmentOrder?.() === 'before'
        ? [...assignmentPages, ...frontPages]
        : [...frontPages, ...assignmentPages];
      orderedPages.forEach(page => mergedPdf.addPage(page));
      finalPdfBytes = await mergedPdf.save();
    } else {
      finalPdfBytes = coverPdfBytes;
    }
    const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
    let delivered = false;
    let shareFallbackNote = '';
    if (options.share) {
      const file = new File([blob], cleanFileName, { type: 'application/pdf' });
      const canShareFiles = typeof navigator.share === 'function'
        && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));
      if (canShareFiles) {
        try {
          await navigator.share({
            files: [file],
            title: `Coverdraft ${originalPageKey === 'index' ? 'Index' : 'Cover'}`,
            text: 'Shared from the current Coverdraft page'
          });
          showToast('PDF shared');
          delivered = true;
        } catch (shareError) {
          if (shareError?.name === 'AbortError')
            throw shareError;
          // Some browsers refuse once the tap has expired during page capture; download instead of failing.
          shareFallbackNote = 'Sharing was blocked, so the PDF was downloaded instead.';
        }
      } else {
        shareFallbackNote = /Android/i.test(navigator.userAgent) && /Firefox|Fennec|IronFox|Gecko\//i.test(navigator.userAgent) && !/Chrome|Chromium/i.test(navigator.userAgent)
          ? 'Firefox for Android cannot share files yet, so the PDF was saved to Downloads. Share it from your Files app.'
          : 'This browser cannot share files, so the PDF was downloaded instead.';
      }
    }
    if (!delivered) {
      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = cleanFileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      // Retain the URL long enough for slower mobile browsers to begin the download.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      showToast(shareFallbackNote || 'PDF download started');
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      showToast('Sharing cancelled', false);
      return;
    }
    console.error(error);
    showToast('PDF export failed: ' + (error?.message || 'Unknown error'), false);
  } finally {
    try {
      document.querySelectorAll('.el-badge, .guide-line, .resize-handle').forEach(el => {
        el.style.display = '';
      });
      updateZoom(prevZoom);
    } finally {
      window.coverdraftEndExport();
      if (exportButton) {
        exportButton.setAttribute('aria-busy', 'false');
        exportButton.setAttribute('aria-label', 'Download PDF');
      }
      if (exportLabel)
        exportLabel.textContent = originalLabel;
    }
  }
}
window.coverdraftExportPdf = (options = {}) => exportFinalPdf(false, options);
document.getElementById('sharePdfBtn')?.addEventListener('click', () => {
  const run = () => exportFinalPdf(false, { share: true });
  if (typeof window.coverdraftRunExportPreflight === 'function')
    window.coverdraftRunExportPreflight(run);
  else
    run();
});
const uniPresetSelect = document.getElementById('uniPresetSelect');
let previousPresetValue = uniPresetSelect?.value || currentUniKey || DEFAULT_UNIVERSITY_ID;
uniPresetSelect?.addEventListener('focus', () => {
  previousPresetValue = uniPresetSelect.value || currentUniKey || DEFAULT_UNIVERSITY_ID;
});
uniPresetSelect?.addEventListener('mousedown', () => {
  previousPresetValue = uniPresetSelect.value || currentUniKey || DEFAULT_UNIVERSITY_ID;
});
uniPresetSelect?.addEventListener('change', (e) => {
  const val = e.target.value;
  const savedPrefix = 'saved-format:';
  if (val.startsWith(savedPrefix)) {
    Promise.resolve(window.coverdraftUseSavedFormat?.(val.slice(savedPrefix.length))).then((applied) => {
      if (applied) {
        previousPresetValue = val;
      } else {
        e.target.value = previousPresetValue || currentUniKey || DEFAULT_UNIVERSITY_ID;
        window.coverdraftShortSelects?.collapse(e.target);
      }
    });
    return;
  }
  previousPresetValue = val;
  if (val === 'custom') {
    markAsCustomMode();
    return;
  }
  loadUniversityPreset(val);
});
document.getElementById('resetCurrentTplBtn')?.addEventListener('click', () => {
  const currentPresetVal = uniPresetSelect?.value || currentUniKey || DEFAULT_UNIVERSITY_ID;
  const isSavedLayout = /^saved-(layout|format):/.test(currentPresetVal);
  const target = (currentPresetVal === 'custom' || isSavedLayout)
    ? (UNI_CONFIGS[currentUniKey] ? currentUniKey : DEFAULT_UNIVERSITY_ID)
    : currentPresetVal;
  loadUniversityPreset(UNI_CONFIGS[target] ? target : DEFAULT_UNIVERSITY_ID);
  if (uniPresetSelect) {
    uniPresetSelect.value = UNI_CONFIGS[target] ? target : DEFAULT_UNIVERSITY_ID;
    previousPresetValue = uniPresetSelect.value;
    window.coverdraftShortSelects?.collapse(uniPresetSelect);
  }
  showToast('Preset restored to default settings');
});
document.getElementById('btnAddText')?.addEventListener('click', () => {
  markAsCustomMode();
  canvasElements.push({
    id: `text_${++customIdCount}`,
    x: 100, y: 320, w: 320,
    align: 'left', weight: 'bold', size: 16,
    text: 'Custom Academic Text Field', customContent: 'Custom Academic Text Field'
  });
  renderPageCanvas();
  showToast('Added text element');
});
document.getElementById('btnAddRule')?.addEventListener('click', () => {
  markAsCustomMode();
  canvasElements.push({
    id: `rule_${++customIdCount}`,
    x: 60, y: 500, w: 674, h: 2,
    bg: '#111111', type: 'shape'
  });
  renderPageCanvas();
  showToast('Added divider rule');
});
document.getElementById('btnAddSig')?.addEventListener('click', () => {
  markAsCustomMode();
  canvasElements.push({
    id: `sig_${++customIdCount}`,
    x: 480, y: 920, w: 240,
    align: 'center', weight: 'bold', size: 12,
    text: '_________________________\nFaculty Signature & Stamp\nDate Verified: ___/___/2026',
    customContent: '_________________________\nFaculty Signature & Stamp\nDate Verified: ___/___/2026'
  });
  renderPageCanvas();
  showToast('Added signature block');
});
function sanitizeUploadedSvg(source) {
  try {
    const parsed = new DOMParser().parseFromString(String(source || ''), 'image/svg+xml');
    const root = parsed.documentElement;
    if (!root || root.localName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror'))
      return null;
    parsed.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, style, link').forEach((node) => node.remove());
    [root, ...root.querySelectorAll('*')].forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on') || name === 'srcdoc' || /(?:javascript:|vbscript:|data:text\/html|@import|expression\s*\()/i.test(value)) {
          node.removeAttribute(attribute.name);
          return;
        }
        if (name === 'href' || name.endsWith(':href')) {
          if (!value.startsWith('#') && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value))
            node.removeAttribute(attribute.name);
        }
        if (/url\s*\(/i.test(value) && !/^url\(\s*#[\w:.-]+\s*\)$/i.test(value))
          node.removeAttribute(attribute.name);
        if (name === 'style' && /(?:url\s*\(|@import|expression|javascript:)/i.test(value))
          node.removeAttribute(attribute.name);
      });
    });
    const svgText = new XMLSerializer().serializeToString(root);
    const bytes = new TextEncoder().encode(svgText);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  } catch (_) {
    return null;
  }
}
window.coverdraftValidateLogoData = function (value) {
  if (typeof value !== 'string' || value.length > 3 * 1024 * 1024)
    return null;
  try {
    const raster = value.match(/^data:image\/(png|jpeg);base64,([a-z0-9+/=]+)$/i);
    if (raster) {
      const bytes = Uint8Array.from(atob(raster[2]), (character) => character.charCodeAt(0));
      const validPng = raster[1].toLowerCase() === 'png' && bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
      const validJpeg = raster[1].toLowerCase() === 'jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      return validPng || validJpeg ? value : null;
    }
    let svgSource = '';
    const svgBase64 = value.match(/^data:image\/svg\+xml(?:;charset=utf-8)?;base64,([a-z0-9+/=]+)$/i);
    if (svgBase64) {
      const binary = atob(svgBase64[1]);
      svgSource = new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
    } else {
      const svgEncoded = value.match(/^data:image\/svg\+xml(?:;charset=utf-8)?,([\s\S]*)$/i);
      if (!svgEncoded)
        return null;
      svgSource = decodeURIComponent(svgEncoded[1]);
    }
    return sanitizeUploadedSvg(svgSource);
  } catch (_) {
    return null;
  }
};
let logoUploadGeneration = 0;
document.getElementById('customLogoFile')?.addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file)
    return;
  const generation = ++logoUploadGeneration;
  const maxLogoBytes = 2 * 1024 * 1024;
  const fileName = String(file.name || 'logo').slice(0, 180);
  const extension = fileName.split('.').pop().toLowerCase();
  const kind = extension === 'svg' || file.type === 'image/svg+xml' ? 'svg'
    : (extension === 'png' || file.type === 'image/png' ? 'png'
      : (['jpg', 'jpeg'].includes(extension) || file.type === 'image/jpeg' ? 'jpeg' : ''));
  if (!kind) {
    input.value = '';
    showToast('Choose a PNG, SVG, or JPEG image for the emblem.', false);
    return;
  }
  if (file.size > maxLogoBytes) {
    input.value = '';
    showToast('The emblem image must be 2 MB or smaller.', false);
    return;
  }
  const acceptDataUrl = (dataUrl) => {
    if (generation !== logoUploadGeneration)
      return;
    if (typeof dataUrl !== 'string' || !/^data:image\/(?:png|jpeg|svg\+xml);/i.test(dataUrl)) {
      input.value = '';
      showToast('This image could not be safely loaded. Choose another file.', false);
      return;
    }
    userUploadedLogo = dataUrl;
    document.getElementById('logoDropZone')?.classList.add('has-file');
    const label = document.getElementById('logoDropText');
    if (label) {
      const status = document.createElement('strong');
      status.textContent = 'Uploaded:';
      label.replaceChildren(status, document.createTextNode(` ${fileName}`));
    }
    renderPageCanvas();
    scheduleAutoCompile();
    showToast('Custom logo uploaded');
  };
  try {
    if (kind === 'svg') {
      const source = await file.text();
      if (generation !== logoUploadGeneration)
        return;
      const sanitized = sanitizeUploadedSvg(source);
      if (!sanitized) {
        input.value = '';
        showToast('This SVG is invalid or contains unsupported content.', false);
        return;
      }
      acceptDataUrl(sanitized);
      return;
    }
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (generation !== logoUploadGeneration)
      return;
    const isPng = kind === 'png' && header.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value);
    const isJpeg = kind === 'jpeg' && header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255;
    if (!isPng && !isJpeg) {
      input.value = '';
      showToast('The file contents do not match a valid PNG or JPEG image.', false);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => acceptDataUrl(reader.result);
    reader.onerror = () => {
      if (generation !== logoUploadGeneration)
        return;
      input.value = '';
      showToast('Could not read the image. Try another file.', false);
    };
    reader.onabort = () => {
      if (generation === logoUploadGeneration)
        showToast('Image loading was cancelled.', false);
    };
    reader.readAsDataURL(new Blob([file], { type: kind === 'png' ? 'image/png' : 'image/jpeg' }));
  } catch (_) {
    if (generation !== logoUploadGeneration)
      return;
    input.value = '';
    showToast('Could not read the image. Try another file.', false);
  }
});
document.getElementById('resetUniLogoBtn')?.addEventListener('click', () => {
  userUploadedLogo = null;
  const fileInp = document.getElementById('customLogoFile');
  if (fileInp)
    fileInp.value = '';
  document.getElementById('logoDropZone')?.classList.remove('has-file');
  const label = document.getElementById('logoDropText');
  if (label)
    label.innerHTML = `<strong>Drop custom emblem file</strong><br>PNG, SVG, or JPEG`;
  renderPageCanvas();
  scheduleAutoCompile();
  showToast('Restored official crest');
});
document.getElementById('removeLogoBtn')?.addEventListener('click', () => {
  const logoIdx = canvasElements.findIndex(e => e.type === 'logo');
  if (logoIdx !== -1) {
    markAsCustomMode();
    canvasElements.splice(logoIdx, 1);
    renderPageCanvas();
    scheduleAutoCompile();
    showToast('Emblem removed from canvas');
  }
});
document.querySelectorAll('#panelStyling input, #panelStyling select').forEach(elem => {
  elem.addEventListener('input', () => {
    markAsCustomMode();
    renderPageCanvas();
    scheduleAutoCompile();
  });
});

// Tell people up front when this browser cannot share files (Firefox for Android and IronFox cannot).
(function labelShareButton() {
  const shareBtn = document.getElementById('sharePdfBtn');
  if (!shareBtn)
    return;
  let canShareFiles = false;
  try {
    const probe = new File([''], 'probe.pdf', { type: 'application/pdf' });
    canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch (_) {
    canShareFiles = false;
  }
  if (!canShareFiles) {
    shareBtn.title = 'This browser cannot share files, so the PDF will be saved instead.';
    shareBtn.dataset.shareFallback = 'download';
  }
})();
