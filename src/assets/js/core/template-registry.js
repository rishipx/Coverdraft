/* Fills the university pickers from the generated template registry (UNIVERSITY_LIST).
   Universities a user has deleted (university.hidden, see university-overrides.js) are left out. */
(function () {
  'use strict';

  const PICKERS = ['uniPresetSelect', 'qsUniversity', 'batchUniSelect'];

  let firstFill = true;

  function fillUniversityPickers() {
    const initial = firstFill;
    firstFill = false;
    const ids = new Set(UNIVERSITY_LIST.map((university) => university.id));
    PICKERS.forEach((selectId) => {
      const select = document.getElementById(selectId);
      if (!select) return;
      const keep = initial ? '' : select.value;
      [...select.options].filter((option) => ids.has(option.value)).forEach((option) => option.remove());
      const anchor = select.querySelector('option[value="custom"]');
      UNIVERSITY_LIST.filter((university) => !university.hidden).forEach((university) => {
        const option = document.createElement('option');
        option.value = university.id;
        option.textContent = university.label;
        option.dataset.long = university.label;
        select.insertBefore(option, anchor);
      });
      // Keep the current choice when it still exists; otherwise fall back to the first university.
      if (keep && [...select.options].some((option) => option.value === keep && (ids.has(keep) || keep === 'custom' || keep.startsWith('saved-')))) select.value = keep;
      else select.selectedIndex = 0;
    });
    window.coverdraftShortSelects?.collapse(document.getElementById('uniPresetSelect'));
  }

  window.coverdraftFillUniversityPickers = fillUniversityPickers;
  fillUniversityPickers();
})();
