/* Coverdraft accessibility: shared dialog behavior, persistent theme, and keyboard support. */
(() => {
  'use strict';
  const THEME_KEY = 'coverdraft_theme_v1';
  const themeToggle = document.getElementById('themeToggleBtn');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  let dialogTitleCounter = 0;
  function applyTheme(theme, persist = true) {
    const next = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = next;
    root.style.colorScheme = next;
    if (themeMeta)
      themeMeta.setAttribute('content', next === 'light' ? '#ffffff' : '#000000');
    if (themeToggle) {
      // The menu item names the theme you would switch to.
      const target = next === 'light' ? 'Dark' : 'Light';
      const label = themeToggle.querySelector('.theme-toggle-label');
      if (label)
        label.textContent = `${target} theme`;
      themeToggle.setAttribute('aria-label', `${target} theme`);
      const description = themeToggle.querySelector('small');
      if (description)
        description.textContent = `Use the ${target.toLowerCase()} workspace`;
    }
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (_) { /* Theme still applies for this session. */ }
    }
  }
  let savedTheme = 'dark';
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark')
      savedTheme = storedTheme;
  } catch (_) { }
  applyTheme(savedTheme, false);
  themeToggle?.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
  });
  const dialogSelector = '.modal-overlay, #studentQuickStart, #shortcutHelp .shortcut-card';
  const openDialogs = new Set();
  const openOrder = new WeakMap();
  const returnTargets = new WeakMap();
  let orderCounter = 0;
  let lastInteractionTarget = null;
  let lastInteractionAt = 0;
  function getSurface(dialog) {
    if (dialog.matches('.modal-overlay, #studentQuickStart, #shortcutHelp'))
      return dialog;
    return dialog.closest('#shortcutHelp') || dialog;
  }
  function isVisible(element) {
    if (!(element instanceof Element) || !element.isConnected)
      return false;
    if (element.closest('[hidden], [inert]'))
      return false;
    for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')
        return false;
    }
    return element.getClientRects().length > 0;
  }
  function dialogIsOpen(dialog) {
    if (dialog.matches('#studentQuickStart'))
      return dialog.classList.contains('open') && isVisible(dialog);
    if (dialog.matches('.modal-overlay'))
      return isVisible(dialog);
    if (dialog.matches('.shortcut-card'))
      return isVisible(dialog) && !dialog.closest('.shortcut-overlay')?.hidden;
    return false;
  }
  function getOpenDialogs() {
    return [...document.querySelectorAll(dialogSelector)].filter(dialogIsOpen);
  }
  function getFocusables(dialog) {
    const selector = [
      'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(',');
    return [...dialog.querySelectorAll(selector)].filter((element) => {
      if (element.getAttribute('aria-hidden') === 'true')
        return false;
      if (element.closest('[hidden], [inert], [disabled]'))
        return false;
      return isVisible(element);
    });
  }
  function safeFocus(element) {
    if (!element?.isConnected || element.matches(':disabled') || !isVisible(element))
      return false;
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      element.focus();
    }
    return document.activeElement === element;
  }
  function focusDialog(dialog) {
    if (!dialog || !dialogIsOpen(dialog))
      return;
    if (dialog.contains(document.activeElement))
      return;
    const preferred = dialog.querySelector('[data-dialog-initial-focus], [autofocus]');
    const focusables = getFocusables(dialog);
    if (preferred && isVisible(preferred) && !preferred.matches(':disabled')) {
      safeFocus(preferred);
    } else if (focusables.length) {
      safeFocus(focusables[0]);
    } else {
      if (!dialog.hasAttribute('tabindex'))
        dialog.setAttribute('tabindex', '-1');
      safeFocus(dialog);
    }
  }
  function getTopDialog() {
    const dialogs = getOpenDialogs();
    return dialogs.sort((a, b) => (openOrder.get(a) || 0) - (openOrder.get(b) || 0)).at(-1) || null;
  }
  function setAttributeIfChanged(element, name, value) {
    if (element && element.getAttribute(name) !== String(value))
      element.setAttribute(name, String(value));
  }
  function identifyDialogs() {
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      setAttributeIfChanged(overlay, 'role', 'dialog');
      setAttributeIfChanged(overlay, 'aria-modal', 'true');
      const heading = overlay.querySelector('.modal-card h1, .modal-card h2, .modal-card h3, .modal-card h4');
      if (heading) {
        if (!heading.id)
          heading.id = `dialog-title-${overlay.id || ++dialogTitleCounter}`;
        setAttributeIfChanged(overlay, 'aria-labelledby', heading.id);
      } else if (!overlay.hasAttribute('aria-label')) {
        overlay.setAttribute('aria-label', 'Dialog');
      }
    });
    const qs = $('studentQuickStart');
    if (qs) {
      setAttributeIfChanged(qs, 'role', 'dialog');
      setAttributeIfChanged(qs, 'aria-modal', 'true');
    }
    const help = $('shortcutHelp');
    setAttributeIfChanged(help, 'aria-hidden', String(help?.hidden ?? true));
  }
  function usableReturnTarget(target, remainingTop) {
    if (!target?.isConnected || target.matches(':disabled') || !isVisible(target))
      return false;
    if (remainingTop && !remainingTop.contains(target))
      return false;
    return true;
  }
  function restoreFocus(dialog) {
    const target = returnTargets.get(dialog);
    requestAnimationFrame(() => {
      const top = getTopDialog();
      if (usableReturnTarget(target, top))
        safeFocus(target);
      else if (top)
        focusDialog(top);
    });
  }
  function syncDialogs() {
    identifyDialogs();
    const current = new Set(getOpenDialogs());
    document.querySelectorAll('.modal-overlay, #studentQuickStart, #shortcutHelp').forEach((surface) => {
      const open = current.has(surface) || [...current].some((dialog) => surface.contains(dialog));
      setAttributeIfChanged(surface, 'aria-hidden', String(!open));
    });
    for (const dialog of current) {
      if (openDialogs.has(dialog))
        continue;
      openDialogs.add(dialog);
      openOrder.set(dialog, ++orderCounter);
      const active = document.activeElement;
      // Prefer the currently focused opener (especially for keyboard activation); use
      // the recent pointer target only when browsers do not focus a clicked button.
      let opener = active instanceof HTMLElement && isVisible(active) && !dialog.contains(active) ? active : null;
      const interactionFresh = lastInteractionTarget?.isConnected && Date.now() - lastInteractionAt < 1600;
      if (!opener && interactionFresh)
        opener = lastInteractionTarget;
      if (opener && dialog.contains(opener))
        opener = null;
      if (opener instanceof HTMLElement && !isVisible(opener)) {
        const previousDialog = opener.closest(dialogSelector);
        opener = previousDialog ? returnTargets.get(previousDialog) : null;
      }
      returnTargets.set(dialog, opener instanceof HTMLElement ? opener : null);
      if (!dialog.contains(document.activeElement))
        requestAnimationFrame(() => focusDialog(dialog));
    }
    for (const dialog of [...openDialogs]) {
      if (current.has(dialog))
        continue;
      openDialogs.delete(dialog);
      restoreFocus(dialog);
    }
    const top = getTopDialog();
    if (top && !top.contains(document.activeElement))
      requestAnimationFrame(() => focusDialog(top));
  }
  function closeDialog(dialog) {
    if (!dialog)
      return false;
    const surface = getSurface(dialog);
    const id = surface.id || dialog.id;
    const clickFirst = (...ids) => {
      for (const candidateId of ids) {
        const button = $(candidateId);
        if (button && !button.disabled && isVisible(button)) {
          button.click();
          return true;
        }
      }
      return false;
    };
    if (id === 'studentQuickStart') {
      if (!clickFirst('qsClose'))
        surface.classList.remove('open');
    } else if (id === 'semesterPrepModal') {
      if (!clickFirst('closeSemesterPrep'))
        surface.style.display = 'none';
    } else if (id === 'mergerModal') {
      if (!clickFirst('cancelMergerBtn', 'closeMergerModal'))
        surface.style.display = 'none';
    } else if (id === 'batchModal') {
      if (!clickFirst('closeBatchModal', 'closeBatchModalDone'))
        surface.style.display = 'none';
    } else if (id === 'pdfPreviewModal') {
      if (!clickFirst('closePdfPreviewBtn'))
        surface.style.display = 'none';
    } else if (id === 'checkModal') {
      if (!clickFirst('checkFix'))
        surface.style.display = 'none';
    } else if (id === 'welcomeModal') {
      surface.style.display = 'none';
    } else if (id === 'shortcutHelp') {
      $('shortcutHelp').hidden = true;
      $('shortcutHelp').setAttribute('aria-hidden', 'true');
    } else {
      if (surface.matches('.modal-overlay'))
        surface.style.display = 'none';
      else if (surface.matches('#studentQuickStart'))
        surface.classList.remove('open');
      else
        return false;
    }
    restoreFocus(dialog);
    return true;
  }
  function closeTransientMenus() {
    let closed = false;
    const downloadMenu = $('downloadOptionsMenu');
    if (downloadMenu && !downloadMenu.hidden) {
      downloadMenu.hidden = true;
      $('downloadOptionsBtn')?.setAttribute('aria-expanded', 'false');
      closed = true;
    }
    document.querySelectorAll('.menu-panel.open').forEach((menu) => {
      menu.classList.remove('open');
      const parent = menu.parentElement?.querySelector('[aria-expanded="true"]');
      parent?.setAttribute('aria-expanded', 'false');
      if (menu.id === 'moreMenu')
        $('moreMenuBtn')?.focus({ preventScroll: true });
      closed = true;
    });
    return closed;
  }
  // Track activation targets before handlers mutate dialog visibility.
  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button, a[href], input, select, textarea, [role="button"]') : null;
    if (target) {
      lastInteractionTarget = target;
      lastInteractionAt = Date.now();
    }
  }, true);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button, a[href], input, select, textarea, [role="button"]') : null;
    if (target) {
      lastInteractionTarget = target;
      lastInteractionAt = Date.now();
    }
  }, true);
  // Uniform backdrop dismissal for non-destructive dialogs.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element))
      return;
    const backdrop = target.matches('.modal-overlay, #studentQuickStart, .shortcut-overlay') ? target : null;
    if (!backdrop || !isVisible(backdrop))
      return;
    if (backdrop.matches('.shortcut-overlay')) {
      $('shortcutHelp').hidden = true;
      $('shortcutHelp').setAttribute('aria-hidden', 'true');
      restoreFocus($('shortcutHelp').querySelector('.shortcut-card'));
    } else {
      const dialog = backdrop.matches('.modal-overlay') ? backdrop : backdrop;
      closeDialog(dialog);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('keydown', (event) => {
    const activeElement = document.activeElement;
    if (!getTopDialog() && ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' || event.key === '?' || (event.shiftKey && event.key === '/'))) {
      lastInteractionTarget = activeElement instanceof HTMLElement ? activeElement : null;
      lastInteractionAt = Date.now();
    }
    const top = getTopDialog();
    if (!top) {
      if (event.key === 'Escape')
        closeTransientMenus();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDialog(top);
      return;
    }
    if (event.key !== 'Tab')
      return;
    const focusables = getFocusables(top);
    if (!focusables.length) {
      event.preventDefault();
      if (!top.hasAttribute('tabindex'))
        top.setAttribute('tabindex', '-1');
      safeFocus(top);
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && (document.activeElement === first || !top.contains(document.activeElement))) {
      event.preventDefault();
      safeFocus(last);
    } else if (!event.shiftKey && (document.activeElement === last || !top.contains(document.activeElement))) {
      event.preventDefault();
      safeFocus(first);
    }
  }, true);
  document.addEventListener('focusin', () => {
    const top = getTopDialog();
    if (!top)
      return;
    if (!top.contains(document.activeElement))
      requestAnimationFrame(() => {
        const currentTop = getTopDialog();
        if (currentTop && !currentTop.contains(document.activeElement))
          focusDialog(currentTop);
      });
  });
  const observer = new MutationObserver(syncDialogs);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden']
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', syncDialogs, { once: true });
  else
    syncDialogs();
  window.addEventListener('pageshow', syncDialogs);
})();
