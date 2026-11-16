/* Confirmation dialog with an optional "Don't show this again" checkbox (a native confirm() cannot have one).
 *
 *   const ok = await coverdraftConfirm({ title, message, confirmLabel, danger, skipKey });
 *
 * With a skipKey, ticking the checkbox and confirming remembers the choice in localStorage and later calls
 * resolve true without showing the dialog. Closing the dialog any other way (Cancel, Escape, backdrop)
 * resolves false and never stores the choice. Clearing the site's data brings every prompt back.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'coverdraft_hidden_prompts_v1';
  const modal = document.getElementById('confirmModal');
  if (!modal) return;
  const $ = (id) => document.getElementById(id);
  const parts = { title: $('confirmTitle'), message: $('confirmMessage'), skipRow: $('confirmSkipRow'), skip: $('confirmSkip'), ok: $('confirmOk'), cancel: $('confirmCancel') };
  let pending = null;

  function readHidden() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  function writeHidden(list) {
    try {
      if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* storage blocked: the prompt simply keeps appearing */ }
  }

  function settle(result) {
    if (!pending) return;
    const { resolve, skipKey } = pending;
    pending = null;
    if (result && skipKey && parts.skip.checked) {
      const hidden = readHidden();
      if (!hidden.includes(skipKey)) writeHidden([...hidden, skipKey]);
    }
    modal.style.display = 'none';
    resolve(result);
  }

  function coverdraftConfirm({ title, message, confirmLabel = 'Confirm', danger = false, skipKey = '' }) {
    if (skipKey && readHidden().includes(skipKey)) return Promise.resolve(true);
    if (pending) settle(false);
    return new Promise((resolve) => {
      pending = { resolve, skipKey };
      parts.title.textContent = title;
      parts.message.textContent = message;
      parts.ok.textContent = confirmLabel;
      parts.ok.classList.toggle('btn-danger', danger);
      parts.ok.classList.toggle('btn-cyan', !danger);
      parts.skip.checked = false;
      parts.skipRow.hidden = !skipKey;
      modal.style.display = 'flex';
      parts.ok.focus();
    });
  }

  parts.ok.addEventListener('click', () => settle(true));
  parts.cancel.addEventListener('click', () => settle(false));
  // Escape, the backdrop and other generic dialog dismissals hide the overlay directly; treat that as "cancel".
  new MutationObserver(() => {
    if (pending && modal.style.display === 'none') settle(false);
  }).observe(modal, { attributes: true, attributeFilter: ['style'] });

  window.coverdraftConfirm = coverdraftConfirm;
})();
