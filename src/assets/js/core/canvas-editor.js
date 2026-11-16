/* Canvas interactions, selection, formatting controls, zoom, and snapping. */
function attachElementInteractions(domEl, stateEl) {
  const guideX = document.getElementById('guideCenterX');
  const guideY = document.getElementById('guideCenterY');
  const dimensions = window.coverdraftPageDimensions?.() || { width: 794, height: 1123 };
  const PAGE_W = dimensions.width, PAGE_H = dimensions.height;
  const pageCenterH = PAGE_W / 2;
  const pageCenterV = PAGE_H / 2;
  let lastTapAt = 0;
  const SNAP_THRESHOLD = 6;
  function computeSnap(newX, newY, w, h) {
    const xTargets = [0, pageCenterH, PAGE_W];
    const yTargets = [0, pageCenterV, PAGE_H];
    document.querySelectorAll('#page > .c-el').forEach(other => {
      if (other === domEl)
        return;
      const ox = parseFloat(other.style.left) || 0;
      const oy = parseFloat(other.style.top) || 0;
      const ow = other.offsetWidth;
      const oh = other.offsetHeight;
      xTargets.push(ox, ox + ow / 2, ox + ow);
      yTargets.push(oy, oy + oh / 2, oy + oh);
    });
    let snappedX = null, bestXDelta = SNAP_THRESHOLD;
    [newX, newX + w / 2, newX + w].forEach((probe) => {
      xTargets.forEach(t => {
        const d = Math.abs(probe - t);
        if (d < bestXDelta) {
          bestXDelta = d;
          snappedX = { line: t, resultX: newX + (t - probe) };
        }
      });
    });
    let snappedY = null, bestYDelta = SNAP_THRESHOLD;
    [newY, newY + h / 2, newY + h].forEach((probe) => {
      yTargets.forEach(t => {
        const d = Math.abs(probe - t);
        if (d < bestYDelta) {
          bestYDelta = d;
          snappedY = { line: t, resultY: newY + (t - probe) };
        }
      });
    });
    return { snappedX, snappedY };
  }
  const beginManualEdit = (event) => {
    // Index table cells edit their corresponding data row, not the entire table wrapper.
    if (stateEl?.type === 'expTable') {
      const cell = event?.target?.closest?.('td[data-index-field][data-index-row]');
      if (!cell || !domEl.contains(cell))
        return;
      selectElement(domEl);
      if (cell.isContentEditable)
        return;
      cell.dataset.originalText = cell.textContent || '';
      cell.contentEditable = 'true';
      cell.classList.add('index-cell-editing');
      cell.spellcheck = false;
      cell.setAttribute('role', 'textbox');
      cell.setAttribute('aria-label', `Edit index ${cell.dataset.indexField}`);
      cell.focus({ preventScroll: true });
      const x = event?.clientX, y = event?.clientY;
      try {
        let range;
        if (document.caretPositionFromPoint && Number.isFinite(x) && Number.isFinite(y)) {
          const pos = document.caretPositionFromPoint(x, y);
          if (pos && cell.contains(pos.offsetNode)) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
          }
        } else if (document.caretRangeFromPoint && Number.isFinite(x) && Number.isFinite(y)) {
          const candidate = document.caretRangeFromPoint(x, y);
          if (candidate && cell.contains(candidate.startContainer))
            range = candidate;
        }
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (_) { }
      return;
    }
    if (!domEl.dataset.manualEditable)
      return;
    selectElement(domEl);
    domEl.contentEditable = true;
    domEl.querySelectorAll('.el-badge, .resize-handle').forEach(node => {
      node.style.display = 'none';
    });
    domEl.focus({ preventScroll: true });
    const x = event?.clientX, y = event?.clientY;
    try {
      let range;
      if (document.caretPositionFromPoint && Number.isFinite(x) && Number.isFinite(y)) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      } else if (document.caretRangeFromPoint && Number.isFinite(x) && Number.isFinite(y))
        range = document.caretRangeFromPoint(x, y);
      if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (_) { }
  };
  const commitIndexCell = (cell, cancel = false) => {
    if (!cell || cell.dataset.commitDone === '1')
      return;
    cell.contentEditable = 'false';
    cell.classList.remove('index-cell-editing');
    cell.removeAttribute('role');
    cell.removeAttribute('aria-label');
    if (cancel)
      cell.textContent = cell.dataset.originalText || '';
    else {
      const rowIndex = Math.max(0, Number.parseInt(cell.dataset.indexRow, 10) || 0);
      const field = cell.dataset.indexField;
      let value = (cell.innerText || cell.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (field === 'date') {
        const displayDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
        if (displayDate)
          value = `${displayDate[3]}-${displayDate[2].padStart(2, '0')}-${displayDate[1].padStart(2, '0')}`;
      }
      if (['title', 'page', 'date'].includes(field) && typeof experimentsList !== 'undefined') {
        // Do not create a phantom blank row when a user opens and leaves the placeholder cell unchanged.
        if (rowIndex < experimentsList.length) {
          experimentsList[rowIndex][field] = value;
        } else if (value) {
          while (experimentsList.length <= rowIndex)
            experimentsList.push({ no: experimentsList.length + 1, title: '', page: '', date: '' });
          experimentsList[rowIndex][field] = value;
        }
        experimentsList.forEach((row, i) => {
          row.no = i + 1;
        });
      }
      cell.dataset.commitDone = '1';
      try {
        if (typeof persistIndexRows === 'function')
          persistIndexRows();
      } catch (error) {
        console.warn('Could not save edited index cell:', error);
      }
      try {
        if (typeof renderExperimentsPanel === 'function')
          renderExperimentsPanel();
      } catch (error) {
        console.warn('Could not refresh index fields:', error);
      }
      if (typeof scheduleAutoCompile === 'function')
        scheduleAutoCompile();
      if (typeof renderPageCanvas === 'function')
        renderPageCanvas();
    }
    delete cell.dataset.commitDone;
    delete cell.dataset.originalText;
  };
  domEl.addEventListener('keydown', e => {
    const cell = e.target.closest?.('td[data-index-field][data-index-row]');
    if (!cell || !cell.isContentEditable)
      return;
    if (e.key === 'Enter') {
      e.preventDefault();
      cell.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commitIndexCell(cell, true);
      cell.blur();
    }
  });
  domEl.addEventListener('blur', e => {
    const cell = e.target.closest?.('td[data-index-field][data-index-row]');
    if (cell && cell.isContentEditable)
      commitIndexCell(cell);
  }, true);
  domEl.addEventListener('dblclick', e => {
    e.preventDefault();
    beginManualEdit(e);
  });
  domEl.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch')
      return;
    const now = Date.now();
    if (now - lastTapAt < 360) {
      e.preventDefault();
      beginManualEdit(e);
      lastTapAt = 0;
    } else
      lastTapAt = now;
  });
  domEl.addEventListener('keydown', e => {
    if (e.key === 'Escape' && domEl.isContentEditable) {
      domEl.contentEditable = false;
      domEl.blur();
      renderPageCanvas();
    }
  });
  domEl.addEventListener('blur', () => {
    if (!domEl.dataset.manualEditable)
      return;
    if (domEl.isContentEditable)
      domEl.contentEditable = false;
    domEl.querySelectorAll('.el-badge, .resize-handle').forEach(node => {
      node.style.display = '';
    });
  }, true);
  domEl.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('simple-mode'))
      return;
    if (domEl.isContentEditable && document.activeElement === domEl)
      return;
    const indexEditCell = stateEl?.type === 'expTable' && e.target.closest?.('td[data-index-field][data-index-row]');
    if ((domEl.dataset.manualEditable || indexEditCell) && e.detail >= 2) {
      e.preventDefault();
      selectElement(domEl);
      return;
    }
    if (e.target.classList.contains('resize-handle')) {
      handleResize(e, domEl, stateEl, e.target);
      return;
    }
    if (e.target.isContentEditable && (document.activeElement === domEl || document.activeElement === e.target || document.activeElement?.isContentEditable)) {
      return;
    }
    const isTouch = e.pointerType === 'touch';
    if (isTouch && !domEl.classList.contains('selected')) {
      // First touch only selects (on release). Scrolling and pinching over text then never grabs it by accident.
      const tapX = e.clientX, tapY = e.clientY;
      let travelled = false;
      const onTapMove = (ev) => {
        if (Math.hypot(ev.clientX - tapX, ev.clientY - tapY) > 8)
          travelled = true;
      };
      const endTap = (ev) => {
        document.removeEventListener('pointermove', onTapMove);
        document.removeEventListener('pointerup', endTap);
        document.removeEventListener('pointercancel', endTap);
        if (ev.type === 'pointerup' && !travelled && !window.coverdraftPinching)
          selectElement(domEl);
      };
      document.addEventListener('pointermove', onTapMove);
      document.addEventListener('pointerup', endTap);
      document.addEventListener('pointercancel', endTap);
      return;
    }
    e.preventDefault();
    selectElement(domEl);
    domEl.classList.add('dragging');
    domEl.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = stateEl.x;
    const initialTop = stateEl.y;
    let dragStarted = !isTouch;
    function onMouseMove(ev) {
      if (window.coverdraftPinching)
        return;
      if (!dragStarted) {
        // Ignore tiny finger jitter so a tap on a selected element does not nudge it.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5)
          return;
        dragStarted = true;
      }
      markAsCustomMode();
      const dx = (ev.clientX - startX) / zoomLevel;
      const dy = (ev.clientY - startY) / zoomLevel;
      let newX = Math.round(initialLeft + dx);
      let newY = Math.round(initialTop + dy);
      newX = Math.max(0, Math.min(PAGE_W - (stateEl.w || 40), newX));
      newY = Math.max(0, Math.min(PAGE_H - domEl.offsetHeight, newY));
      if (isSmartSnapEnabled && guideX && guideY) {
        const w = stateEl.w || domEl.offsetWidth;
        const h = domEl.offsetHeight;
        const { snappedX, snappedY } = computeSnap(newX, newY, w, h);
        if (snappedX) {
          newX = snappedX.resultX;
          guideX.style.left = snappedX.line + 'px';
          guideX.style.display = 'block';
        } else {
          guideX.style.display = 'none';
        }
        if (snappedY) {
          newY = snappedY.resultY;
          guideY.style.top = snappedY.line + 'px';
          guideY.style.display = 'block';
        } else {
          guideY.style.display = 'none';
        }
      }
      domEl.style.left = newX + 'px';
      domEl.style.top = newY + 'px';
      stateEl.x = newX;
      stateEl.y = newY;
      updateToolbarPosition();
    }
    function onMouseUp(ev) {
      domEl.classList.remove('dragging');
      try {
        domEl.releasePointerCapture(ev.pointerId);
      } catch (_) { }
      if (guideX)
        guideX.style.display = 'none';
      if (guideY)
        guideY.style.display = 'none';
      document.removeEventListener('pointermove', onMouseMove);
      document.removeEventListener('pointerup', onMouseUp);
      document.removeEventListener('pointercancel', onMouseUp);
      document.removeEventListener('coverdraft:gesture-cancel', onGestureCancel);
      scheduleAutoCompile();
    }
    // A second finger (pinch) puts the element back and ends the drag.
    function onGestureCancel() {
      stateEl.x = initialLeft;
      stateEl.y = initialTop;
      domEl.style.left = initialLeft + 'px';
      domEl.style.top = initialTop + 'px';
      onMouseUp({ pointerId: e.pointerId });
    }
    document.addEventListener('pointermove', onMouseMove);
    document.addEventListener('pointerup', onMouseUp);
    document.addEventListener('pointercancel', onMouseUp);
    document.addEventListener('coverdraft:gesture-cancel', onGestureCancel);
  });
}
function handleResize(e, domEl, stateEl, handle) {
  e.preventDefault();
  e.stopPropagation();
  markAsCustomMode();
  handle.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startY = e.clientY;
  const initialW = stateEl.w;
  const initialX = stateEl.x;
  const initialH = Number(stateEl.h);
  const initialY = stateEl.y;
  const isEast = handle.classList.contains('rh-e') || handle.classList.contains('rh-se') || handle.classList.contains('rh-ne');
  const isWest = handle.classList.contains('rh-w') || handle.classList.contains('rh-sw') || handle.classList.contains('rh-nw');
  const isNorth = handle.classList.contains('rh-nw') || handle.classList.contains('rh-ne');
  const isSouth = handle.classList.contains('rh-sw') || handle.classList.contains('rh-se');
  // Shapes and dividers also resize vertically from the corner handles.
  const resizesHeight = stateEl.type === 'shape' && Number.isFinite(initialH) && (isNorth || isSouth);
  const initialState = { w: stateEl.w, x: stateEl.x, y: stateEl.y, h: stateEl.h };
  function onResizeMove(ev) {
    if (window.coverdraftPinching)
      return;
    const dx = (ev.clientX - startX) / zoomLevel;
    const dy = (ev.clientY - startY) / zoomLevel;
    let newW = initialW;
    if (resizesHeight) {
      const newH = Math.max(2, Math.round(isSouth ? initialH + dy : initialH - dy));
      stateEl.h = newH;
      domEl.style.height = newH + 'px';
      if (isNorth) {
        stateEl.y = Math.round(initialY + (initialH - newH));
        domEl.style.top = stateEl.y + 'px';
      }
    }
    if (isEast) {
      newW = Math.max(40, initialW + dx);
    } else if (isWest) {
      newW = Math.max(40, initialW - dx);
      stateEl.x = initialX + (initialW - newW);
      domEl.style.left = stateEl.x + 'px';
    }
    domEl.style.width = newW + 'px';
    stateEl.w = newW;
    if (stateEl.type === 'logo') {
      domEl.style.height = newW + 'px';
      stateEl.h = newW;
    }
    updateToolbarPosition();
  }
  function onResizeUp(ev) {
    try {
      handle.releasePointerCapture(ev.pointerId);
    } catch (_) { }
    document.removeEventListener('pointermove', onResizeMove);
    document.removeEventListener('pointerup', onResizeUp);
    document.removeEventListener('pointercancel', onResizeUp);
    document.removeEventListener('coverdraft:gesture-cancel', onResizeCancel);
    scheduleAutoCompile();
  }
  function onResizeCancel() {
    Object.assign(stateEl, initialState);
    domEl.style.width = initialState.w + 'px';
    domEl.style.left = initialState.x + 'px';
    domEl.style.top = initialState.y + 'px';
    if (Number.isFinite(Number(initialState.h)) && (stateEl.type === 'shape' || stateEl.type === 'logo'))
      domEl.style.height = initialState.h + 'px';
    onResizeUp({ pointerId: e.pointerId });
  }
  document.addEventListener('pointermove', onResizeMove);
  document.addEventListener('pointerup', onResizeUp);
  document.addEventListener('pointercancel', onResizeUp);
  document.addEventListener('coverdraft:gesture-cancel', onResizeCancel);
}
function selectElement(el) {
  if (document.body.classList.contains('simple-mode'))
    return;
  if (selectedDomEl) {
    selectedDomEl.classList.remove('selected');
  }
  selectedDomEl = el;
  el.classList.add('selected');
  const selectedState = canvasElements[el.dataset.index];
  document.body.dataset.sel = selectedState ? (selectedState.type || 'text') : 'none';
  const tb = document.getElementById('miniToolbar');
  if (!tb)
    return;
  const stateEl = canvasElements[el.dataset.index];
  if (!stateEl || stateEl.type === 'shape' || stateEl.type === 'expTable') {
    tb.style.display = 'none';
    return;
  }
  tb.style.display = 'flex';
  const fontSelect = document.getElementById('tbFontSelect');
  const sizeDown = document.getElementById('tbSizeDown');
  const sizeLabel = document.getElementById('tbSizeLabel');
  const sizeUp = document.getElementById('tbSizeUp');
  const boldBtn = document.getElementById('tbBoldBtn');
  const italicBtn = document.getElementById('tbItalicBtn');
  const underlineBtn = document.getElementById('tbUnderlineBtn');
  const alignLeft = document.getElementById('tbAlignLeft');
  const alignCenter = document.getElementById('tbAlignCenter');
  const alignRight = document.getElementById('tbAlignRight');
  const colorWrap = document.querySelector('.color-picker-wrap');
  const colorPicker = document.getElementById('tbColorPicker');
  const colorSwatch = document.getElementById('tbColorSwatch');
  const spacingSlider = document.getElementById('tbSpacingSlider');
  const spacingVal = document.getElementById('tbSpacingVal');
  const spacingGroup = document.querySelector('.tb-spacing-group');
  if (stateEl.type === 'logo') {
    [fontSelect, sizeDown, sizeLabel, sizeUp, boldBtn, italicBtn, underlineBtn, alignLeft, alignCenter, alignRight, colorWrap, spacingGroup].forEach(c => {
      if (c)
        c.style.display = 'none';
    });
  } else {
    [fontSelect, sizeDown, sizeLabel, sizeUp, boldBtn, italicBtn, underlineBtn, alignLeft, alignCenter, alignRight, colorWrap, spacingGroup].forEach(c => {
      if (c)
        c.style.display = '';
    });
    if (fontSelect)
      fontSelect.value = stateEl.font || document.getElementById('f_fontFamily')?.value || "'Times New Roman', serif";
    const curSize = stateEl.size || 16;
    if (sizeLabel)
      sizeLabel.textContent = Math.round(curSize) + 'px';
    const isBold = stateEl.weight === 'bold' || stateEl.weight === 700 || stateEl.weight === 800 || stateEl.weight === '800';
    if (boldBtn)
      boldBtn.classList.toggle('active', !!isBold);
    if (italicBtn)
      italicBtn.classList.toggle('active', !!stateEl.italic);
    if (underlineBtn)
      underlineBtn.classList.toggle('active', !!stateEl.underline);
    const curAlign = stateEl.align || 'center';
    if (alignLeft)
      alignLeft.classList.toggle('active', curAlign === 'left');
    if (alignCenter)
      alignCenter.classList.toggle('active', curAlign === 'center');
    if (alignRight)
      alignRight.classList.toggle('active', curAlign === 'right');
    const curColor = stateEl.color || '#111111';
    if (colorPicker)
      colorPicker.value = curColor.startsWith('#') ? curColor : '#111111';
    if (colorSwatch)
      colorSwatch.style.backgroundColor = curColor;
    const curSpacing = stateEl.lineHeight || 1.35;
    if (spacingSlider)
      spacingSlider.value = curSpacing;
    if (spacingVal)
      spacingVal.textContent = curSpacing.toFixed(2);
  }
  updateToolbarPosition();
}
function deselectAll() {
  if (selectedDomEl) {
    selectedDomEl.classList.remove('selected');
    if (document.activeElement === selectedDomEl) {
      selectedDomEl.blur();
    }
  }
  selectedDomEl = null;
  document.body.dataset.sel = 'none';
  const tb = document.getElementById('miniToolbar');
  if (tb)
    tb.style.display = 'none';
}
function updateToolbarPosition() {
  if (!selectedDomEl)
    return;
  const tb = document.getElementById('miniToolbar');
  if (!tb)
    return;
  const rect = selectedDomEl.getBoundingClientRect();
  const tbW = tb.offsetWidth || 440;
  const tbH = tb.offsetHeight || 34;
  const margin = 8;
  // On phones keep the toolbar inside the page area so it never covers the header bars.
  const phone = window.innerWidth <= 760;
  const stage = phone ? document.getElementById('stageViewport')?.getBoundingClientRect() : null;
  const minTop = stage ? stage.top + 4 : margin;
  const maxBottom = stage ? Math.min(window.innerHeight, stage.bottom) - 4 : window.innerHeight - margin;
  let top = rect.top - tbH - 8;
  if (top < minTop) {
    top = rect.bottom + 8;
  }
  top = Math.max(minTop, Math.min(maxBottom - tbH, top));
  let left = rect.left;
  left = Math.max(margin, Math.min(window.innerWidth - tbW - margin, left));
  tb.style.top = top + 'px';
  tb.style.left = left + 'px';
  // Stylesheets that must override inline positions (phone layout) read these instead.
  tb.style.setProperty('--tb-top', top + 'px');
  tb.style.setProperty('--tb-left', left + 'px');
}
window.addEventListener('resize', () => {
  if (selectedDomEl)
    updateToolbarPosition();
});
// Keep the toolbar attached to the selected element while the page scrolls.
let toolbarScrollFrame = 0;
document.getElementById('stageViewport')?.addEventListener('scroll', () => {
  if (!selectedDomEl || toolbarScrollFrame)
    return;
  toolbarScrollFrame = requestAnimationFrame(() => {
    toolbarScrollFrame = 0;
    updateToolbarPosition();
  });
}, { passive: true });
document.getElementById('stageViewport')?.addEventListener('mousedown', (e) => {
  if (e.target.closest('#miniToolbar') || e.target.closest('.canvas-toolbar-overlay') || e.target.closest('#pageToolbar'))
    return;
  if (!e.target.closest('.c-el')) {
    deselectAll();
  }
});
const boldBtn = document.getElementById('tbBoldBtn');
if (boldBtn) {
  boldBtn.addEventListener('click', () => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    const isCurrentlyBold = stateEl.weight === 'bold' || stateEl.weight === 700 || stateEl.weight === 800 || stateEl.weight === '800';
    stateEl.weight = isCurrentlyBold ? 'normal' : 'bold';
    selectedDomEl.style.fontWeight = stateEl.weight;
    boldBtn.classList.toggle('active', !isCurrentlyBold);
    scheduleAutoCompile();
    showToast(stateEl.weight === 'bold' ? 'Bold enabled' : 'Bold removed');
  });
}
const italicBtn = document.getElementById('tbItalicBtn');
if (italicBtn) {
  italicBtn.addEventListener('click', () => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    stateEl.italic = !stateEl.italic;
    selectedDomEl.style.fontStyle = stateEl.italic ? 'italic' : 'normal';
    italicBtn.classList.toggle('active', !!stateEl.italic);
    scheduleAutoCompile();
    showToast(stateEl.italic ? 'Italic enabled' : 'Italic removed');
  });
}
const underlineBtn = document.getElementById('tbUnderlineBtn');
if (underlineBtn) {
  underlineBtn.addEventListener('click', () => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    stateEl.underline = !stateEl.underline;
    selectedDomEl.style.textDecoration = stateEl.underline ? 'underline' : 'none';
    underlineBtn.classList.toggle('active', !!stateEl.underline);
    scheduleAutoCompile();
    showToast(stateEl.underline ? 'Underline enabled' : 'Underline removed');
  });
}
const sizeUpBtn = document.getElementById('tbSizeUp');
if (sizeUpBtn) {
  sizeUpBtn.addEventListener('click', () => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    stateEl.size = Math.min(72, (stateEl.size || 16) + 1);
    selectedDomEl.style.fontSize = stateEl.size + 'px';
    const lbl = document.getElementById('tbSizeLabel');
    if (lbl)
      lbl.textContent = stateEl.size + 'px';
    updateToolbarPosition();
    scheduleAutoCompile();
  });
}
const sizeDownBtn = document.getElementById('tbSizeDown');
if (sizeDownBtn) {
  sizeDownBtn.addEventListener('click', () => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    stateEl.size = Math.max(8, (stateEl.size || 16) - 1);
    selectedDomEl.style.fontSize = stateEl.size + 'px';
    const lbl = document.getElementById('tbSizeLabel');
    if (lbl)
      lbl.textContent = stateEl.size + 'px';
    updateToolbarPosition();
    scheduleAutoCompile();
  });
}
['tbAlignLeft', 'tbAlignCenter', 'tbAlignRight'].forEach(btnId => {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener('click', () => {
      if (!selectedDomEl)
        return;
      markAsCustomMode();
      const stateEl = canvasElements[selectedDomEl.dataset.index];
      const align = btn.dataset.align;
      stateEl.align = align;
      selectedDomEl.style.textAlign = align;
      document.getElementById('tbAlignLeft')?.classList.toggle('active', align === 'left');
      document.getElementById('tbAlignCenter')?.classList.toggle('active', align === 'center');
      document.getElementById('tbAlignRight')?.classList.toggle('active', align === 'right');
      scheduleAutoCompile();
    });
  }
});
const colorPickerInput = document.getElementById('tbColorPicker');
if (colorPickerInput) {
  colorPickerInput.addEventListener('input', (e) => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    stateEl.color = e.target.value;
    selectedDomEl.style.color = stateEl.color;
    const swatch = document.getElementById('tbColorSwatch');
    if (swatch)
      swatch.style.backgroundColor = stateEl.color;
    scheduleAutoCompile();
  });
}
const fontSelect = document.getElementById('tbFontSelect');
if (fontSelect) {
  fontSelect.addEventListener('change', (e) => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    stateEl.font = e.target.value;
    selectedDomEl.style.fontFamily = stateEl.font;
    scheduleAutoCompile();
  });
}
const spacingSliderInput = document.getElementById('tbSpacingSlider');
if (spacingSliderInput) {
  spacingSliderInput.addEventListener('input', (e) => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    const val = parseFloat(e.target.value);
    stateEl.lineHeight = val;
    selectedDomEl.style.lineHeight = val;
    const label = document.getElementById('tbSpacingVal');
    if (label)
      label.textContent = val.toFixed(2);
    updateToolbarPosition();
    scheduleAutoCompile();
  });
}
const dupBtn = document.getElementById('tbDuplicate');
if (dupBtn) {
  dupBtn.addEventListener('click', () => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    const stateEl = canvasElements[selectedDomEl.dataset.index];
    const dup = JSON.parse(JSON.stringify(stateEl));
    dup.x += 16;
    dup.y += 16;
    dup.id = `${dup.id}_copy`;
    canvasElements.push(dup);
    renderPageCanvas();
    showToast('Element duplicated');
  });
}
const delBtn = document.getElementById('tbDelete');
if (delBtn) {
  delBtn.addEventListener('click', () => {
    if (!selectedDomEl)
      return;
    markAsCustomMode();
    canvasElements.splice(parseInt(selectedDomEl.dataset.index), 1);
    deselectAll();
    renderPageCanvas();
    showToast('Element deleted');
  });
}
const canvasArea = document.getElementById('canvasArea');
const stageViewport = document.getElementById('stageViewport');
function updateZoom(newZoom) {
  zoomLevel = Math.min(2.5, Math.max(0.25, newZoom));
  if (canvasArea) {
    canvasArea.style.transform = `scale(${zoomLevel})`;
    // Handles and badges counter-scale with this so they stay finger-sized at any zoom.
    canvasArea.style.setProperty('--zoom', String(zoomLevel));
  }
  const zoomVal = document.getElementById('zoomVal');
  if (zoomVal)
    zoomVal.textContent = Math.round(zoomLevel * 100) + '%';
  updateToolbarPosition();
}
document.getElementById('zoomInBtn')?.addEventListener('click', () => updateZoom(zoomLevel + 0.1));
document.getElementById('zoomOutBtn')?.addEventListener('click', () => updateZoom(zoomLevel - 0.1));
document.getElementById('zoomFitBtn')?.addEventListener('click', () => {
  if (!stageViewport)
    return;
  const stageW = stageViewport.clientWidth;
  const stageH = stageViewport.clientHeight;
  const dims = window.coverdraftPageDimensions?.() || { width: 794, height: 1123 };
  const phone = window.innerWidth <= 760;
  const fitW = (stageW - (phone ? 20 : 60)) / dims.width;
  const fitH = (stageH - (phone ? 28 : 80)) / dims.height;
  updateZoom(Math.min(fitW, fitH));
  stageViewport.scrollTo({ left: 0, top: 0, behavior: phone || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
stageViewport?.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    updateZoom(zoomLevel - e.deltaY * 0.002);
  }
}, { passive: false });
let isSpacePressed = false;
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !isSpacePressed && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    isSpacePressed = true;
    if (stageViewport)
      stageViewport.style.cursor = 'grab';
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    isSpacePressed = false;
    if (stageViewport)
      stageViewport.style.cursor = 'default';
  }
});
stageViewport?.addEventListener('mousedown', (e) => {
  if (!isSpacePressed)
    return;
  e.preventDefault();
  stageViewport.style.cursor = 'grabbing';
  const startX = e.clientX;
  const startY = e.clientY;
  const scrollL = stageViewport.scrollLeft;
  const scrollT = stageViewport.scrollTop;
  function onPan(ev) {
    stageViewport.scrollLeft = scrollL - (ev.clientX - startX);
    stageViewport.scrollTop = scrollT - (ev.clientY - startY);
  }
  function onPanEnd() {
    stageViewport.style.cursor = isSpacePressed ? 'grab' : 'default';
    document.removeEventListener('mousemove', onPan);
    document.removeEventListener('mouseup', onPanEnd);
  }
  document.addEventListener('mousemove', onPan);
  document.addEventListener('mouseup', onPanEnd);
});
// Touch: pinch to zoom around the fingers, double-tap empty space to switch between fit and 100%.
(function setupTouchZoom() {
  if (!stageViewport || !canvasArea)
    return;
  const touches = new Map();
  let pinch = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  const hud = document.createElement('div');
  hud.className = 'zoom-hud';
  hud.setAttribute('role', 'status');
  hud.hidden = true;
  document.body.appendChild(hud);
  let hudTimer = 0;
  const showHud = () => {
    hud.textContent = Math.round(zoomLevel * 100) + '%';
    hud.hidden = false;
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      hud.hidden = true;
    }, 700);
  };
  const pair = () => [...touches.values()].slice(0, 2);
  const zoomAround = (zoom, fx, fy) => {
    const before = canvasArea.getBoundingClientRect();
    const ux = (fx - before.left) / zoomLevel;
    const uy = (fy - before.top) / zoomLevel;
    updateZoom(zoom);
    const after = canvasArea.getBoundingClientRect();
    stageViewport.scrollLeft += after.left + ux * zoomLevel - fx;
    stageViewport.scrollTop += after.top + uy * zoomLevel - fy;
    showHud();
  };
  stageViewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch')
      return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = pair();
      pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z0: zoomLevel };
      window.coverdraftPinching = true;
      document.dispatchEvent(new CustomEvent('coverdraft:gesture-cancel'));
    }
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId))
      return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch || touches.size < 2)
      return;
    const [a, b] = pair();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAround(pinch.z0 * d / pinch.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
  });
  const release = (e) => {
    if (!touches.has(e.pointerId))
      return;
    const wasPinch = Boolean(pinch) || window.coverdraftPinching === true;
    touches.delete(e.pointerId);
    if (touches.size < 2)
      pinch = null;
    if (touches.size === 0 && window.coverdraftPinching)
      setTimeout(() => {
        window.coverdraftPinching = false;
      }, 120);
    if (e.type !== 'pointerup' || wasPinch)
      return;
    if (e.target.closest?.('.c-el, .resize-handle, #miniToolbar, button, select, input'))
      return;
    const now = Date.now();
    if (now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = { t: 0, x: 0, y: 0 };
      if (zoomLevel < 0.95)
        zoomAround(1, e.clientX, e.clientY);
      else
        document.getElementById('zoomFitBtn')?.click();
      showHud();
    } else
      lastTap = { t: now, x: e.clientX, y: e.clientY };
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
})();
const snapBtn = document.getElementById('snapToggleBtn');
if (snapBtn) {
  snapBtn.addEventListener('click', () => {
    isSmartSnapEnabled = !isSmartSnapEnabled;
    snapBtn.classList.toggle('active', isSmartSnapEnabled);
    showToast(isSmartSnapEnabled ? 'Center snapping enabled' : 'Snapping disabled');
  });
}
/* Line-spacing popover in the element toolbar. */
(function () {
  const toggle = document.getElementById('tbSpacingToggle');
  const pop = document.getElementById('tbSpacingPop');
  if (!toggle || !pop)
    return;
  const set = (open) => {
    pop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('active', open);
    if (typeof updateToolbarPosition === 'function')
      updateToolbarPosition();
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    set(pop.hidden);
  });
  document.addEventListener('mousedown', (e) => {
    if (!pop.hidden && !e.target.closest('.tb-spacing-group'))
      set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden)
      set(false);
  });
})();
