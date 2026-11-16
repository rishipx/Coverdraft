// Compact top-bar selects: short label when closed ("7th Sem", "I.K.G.P.T.U"), full label in the open list.
(function () {
  'use strict';
  const shortNameOf = (id) => (id === 'custom' ? 'Custom' : UNIVERSITY_LIST.find((u) => u.id === id)?.shortName);
  const shortOf = (sel, o) => sel.dataset.shortSelect === 'uni'
    ? (shortNameOf(o.value) || (isSavedLayoutValue(o.value) ? (o.dataset.short || o.dataset.long) : o.dataset.long))
    : o.dataset.long.replace(/\s*Semester$/i, ' Sem');
  function init(sel) {
    if (!sel || sel.dataset.shortReady)
      return;
    [...sel.options].forEach((o) => {
      if (!o.dataset.long)
        o.dataset.long = o.text;
    });
    sel.dataset.shortReady = '1';
    sel.dataset.open = '';
    collapse(sel);
  }
  function expand(sel) {
    sel.dataset.open = '1';
    [...sel.options].forEach((o) => {
      o.text = o.dataset.long;
    });
  }
  function collapse(sel) {
    if (!sel)
      return;
    [...sel.options].forEach((o) => {
      if (!o.dataset.long)
        o.dataset.long = o.text;
      o.text = shortOf(sel, o);
    });
    sel.dataset.open = '';
  }
  function bind(sel) {
    init(sel);
    sel.addEventListener('mousedown', () => expand(sel));
    sel.addEventListener('touchstart', () => expand(sel), { passive: true });
    sel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab')
        setTimeout(() => collapse(sel), 0);
      else if (e.altKey || e.key === ' ')
        expand(sel);
    });
    ['change', 'blur'].forEach((ev) => sel.addEventListener(ev, () => setTimeout(() => collapse(sel), 0)));
  }
  window.coverdraftShortSelects = { init, collapse, expand };
  document.addEventListener('DOMContentLoaded', () => {
    const uni = document.getElementById('uniPresetSelect');
    if (uni)
      bind(uni);
    const sem = document.getElementById('sbSem');
    if (sem) {
      if (!sem.options.length) {
        const src = document.getElementById('batchSemSelect');
        if (src)
          sem.innerHTML = src.innerHTML;
      }
      bind(sem);
    }
  });
  // Programmatic .value changes made elsewhere don't fire events; keep labels short.
  const uniEl = () => document.getElementById('uniPresetSelect');
  window.addEventListener('load', () => {
    collapse(uniEl());
  });
})();
