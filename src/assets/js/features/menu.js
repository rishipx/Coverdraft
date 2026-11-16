(function () {
  'use strict';
  const moreButton = document.getElementById('moreMenuBtn');
  const moreMenu = document.getElementById('moreMenu');
  const downloadToggle = document.getElementById('downloadOptionsBtn');
  const downloadMenu = document.getElementById('downloadOptionsMenu');
  const setMoreOpen = (open) => {
    if (!moreMenu || !moreButton)
      return;
    moreMenu.classList.toggle('open', open);
    moreButton.setAttribute('aria-expanded', String(open));
  };
  const setDownloadOpen = (open, focusEdge = false) => {
    if (!downloadMenu || !downloadToggle)
      return;
    downloadMenu.hidden = !open;
    downloadToggle.setAttribute('aria-expanded', String(open));
    if (open && focusEdge) {
      downloadMenu.querySelector('.download-option:not(:disabled)')?.focus();
    }
  };
  moreButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    setDownloadOpen(false);
    setMoreOpen(!moreMenu?.classList.contains('open'));
  });
  downloadToggle?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMoreOpen(false);
    setDownloadOpen(downloadMenu?.hidden !== false);
  });
  downloadToggle?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setMoreOpen(false);
      setDownloadOpen(true, true);
      if (event.key === 'ArrowUp') {
        const items = [...(downloadMenu?.querySelectorAll('.download-option:not(:disabled)') || [])];
        items.at(-1)?.focus();
      }
    }
  });
  downloadMenu?.addEventListener('keydown', (event) => {
    const items = [...downloadMenu.querySelectorAll('.download-option:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setDownloadOpen(false);
      downloadToggle?.focus({ preventScroll: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length)
        return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + direction + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' && items.length) {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End' && items.length) {
      event.preventDefault();
      items[items.length - 1].focus();
    }
  });
  downloadMenu?.addEventListener('click', (event) => {
    if (event.target.closest('.download-option'))
      setDownloadOpen(false);
  });
  moreMenu?.addEventListener('click', (event) => {
    if (event.target.closest('.menu-item, [data-close-menu]'))
      setMoreOpen(false);
  });
  moreMenu?.addEventListener('change', (event) => {
    if (event.target.closest('[data-close-menu-on-change]'))
      setMoreOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!moreMenu?.contains(event.target) && !moreButton?.contains(event.target))
      setMoreOpen(false);
    if (!downloadMenu?.contains(event.target) && !downloadToggle?.contains(event.target))
      setDownloadOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape')
      return;
    if (downloadMenu?.hidden === false) {
      setDownloadOpen(false);
      downloadToggle?.focus({ preventScroll: true });
      return;
    }
    if (moreMenu?.classList.contains('open')) {
      setMoreOpen(false);
      moreButton?.focus({ preventScroll: true });
    }
  });
})();
