/* Keeps the attached assignment PDF privately on this device in IndexedDB, so large files do not use localStorage quota. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ATTACHMENT_DB = 'coverdraft_local_files_v1';
  const ATTACHMENT_STORE = 'attachments';
  let attachmentGeneration = 0;
  function openAttachmentDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window))
        return reject(new Error('IndexedDB is unavailable'));
      const request = indexedDB.open(ATTACHMENT_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE))
          request.result.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local attachment storage'));
    });
  }
  async function getSavedAttachment() {
    const db = await openAttachmentDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(ATTACHMENT_STORE, 'readonly').objectStore(ATTACHMENT_STORE).get('active-assignment');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Could not read saved attachment'));
      });
    } finally {
      db.close();
    }
  }
  window.noteAttachmentSelection = () => ++attachmentGeneration;
  window.isCurrentAttachmentSelection = (token) => token === attachmentGeneration;
  window.persistAttachedPdf = async (fileName, arrayBuffer, size) => {
    const generation = ++attachmentGeneration;
    let db;
    try {
      db = await openAttachmentDb();
      if (generation !== attachmentGeneration)
        return false;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(ATTACHMENT_STORE, 'readwrite');
        tx.objectStore(ATTACHMENT_STORE).put({ id: 'active-assignment', fileName: String(fileName || 'assignment.pdf').slice(0, 180), size: Number(size) || arrayBuffer.byteLength || 0, data: new Blob([arrayBuffer], { type: 'application/pdf' }), savedAt: new Date().toISOString() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not store attachment'));
        tx.onabort = () => reject(tx.error || new Error('Attachment storage was interrupted'));
      });
      if (generation === attachmentGeneration && $('attachedPdfStatus'))
        $('attachedPdfStatus').textContent = 'Saved locally. Ready for front-page injection.';
    } catch (error) {
      console.warn('Could not persist assignment PDF:', error);
      if (generation === attachmentGeneration && $('attachedPdfStatus'))
        $('attachedPdfStatus').textContent = 'Attached for this session; browser storage did not keep a copy.';
    } finally {
      if (db)
        db.close();
    }
  };
  window.clearAttachedPdf = async () => {
    attachmentGeneration++;
    uploadedAssignmentPdf = null;
    uploadedAssignmentFileName = '';
    if ($('assignmentPdfInput'))
      $('assignmentPdfInput').value = '';
    if ($('attachedPdfMeta'))
      $('attachedPdfMeta').style.display = 'none';
    $('pdfDropZone')?.classList.remove('has-file');
    let db = null, storageCleared = true;
    try {
      db = await openAttachmentDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(ATTACHMENT_STORE, 'readwrite');
        tx.objectStore(ATTACHMENT_STORE).delete('active-assignment');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not remove the saved attachment'));
        tx.onabort = () => reject(tx.error || new Error('Attachment removal was interrupted'));
      });
    } catch (error) {
      storageCleared = false;
      console.warn('Could not remove saved attachment:', error);
    } finally {
      if (db)
        db.close();
    }
    showToast(storageCleared ? 'Attached PDF removed' : 'Removed for this session, but the saved copy could not be cleared.', !storageCleared);
    return storageCleared;
  };
  $('clearAttachedPdfBtn')?.addEventListener('click', window.clearAttachedPdf);
  async function restoreAttachedPdf() {
    const generation = attachmentGeneration;
    try {
      const record = await getSavedAttachment();
      if (!record || generation !== attachmentGeneration || !record.data)
        return;
      const data = record.data instanceof Blob ? await record.data.arrayBuffer() : record.data;
      if (generation !== attachmentGeneration)
        return;
      if (!(data instanceof ArrayBuffer) || data.byteLength > 40 * 1024 * 1024 || new TextDecoder().decode(new Uint8Array(data, 0, Math.min(5, data.byteLength))) !== '%PDF-') {
        if ($('attachedPdfStatus'))
          $('attachedPdfStatus').textContent = 'The saved attachment is invalid. Attach a valid PDF again.';
        return;
      }
      uploadedAssignmentPdf = data;
      uploadedAssignmentFileName = record.fileName || 'assignment.pdf';
      $('pdfDropZone')?.classList.add('has-file');
      if ($('attachedPdfMeta'))
        $('attachedPdfMeta').style.display = 'block';
      if ($('attachedPdfName'))
        $('attachedPdfName').innerHTML = `${lucideSvg('check', 14)} ${escHtml(uploadedAssignmentFileName)} (${Math.round((record.size || data.byteLength || 0) / 1024)} KB)`;
      if ($('attachedPdfStatus'))
        $('attachedPdfStatus').textContent = 'Restored from this device. Ready for front-page injection.';
    } catch (error) {
      console.warn('Could not restore assignment PDF:', error);
    }
  }
  window.addEventListener('load', () => restoreAttachedPdf());
})();
