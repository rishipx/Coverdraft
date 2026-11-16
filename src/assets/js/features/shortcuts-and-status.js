/* Keyboard shortcuts, the shortcut help dialog, Escape handling, and the offline-readiness indicator. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const help = $('shortcutHelp');
  let returnFocus = null;
  let lastOfflineCheck = 0;

  function openHelp() {
    if (!help)
      return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    help.hidden = false;
    $('shortcutHelpClose')?.focus();
  }

  function closeHelp() {
    if (help)
      help.hidden = true;
    if (returnFocus?.isConnected)
      returnFocus.focus({ preventScroll: true });
  }

  $('openShortcutHelpBtn')?.addEventListener('click', openHelp);
  help?.addEventListener('pointerdown', (event) => {
    if (event.target === help)
      closeHelp();
  });
  $('shortcutHelpClose')?.addEventListener('click', closeHelp);

  function closeOpenSurfaces() {
    let closed = false;
    if (help && !help.hidden) {
      closeHelp();
      closed = true;
    }
    document.querySelectorAll('.modal-overlay').forEach((el) => {
      if (getComputedStyle(el).display !== 'none') {
        el.style.display = 'none';
        closed = true;
      }
    });
    const quickStart = $('studentQuickStart');
    if (quickStart?.classList.contains('open')) {
      quickStart.classList.remove('open');
      closed = true;
    }
    document.querySelectorAll('.menu-panel.open').forEach((el) => {
      el.classList.remove('open');
      closed = true;
    });
    const downloadMenu = $('downloadOptionsMenu');
    if (downloadMenu && !downloadMenu.hidden) {
      downloadMenu.hidden = true;
      closed = true;
    }
    document.querySelectorAll('[aria-expanded="true"]').forEach((el) => {
      if (el.matches('#moreMenuBtn,#downloadOptionsBtn'))
        el.setAttribute('aria-expanded', 'false');
    });
    return closed;
  }

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable || !!target.closest('[contenteditable="true"]'));
    if (event.key === 'Escape') {
      if (closeOpenSurfaces()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!mod && !event.altKey && !typing && (event.key === '?' || (event.shiftKey && key === '/'))) {
      event.preventDefault();
      openHelp();
      return;
    }
    if (!mod && !typing && key === '/') {
      event.preventDefault();
      const switcher = $('batchModal');
      if (switcher && getComputedStyle(switcher).display !== 'none')
        $('batchSubjectSearch')?.focus();
      else if (typeof window.openCourseSwitcher === 'function')
        window.openCourseSwitcher();
    }
  }, true);

  // Make the offline indicator evidence-based: report the cached PDF libraries separately from local editing.
  const CDN = ['html2canvas', 'jspdf', 'pdf-lib'].map((name) => CDN_LIBRARIES[name].url);
  async function updateOfflineStatus(force = false) {
    const el = $('offlineStatus'), text = $('offlineStatusText');
    if (!el || !text)
      return;
    const now = Date.now();
    if (!force && now - lastOfflineCheck < 4000)
      return;
    lastOfflineCheck = now;
    const online = navigator.onLine;
    let librariesCached = false;
    try {
      librariesCached = (await Promise.all(CDN.map(url => caches.match(url)))).every(Boolean);
    } catch (_) { }
    const controlled = !!navigator.serviceWorker?.controller;
    el.dataset.state = !online ? (librariesCached ? 'offline-ready' : 'offline-limited') : (librariesCached ? 'cached' : 'online');
    el.title = !online
      ? (librariesCached ? 'Offline mode: editing, local drafts, and PDF export libraries are cached.' : 'Offline mode: local editing and drafts work; PDF export may need the PDF libraries to be cached first.')
      : (librariesCached ? 'PDF libraries are cached for offline use.' : controlled ? 'Offline shell is installed; PDF libraries are being cached when available.' : 'Connect once and keep this app installed/loaded to prepare offline support.');
    text.textContent = !online ? (librariesCached ? 'Offline ready' : 'Offline · limited') : (librariesCached ? 'Offline ready' : controlled ? 'Offline cache' : 'Online');
    el.setAttribute('aria-label', el.title);
  }
  window.addEventListener('online', () => updateOfflineStatus(true));
  window.addEventListener('offline', () => updateOfflineStatus(true));
  navigator.serviceWorker?.addEventListener('controllerchange', () => updateOfflineStatus(true));
  navigator.serviceWorker?.ready?.then(() => updateOfflineStatus(true)).catch(() => { });
  window.addEventListener('load', () => {
    updateOfflineStatus(true);
    setTimeout(() => updateOfflineStatus(true), 1800);
    setTimeout(() => updateOfflineStatus(true), 8500);
  });
  updateOfflineStatus(true);
})();
