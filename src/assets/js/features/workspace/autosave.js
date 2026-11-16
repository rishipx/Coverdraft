/* Local autosave of the working document, its rolling backup, and the "Saved" status indicator. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { get: safeGet } = window.coverdraftStorage;
  const STORAGE_KEY = 'coverdraft_document_v1';
  const BACKUP_KEY = 'coverdraft_document_backup_v1';
  let lastBackupAt = 0;
  window.updateSaveStatus = function (state, savedAt) {
    const root = $('saveStatus'), text = $('saveStatusText');
    if (!root || !text)
      return;
    root.dataset.state = state || 'saved';
    if (state === 'saving')
      text.textContent = 'Saving…';
    else if (state === 'idle')
      text.textContent = 'Ready to save';
    else if (state === 'error')
      text.textContent = 'Save failed';
    else if (state === 'warning')
      text.textContent = 'Saved without backup';
    else if (savedAt) {
      const date = new Date(savedAt);
      text.textContent = Number.isNaN(date.getTime()) ? 'Saved on this device' : `Saved ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else
      text.textContent = 'Saved on this device';
  };
  function readDesignSettings() {
    return {
      fontFamily: $('f_fontFamily')?.value || "'Times New Roman', Times, serif",
      fontScale: Number($('f_fontScale')?.value || 100),
      lineSpacing: Number($('f_lineSpacing')?.value || 135),
      showBorder: $('f_showBorder') ? $('f_showBorder').checked : true,
      borderStyle: $('f_borderStyle')?.value || 'solid',
      borderWidth: Number($('f_borderWidth')?.value || 2),
      borderInset: Number($('f_borderInset')?.value || 28),
      borderColor: $('f_borderColor')?.value || '#111111'
    };
  }
  function buildSavePayload() {
    if (typeof documentPages !== 'undefined' && typeof currentPageKey !== 'undefined' && typeof canvasElements !== 'undefined') {
      documentPages[currentPageKey] = canvasElements;
    }
    // The payload is serialised immediately, so there is no need to deep-clone it first
    // (cloning copied every preserved page image once more on each autosave).
    return {
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      documentPages,
      currentPageKey,
      currentFormData,
      experimentsList,
      currentUniKey,
      activeTemplateId,
      userUploadedLogo: typeof userUploadedLogo === 'string' ? userUploadedLogo : null,
      design: readDesignSettings()
    };
  }
  window.saveDocumentToLocalStorage = function () {
    try {
      const payload = buildSavePayload();
      const encoded = JSON.stringify(payload);
      const previous = localStorage.getItem(STORAGE_KEY);
      let previousPayload = null;
      try {
        previousPayload = previous ? JSON.parse(previous) : null;
      } catch (_) { }
      const comparable = (value) => {
        if (!value || typeof value !== 'object')
          return '';
        const copy = { ...value };
        delete copy.savedAt;
        return JSON.stringify(copy);
      };
      // Saving an unchanged state should not stringify/write the same large document
      // repeatedly just to update its timestamp.
      if (previousPayload && comparable(previousPayload) === comparable(payload)) {
        window.updateSaveStatus('saved', previousPayload.savedAt || payload.savedAt);
        return true;
      }
      let backupSaved = true;
      const now = Date.now();
      const shouldBackUp = previous && previous.length < 3200000 && (!lastBackupAt || now - lastBackupAt >= 15000);
      // Preserve the last known-good document, but don't synchronously rewrite a large
      // backup on every keystroke. If storage is tight, prioritise the latest draft.
      if (shouldBackUp) {
        try {
          localStorage.setItem(BACKUP_KEY, previous);
          lastBackupAt = now;
        } catch (_) {
          backupSaved = false;
          try {
            localStorage.removeItem(BACKUP_KEY);
          } catch (_) { }
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, encoded);
      } catch (firstError) {
        try {
          localStorage.removeItem(BACKUP_KEY);
          localStorage.setItem(STORAGE_KEY, encoded);
          backupSaved = false;
        } catch (secondError) {
          console.warn('Coverdraft local save failed:', secondError || firstError);
          window.updateSaveStatus('error');
          return false;
        }
      }
      window.updateSaveStatus(backupSaved ? 'saved' : 'warning', payload.savedAt);
      return true;
    } catch (error) {
      console.warn('Coverdraft local save failed:', error);
      window.updateSaveStatus('error');
      return false;
    }
  };
  window.scheduleAutoCompile = function () {
    window.updateSaveStatus('saving');
    clearTimeout(autoCompileTimer);
    autoCompileTimer = setTimeout(() => window.saveDocumentToLocalStorage(), 450);
  };
  window.addEventListener('pagehide', () => {
    clearTimeout(autoCompileTimer);
    window.saveDocumentToLocalStorage();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(autoCompileTimer);
      window.saveDocumentToLocalStorage();
    }
  });
  window.addEventListener('load', () => {
    const state = safeGet(STORAGE_KEY, null);
    window.updateSaveStatus(state ? 'saved' : 'idle', state?.savedAt);
  });
})();
