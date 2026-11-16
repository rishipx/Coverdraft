/* Edit dialog for the university picker: rename a university or saved layout and set its default layout.
   Built-in university edits are stored in the browser through core/university-overrides.js. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SAVED_FORMAT = 'saved-format:';
  const modal = $('uniEditModal');
  if (!modal) return;

  const fields = {
    label: $('uniEditLabel'),
    shortName: $('uniEditShortName'),
    name: $('uniEditName'),
    useCurrent: $('uniEditUseCurrent'),
    resetLayout: $('uniEditResetLayout')
  };
  const groups = { shortName: $('uniEditShortGroup'), name: $('uniEditNameGroup'), reset: $('uniEditResetRow'), resetAll: $('uniEditResetAll') };
  const error = $('uniEditError');
  let target = null; // { kind: 'university' | 'saved', id }
  let opener = null;

  const showError = (message) => {
    error.textContent = message || '';
    error.hidden = !message;
  };

  function close() {
    modal.style.display = 'none';
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    target = null;
  }

  function currentLayoutCanBeDefault() {
    return typeof currentPageSizeKey === 'undefined' || currentPageSizeKey === 'a4';
  }

  function openFor(value, returnFocusTo) {
    opener = returnFocusTo || document.activeElement;
    showError('');
    fields.useCurrent.checked = false;
    fields.resetLayout.checked = false;

    const isSaved = value.startsWith(SAVED_FORMAT);
    const canUseCurrent = isSaved || currentLayoutCanBeDefault();
    fields.useCurrent.disabled = !canUseCurrent;
    $('uniEditPaperHint').hidden = canUseCurrent;

    if (isSaved) {
      const option = [...$('uniPresetSelect').options].find((item) => item.value === value);
      if (!option) return;
      target = { kind: 'saved', value };
      $('uniEditTitle').textContent = 'Edit saved layout';
      $('uniEditLabelText').textContent = 'Layout name';
      fields.label.value = option.dataset.long || option.textContent;
      fields.label.maxLength = 60;
      $('uniEditLayoutHelp').textContent = 'Replace the design stored in this layout with the page that is on screen now.';
      $('uniEditUseCurrentText').textContent = 'Replace this layout with the current page';
      Object.values(groups).forEach((el) => { el.hidden = true; });
    } else {
      const info = window.coverdraftUniversities?.info(value);
      if (!info) return;
      target = { kind: 'university', id: info.id };
      $('uniEditTitle').textContent = 'Edit university';
      $('uniEditLabelText').textContent = 'Menu name';
      fields.label.maxLength = window.coverdraftUniversities.limits.label;
      fields.label.value = info.label;
      fields.shortName.value = info.shortName;
      fields.name.value = info.name;
      $('uniEditLayoutHelp').textContent = 'The layout loaded whenever you choose this university. Arrange the cover on the page first, then tick the box below.';
      $('uniEditUseCurrentText').textContent = 'Use the current cover layout as this university’s default';
      groups.shortName.hidden = false;
      groups.name.hidden = false;
      groups.reset.hidden = !info.customLayout;
      groups.resetAll.hidden = !info.edited;
    }
    modal.style.display = 'flex';
    fields.label.focus();
    fields.label.select();
  }

  function layoutFromCurrentPage() {
    const pack = window.coverdraftFormats.buildPack('default');
    const border = pack.border || {};
    return { layout: pack.pages.cover, font: pack.font, border: { enabled: border.show !== false, style: border.style, width: border.width, inset: border.inset, color: border.color } };
  }

  async function save() {
    if (!target) return;
    const label = fields.label.value.trim();
    if (!label) {
      showError(target.kind === 'saved' ? 'Enter a name for this layout.' : 'Enter a menu name.');
      fields.label.focus();
      return;
    }
    try {
      if (target.kind === 'saved') {
        const options = { name: label, useCurrentLayout: fields.useCurrent.checked };
        const saved = await window.coverdraftEditSavedFormat(target.value.slice(SAVED_FORMAT.length), options);
        if (!saved) {
          showError('Could not save this layout.');
          return;
        }
        window.showToast?.(`Saved “${label}”`);
      } else {
        const name = fields.name.value.trim();
        if (!name) {
          showError('Enter the name to print on the cover page.');
          fields.name.focus();
          return;
        }
        const patch = { label, shortName: fields.shortName.value.trim() || label, name };
        if (fields.useCurrent.checked) patch.layout = layoutFromCurrentPage();
        else if (fields.resetLayout.checked) patch.layout = null;
        if (!window.coverdraftUniversities.update(target.id, patch)) {
          showError('Could not save changes in browser storage.');
          return;
        }
        window.showToast?.(`Saved “${label}”. Choose it again to load the new cover details.`);
      }
    } catch (problem) {
      showError(problem.message || 'Could not save these changes.');
      return;
    }
    const done = target;
    close();
    window.coverdraftPresetMenu?.refresh(done);
  }

  async function resetAll() {
    if (!target || target.kind !== 'university') return;
    const confirmed = await window.coverdraftConfirm({ title: 'Restore built-in settings?', message: 'This university’s name and default layout go back to the built-in version.', confirmLabel: 'Restore', skipKey: 'restore-university' });
    if (!confirmed || !target) return;
    window.coverdraftUniversities.reset(target.id);
    window.showToast?.('Restored the built-in university settings');
    const done = target;
    close();
    window.coverdraftPresetMenu?.refresh(done);
  }

  fields.useCurrent.addEventListener('change', () => { if (fields.useCurrent.checked) fields.resetLayout.checked = false; });
  fields.resetLayout.addEventListener('change', () => { if (fields.resetLayout.checked) fields.useCurrent.checked = false; });
  $('uniEditSave').addEventListener('click', save);
  $('uniEditCancel').addEventListener('click', close);
  $('uniEditClose').addEventListener('click', close);
  $('uniEditResetAll').addEventListener('click', resetAll);
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'text') {
      event.preventDefault();
      save();
    }
  });

  window.coverdraftEditUniversity = openFor;
})();
