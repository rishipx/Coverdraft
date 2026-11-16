/* Form rendering, modes, template application, and canvas rendering. */
const PAGE_SIZE_FORMATS = {
  a4: { label: 'A4', width: 794, height: 1123, print: 'A4' },
  letter: { label: 'US Letter', width: 816, height: 1056, print: 'letter' },
  legal: { label: 'US Legal', width: 816, height: 1344, print: 'legal' },
  a3: { label: 'A3', width: 1123, height: 1587, print: 'A3' },
  a5: { label: 'A5', width: 559, height: 794, print: 'A5' }
};
let currentPageSizeKey = 'a4';
try {
  const savedSize = localStorage.getItem('coverdraft_page_size_v1');
  if (savedSize && PAGE_SIZE_FORMATS[savedSize])
    currentPageSizeKey = savedSize;
} catch (_) { }
function getPageDimensions() {
  return PAGE_SIZE_FORMATS[currentPageSizeKey] || PAGE_SIZE_FORMATS.a4;
}
window.coverdraftPageDimensions = () => ({ ...getPageDimensions(), key: currentPageSizeKey });
function resizeLayoutElements(layout, sx, sy, oldPage = getPageDimensions()) {
  const round2 = (value) => Math.round(value * 100) / 100;
  const items = (layout || []).filter((el) => el && typeof el === 'object');
  const preserved = items.find((el) => el.type === 'image' && el.preserveOriginal && Number(el.w) > 0 && Number(el.h) > 0);
  if (preserved) {
    // Saved drafts may contain a full-page image with positioned overlays. Preserve its
    // aspect ratio and scale related elements together when the paper size changes.
    const scale = Math.min(sx, sy);
    const oldX = Number(preserved.x) || 0, oldY = Number(preserved.y) || 0;
    const newW = Number(preserved.w) * scale, newH = Number(preserved.h) * scale;
    const newX = (oldPage.width * sx - newW) / 2, newY = (oldPage.height * sy - newH) / 2;
    items.forEach((el) => {
      if (el === preserved) {
        el.w = round2(newW);
        el.h = round2(newH);
        el.x = round2(newX);
        el.y = round2(newY);
        return;
      }
      if (Number.isFinite(Number(el.x)))
        el.x = round2(newX + (Number(el.x) - oldX) * scale);
      if (Number.isFinite(Number(el.y)))
        el.y = round2(newY + (Number(el.y) - oldY) * scale);
      ['w', 'h', 'size'].forEach((k) => {
        if (Number.isFinite(Number(el[k])))
          el[k] = round2(Number(el[k]) * scale);
      });
    });
    return layout;
  }
  const sizeScale = Math.sqrt(sx * sy);
  items.forEach(el => {
    ['x', 'w'].forEach(k => {
      if (Number.isFinite(Number(el[k])))
        el[k] = round2(Number(el[k]) * sx);
    });
    ['y', 'h'].forEach(k => {
      if (Number.isFinite(Number(el[k])))
        el[k] = round2(Number(el[k]) * sy);
    });
    // lineHeight is a unitless multiplier, so only the font size scales with the paper.
    if (Number.isFinite(Number(el.size)))
      el.size = round2(Number(el.size) * sizeScale);
  });
  return layout;
}
function setPageSize(sizeKey) {
  if (!PAGE_SIZE_FORMATS[sizeKey] || sizeKey === currentPageSizeKey)
    return;
  documentPages[currentPageKey] = canvasElements;
  const old = getPageDimensions(), next = PAGE_SIZE_FORMATS[sizeKey];
  const seen = new Set();
  Object.values(documentPages).forEach(layout => {
    if (Array.isArray(layout) && !seen.has(layout)) {
      seen.add(layout);
      resizeLayoutElements(layout, next.width / old.width, next.height / old.height);
    }
  });
  currentPageSizeKey = sizeKey;
  try {
    localStorage.setItem('coverdraft_page_size_v1', sizeKey);
  } catch (_) { }
  const select = document.getElementById('pageSizeSelect');
  if (select)
    select.value = sizeKey;
  let style = document.getElementById('dynamicPrintPageStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'dynamicPrintPageStyle';
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${next.print} portrait; margin: 0; } @media print { .print-page { width: ${next.width}px !important; height: ${next.height}px !important; zoom: min(tan(atan2(100vw, ${next.width}px)), tan(atan2(100vh, ${next.height}px))) !important; } }`;
  canvasElements = documentPages[currentPageKey] || [];
  renderPageCanvas();
  document.getElementById('zoomFitBtn')?.click();
  scheduleAutoCompile();
}
window.coverdraftScaleA4Layout = layout => currentPageSizeKey === 'a4' ? layout : resizeLayoutElements(layout, getPageDimensions().width / 794, getPageDimensions().height / 1123, PAGE_SIZE_FORMATS.a4);
let toastTimeoutId = 0;
function showToast(message, isSuccess = true) {
  const toast = document.getElementById('appToast');
  const msg = document.getElementById('toastMsg');
  const dot = document.getElementById('toastDot');
  if (!toast || !msg || !dot)
    return;
  msg.textContent = message;
  dot.style.background = isSuccess ? 'var(--accent-cyan)' : 'var(--accent-danger)';
  dot.style.boxShadow = isSuccess ? '0 0 8px var(--accent-cyan)' : '0 0 8px var(--accent-danger)';
  toast.classList.add('show');
  if (toastTimeoutId)
    clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toast.classList.remove('show');
    toastTimeoutId = 0;
  }, 2800);
}
document.getElementById('simpleModeText')?.addEventListener('click', () => setAppMode(false));
document.getElementById('advModeText')?.addEventListener('click', () => setAppMode(true));
function activateSidebarPanel(panel) {
  const panels = {
    doc: document.getElementById('panelDoc'),
    styling: document.getElementById('panelStyling'),
    experiments: document.getElementById('panelExperiments')
  };
  document.body.dataset.panel = panel;
  const design = document.getElementById('tabPanelDesign');
  if (design) {
    design.classList.toggle('active', panel === 'styling');
    design.setAttribute('aria-pressed', panel === 'styling' ? 'true' : 'false');
  }
  Object.entries(panels).forEach(([key, element]) => {
    if (element)
      element.style.display = key === panel ? 'block' : 'none';
  });
  const scroll = document.getElementById('sidebarScroll');
  if (scroll)
    scroll.scrollTop = 0;
}
document.getElementById('tabPanelDesign')?.addEventListener('click', () => activateSidebarPanel('styling'));
function setAppMode(isAdvanced, silent = false) {
  const body = document.body;
  const switchEl = document.getElementById('advancedModeSwitch');
  const simpleLabel = document.getElementById('simpleModeText');
  const advLabel = document.getElementById('advModeText');
  const brandTitle = document.querySelector('.brand-title');
  if (brandTitle) {
    brandTitle.classList.toggle('mobile-advanced-active', !!isAdvanced);
    brandTitle.setAttribute('aria-label', isAdvanced ? 'Switch to Simple mode' : 'Switch to Advanced mode');
    brandTitle.setAttribute('aria-pressed', String(!!isAdvanced));
  }
  if (isAdvanced) {
    body.classList.remove('simple-mode', 'student-quick');
    if (simpleLabel)
      simpleLabel.classList.remove('active');
    if (advLabel)
      advLabel.classList.add('active');
    if (switchEl)
      switchEl.checked = true;
    if (!silent)
      showToast('Advanced mode enabled');
  } else {
    body.classList.add('simple-mode', 'student-quick');
    if (simpleLabel)
      simpleLabel.classList.add('active');
    if (advLabel)
      advLabel.classList.remove('active');
    if (switchEl)
      switchEl.checked = false;
    // Simple mode is a cover-only workflow; keep hidden pages out of the active view.
    const tabCoverBtn = document.getElementById('tabPageCover');
    if (tabCoverBtn)
      tabCoverBtn.click();
    activateSidebarPanel('doc');
    deselectAll();
    if (!silent)
      showToast('Simple Quick-Fill Mode active');
  }
  try {
    localStorage.setItem('coverdraft_app_mode', isAdvanced ? 'advanced' : 'simple');
  } catch (e) { }
}
document.getElementById('pageSizeSelect')?.addEventListener('change', e => setPageSize(e.target.value));
function initAppMode() {
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  if (pageSizeSelect)
    pageSizeSelect.value = currentPageSizeKey;
  let isAdv = false;
  try {
    const saved = localStorage.getItem('coverdraft_app_mode');
    isAdv = saved === 'advanced';
  } catch (e) { }
  const switchEl = document.getElementById('advancedModeSwitch');
  if (switchEl) {
    switchEl.checked = isAdv;
    switchEl.addEventListener('change', (e) => {
      setAppMode(e.target.checked);
    });
  }
  setAppMode(isAdv, true);
}
function renderDynamicForm(uniKey) {
  const cfg = UNI_CONFIGS[uniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID];
  const courseContainer = document.getElementById('dynamicCourseFieldsContainer');
  const studentContainer = document.getElementById('dynamicStudentFieldsContainer');
  if (!courseContainer || !studentContainer)
    return;
  courseContainer.innerHTML = '';
  studentContainer.innerHTML = '';
  currentFormData.university = cfg.name;
  currentFormData.department = cfg.department;
  currentFormData.title = cfg.title;
  currentFormData.code = cfg.code;
  currentFormData.prof = cfg.prof;
  if (cfg.college)
    currentFormData.college = cfg.college;
  if (cfg.degreeFull)
    currentFormData.degreeFull = cfg.degreeFull;
  if (cfg.specialization)
    currentFormData.specialization = cfg.specialization;
  if (cfg.session)
    currentFormData.session = cfg.session;
  if (cfg.taskNo)
    currentFormData.taskNo = cfg.taskNo;
  if (cfg.designation)
    currentFormData.designation = cfg.designation;
  Object.assign(currentFormData, cfg.student);
  const courseFields = cfg.fields.filter(f => f.group === 'course');
  const studentFields = cfg.fields.filter(f => f.group === 'student');
  renderFieldList(courseFields, courseContainer);
  renderFieldList(studentFields, studentContainer);
}
function renderFieldList(fields, container) {
  let gridHolder = null;
  fields.forEach((f) => {
    const val = currentFormData[f.id] || '';
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'control-group';
    fieldDiv.innerHTML = `
      <label class="control-label" for="field_${f.id}">
        <span>${f.label}</span>
      </label>
      <input class="input-box" id="field_${f.id}" data-id="${f.id}" value="${escHtml(val)}">
    `;
    const input = fieldDiv.querySelector('input');
    input.addEventListener('input', (e) => {
      currentFormData[f.id] = e.target.value;
      // Invalidate customContent for bound elements so they re-render using updated data
      canvasElements.forEach(el => {
        if (getBoundFieldForElement(el) === f.id) {
          delete el.customContent;
        }
      });
      renderPageCanvas();
      scheduleAutoCompile();
    });
    if (f.grid === 2 || f.grid === 3) {
      if (!gridHolder || gridHolder.dataset.grid !== String(f.grid)) {
        gridHolder = document.createElement('div');
        gridHolder.className = f.grid === 2 ? 'grid-2' : 'grid-3';
        gridHolder.dataset.grid = String(f.grid);
        container.appendChild(gridHolder);
      }
      gridHolder.appendChild(fieldDiv);
    } else {
      gridHolder = null;
      container.appendChild(fieldDiv);
    }
  });
}
function escapeTokenText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
// Keep only the small set of inline formatting supported by the editor. Imported
// share links and restored drafts are data, not trusted HTML.
function sanitizeRichContent(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value ?? '');
  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN', 'SUB', 'SUP']);
  const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'META', 'LINK']);
  const allowedStyles = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'line-height', 'letter-spacing'];
  const safeCssValue = (cssValue) => !!cssValue && cssValue.length <= 120 && !/(?:url\s*\(|expression\s*\(|javascript:|vbscript:|@import|behavior\s*:|-moz-binding)/i.test(cssValue);
  const appendSanitized = (parent, node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.nodeValue || ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE)
      return;
    const tag = node.tagName.toUpperCase();
    if (dangerousTags.has(tag))
      return;
    if (!allowedTags.has(tag)) {
      [...node.childNodes].forEach((child) => appendSanitized(parent, child));
      return;
    }
    const clean = document.createElement(tag.toLowerCase());
    if (node.hasAttribute('style')) {
      allowedStyles.forEach((property) => {
        const cssValue = node.style.getPropertyValue(property).trim();
        if (safeCssValue(cssValue))
          clean.style.setProperty(property, cssValue);
      });
    }
    [...node.childNodes].forEach((child) => appendSanitized(clean, child));
    parent.appendChild(clean);
  };
  const fragment = document.createDocumentFragment();
  [...template.content.childNodes].forEach((node) => appendSanitized(fragment, node));
  const output = document.createElement('div');
  output.appendChild(fragment);
  return output.innerHTML;
}
function replaceTokens(text, data) {
  if (!text)
    return '';
  return text.replace(/\{(\w+)\}/g, (_, key) => escapeTokenText(data?.[key] ?? ''));
}
function markAsCustomMode() {
  const sel = document.getElementById('uniPresetSelect');
  const selectedSavedLayout = isSavedLayoutValue(sel?.value);
  if (activeTemplateId !== 'custom' || selectedSavedLayout) {
    activeTemplateId = 'custom';
    if (sel) {
      sel.value = 'custom';
      window.coverdraftShortSelects?.collapse(sel);
    }
  }
}
// Any manual field edit means the document no longer matches a stock university preset.
['dynamicCourseFieldsContainer', 'dynamicStudentFieldsContainer'].forEach((id) => {
  const container = document.getElementById(id);
  container?.addEventListener('input', (event) => {
    if (event.target && (event.target.matches('input, textarea, select')))
      markAsCustomMode();
  });
  container?.addEventListener('change', (event) => {
    if (event.target && (event.target.matches('input, textarea, select')))
      markAsCustomMode();
  });
});
function loadUniversityPreset(uniKey) {
  const cfg = UNI_CONFIGS[uniKey];
  if (!cfg)
    return false;
  const pageToRestore = currentPageKey;
  documentPages[currentPageKey] = canvasElements;
  currentUniKey = uniKey;
  renderDynamicForm(uniKey);
  currentPageKey = 'cover';
  canvasElements = documentPages.cover || [];
  applyTemplate(cfg.styleId);
  currentPageKey = pageToRestore;
  canvasElements = documentPages[currentPageKey] || [];
  renderPageCanvas();
  scheduleAutoCompile();
  showToast(`Loaded ${cfg.name}`);
  return true;
}
function applyTemplate(tplId) {
  const tpl = TEMPLATES[tplId];
  if (!tpl)
    return;
  activeTemplateId = tplId;
  const fontSel = document.getElementById('f_fontFamily');
  if (fontSel)
    fontSel.value = tpl.font;
  if (tpl.border) {
    const borderCheck = document.getElementById('f_showBorder');
    const borderStyle = document.getElementById('f_borderStyle');
    const borderWidth = document.getElementById('f_borderWidth');
    const borderInset = document.getElementById('f_borderInset');
    const borderColor = document.getElementById('f_borderColor');
    if (borderCheck)
      borderCheck.checked = tpl.border.enabled;
    if (borderStyle)
      borderStyle.value = tpl.border.style;
    if (borderWidth)
      borderWidth.value = tpl.border.width;
    if (borderInset)
      borderInset.value = tpl.border.inset !== undefined ? tpl.border.inset : 28;
    if (borderColor)
      borderColor.value = tpl.border.color;
  }
  // Templates describe the Cover only. Never write them into whichever page happens to be open
  // (that is how an Index page could end up holding the cover layout and get saved that way).
  let layout = JSON.parse(JSON.stringify(tpl.layout));
  if (currentPageSizeKey !== 'a4')
    layout = resizeLayoutElements(layout, getPageDimensions().width / 794, getPageDimensions().height / 1123, PAGE_SIZE_FORMATS.a4);
  documentPages.cover = layout;
  if (currentPageKey === 'cover')
    canvasElements = layout;
  renderPageCanvas();
  scheduleAutoCompile();
}
function renderPageCanvas() {
  document.body.dataset.page = currentPageKey;
  const page = document.getElementById('page');
  const borderFrame = document.getElementById('pageBorderFrame');
  const selectedFont = document.getElementById('f_fontFamily')?.value || "'Times New Roman', serif";
  const fontScale = (Number(document.getElementById('f_fontScale')?.value) || 100) / 100;
  const lineSpacing = (Number(document.getElementById('f_lineSpacing')?.value) || 135) / 100;
  if (!page || !borderFrame)
    return;
  const pageDims = getPageDimensions();
  page.style.width = `${pageDims.width}px`;
  page.style.height = `${pageDims.height}px`;
  const centerX = document.getElementById('guideCenterX');
  const centerY = document.getElementById('guideCenterY');
  if (centerX)
    centerX.style.left = `${pageDims.width / 2}px`;
  if (centerY)
    centerY.style.top = `${pageDims.height / 2}px`;
  page.style.fontFamily = selectedFont;
  const showBorder = document.getElementById('f_showBorder')?.checked;
  const borderStyle = document.getElementById('f_borderStyle')?.value || 'solid';
  const borderWidth = document.getElementById('f_borderWidth')?.value || 2;
  const borderInset = document.getElementById('f_borderInset')?.value || 28;
  const borderColor = document.getElementById('f_borderColor')?.value || '#111111';
  if (showBorder) {
    borderFrame.style.display = 'block';
    borderFrame.style.top = `${borderInset}px`;
    borderFrame.style.left = `${borderInset}px`;
    borderFrame.style.right = `${borderInset}px`;
    borderFrame.style.bottom = `${borderInset}px`;
    borderFrame.style.border = `${borderWidth}px ${borderStyle} ${borderColor}`;
  } else {
    borderFrame.style.display = 'none';
  }
  Array.from(page.children).forEach(child => {
    if (!child.classList.contains('guide-line') && !child.classList.contains('page-border-frame')) {
      page.removeChild(child);
    }
  });
  canvasElements.forEach((el, index) => {
    const domEl = document.createElement('div');
    domEl.className = 'c-el';
    domEl.dataset.index = index;
    domEl.dataset.id = el.id || 'el_' + index;
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
      domEl.style.cursor = 'default';
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
      domEl.contentEditable = false;
      domEl.dataset.manualEditable = 'true';
      domEl.spellcheck = false;
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
      // TWO-WAY BINDING: Real-time update to currentFormData & sidebar input
      domEl.addEventListener('input', () => {
        const boundField = getBoundFieldForElement(el);
        if (boundField) {
          let cleanVal = domEl.innerText || domEl.textContent;
          if (el.id === 'submitted_to') {
            cleanVal = cleanVal.replace(/^(?:Submitted To|Evaluated By|Guided By|Faculty In-Charge|Faculty Coordinator):\s*/i, '').trim();
          } else if (el.id === 'code_line') {
            cleanVal = cleanVal.replace(/^(?:Course Code|Course Reference|Subject Code):\s*/i, '').trim();
          } else if (el.id === 'specialization') {
            cleanVal = cleanVal.replace(/^\(|\)$/g, '').trim();
          }
          currentFormData[boundField] = cleanVal;
          const sidebarInput = document.getElementById('field_' + boundField);
          if (sidebarInput)
            sidebarInput.value = cleanVal;
          delete el.customContent;
          scheduleAutoCompile();
        } else {
          markAsCustomMode();
          const clone = domEl.cloneNode(true);
          clone.querySelectorAll('.el-badge, .resize-handle, .guide-line').forEach(node => node.remove());
          el.customContent = clone.innerHTML;
          scheduleAutoCompile();
        }
      });
    }
    const badge = document.createElement('div');
    badge.className = 'el-badge';
    badge.textContent = el.id;
    domEl.appendChild(badge);
    // Text and tables only resize in width, so they get just the two side handles. Corner handles on a thin line of
    // text overlapped each other and were easy to hit by mistake. Logos use corners; shapes keep all six.
    const handlePositions = el.type === 'shape'
      ? ['rh-nw', 'rh-ne', 'rh-se', 'rh-sw', 'rh-e', 'rh-w']
      : el.type === 'logo' ? ['rh-nw', 'rh-ne', 'rh-se', 'rh-sw'] : ['rh-e', 'rh-w'];
    handlePositions.forEach(pos => {
      const rh = document.createElement('div');
      rh.className = `resize-handle ${pos}`;
      domEl.appendChild(rh);
    });
    page.appendChild(domEl);
    if (el.type !== 'image')
      attachElementInteractions(domEl, el);
  });
}
