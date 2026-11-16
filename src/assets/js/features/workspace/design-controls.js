/* Design panel: global typography controls with a one-click reset, plus the fit-width and actual-size zoom shortcuts. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  window.updateDesignControlLabels = function () {
    if ($('f_fontScaleValue') && $('f_fontScale'))
      $('f_fontScaleValue').textContent = `${$('f_fontScale').value}%`;
    if ($('f_lineSpacingValue') && $('f_lineSpacing'))
      $('f_lineSpacingValue').textContent = `${(Number($('f_lineSpacing').value) / 100).toFixed(2)}×`;
  };
  ['f_fontScale', 'f_lineSpacing'].forEach((id) => $(id)?.addEventListener('input', window.updateDesignControlLabels));
  $('resetDesignControlsBtn')?.addEventListener('click', () => {
    if ($('f_fontFamily'))
      $('f_fontFamily').value = "'Times New Roman', Times, serif";
    if ($('f_fontScale'))
      $('f_fontScale').value = '100';
    if ($('f_lineSpacing'))
      $('f_lineSpacing').value = '135';
    if ($('f_showBorder'))
      $('f_showBorder').checked = true;
    if ($('f_borderStyle'))
      $('f_borderStyle').value = 'solid';
    if ($('f_borderWidth'))
      $('f_borderWidth').value = '2';
    if ($('f_borderInset'))
      $('f_borderInset').value = '28';
    if ($('f_borderColor'))
      $('f_borderColor').value = '#111111';
    if (typeof markAsCustomMode === 'function')
      markAsCustomMode();
    window.updateDesignControlLabels();
    if (typeof renderPageCanvas === 'function')
      renderPageCanvas();
    if (typeof scheduleAutoCompile === 'function')
      scheduleAutoCompile();
    showToast('Design controls restored to defaults');
  });
  // Useful zoom targets in addition to fitting the full page.
  $('zoomFitWidthBtn')?.addEventListener('click', () => {
    const viewport = $('stageViewport');
    if (!viewport)
      return;
    const dims = window.coverdraftPageDimensions?.() || { width: 794 };
    updateZoom((viewport.clientWidth - 48) / dims.width);
    viewport.scrollTo({ left: 0, top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  $('zoomActualBtn')?.addEventListener('click', () => updateZoom(1));
  window.addEventListener('load', () => window.updateDesignControlLabels());
})();
