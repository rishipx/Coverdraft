/* University and saved-layout picker.
   A native <select> popup cannot show per-item buttons or footer actions, so the popup is replaced by a listbox:
   - every university and saved layout shows an edit button on hover (always visible on touch screens);
   - universities and saved layouts show a delete button;
   - the footer holds "Save current layout…", "Open a Word file…" and, when a built-in university has been
     deleted, "Restore deleted universities".
   The <select> stays the source of truth (value, change events, short labels). */
(function () {
  'use strict';

  const select = document.getElementById('uniPresetSelect');
  if (!select) return;
  const SAVED_FORMAT = 'saved-format:';
  const isSaved = (value) => value.startsWith(SAVED_FORMAT);
  const CUSTOM = 'custom';

  const popover = document.createElement('div');
  popover.id = 'uniPresetPopover';
  popover.className = 'preset-popover';
  popover.hidden = true;

  const menu = document.createElement('div');
  menu.id = 'uniPresetMenu';
  menu.className = 'preset-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'University format and saved layouts');
  menu.tabIndex = -1;

  const footer = document.createElement('div');
  footer.className = 'preset-footer';
  const footerAction = (id, icon, label, handler) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'preset-action';
    button.innerHTML = `${lucideSvg(icon, 15)}<span>${label}</span>`;
    button.addEventListener('click', () => {
      close(false);
      handler();
    });
    return button;
  };
  footer.append(
    footerAction('presetSaveTemplate', 'save', 'Save current layout…', () => window.coverdraftSaveLayout?.()),
    footerAction('presetOpenWordFile', 'file-text', 'Open a Word file…', () => window.coverdraftOpenWordImport?.()),
    footerAction('presetRestoreUniversities', 'rotate-ccw', 'Restore deleted universities', () => {
      if (window.coverdraftUniversities?.restoreAll()) window.showToast?.('Restored the deleted universities');
    })
  );
  const restoreAction = footer.querySelector('#presetRestoreUniversities');
  popover.append(menu, footer);
  document.body.appendChild(popover);

  let activeIndex = 0;
  const items = () => [...menu.querySelectorAll('.preset-item')];
  const isOpen = () => !popover.hidden;

  function setActive(index, scroll = true) {
    const list = items();
    if (!list.length) return;
    activeIndex = Math.max(0, Math.min(index, list.length - 1));
    list.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
    menu.setAttribute('aria-activedescendant', list[activeIndex].id);
    if (scroll) list[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function itemButton(className, icon, title, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preset-btn ${className}`;
    button.tabIndex = -1;
    button.title = title;
    button.setAttribute('aria-label', `${title} ${label}`);
    button.innerHTML = lucideSvg(icon, 14);
    return button;
  }

  function build() {
    menu.replaceChildren();
    let n = 0;
    const addItem = (option) => {
      const el = document.createElement('div');
      el.className = 'preset-item';
      el.id = `presetItem${n++}`;
      el.dataset.value = option.value;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
      const label = document.createElement('span');
      label.className = 'preset-label';
      label.textContent = option.dataset.long || option.textContent;
      el.appendChild(label);
      if (option.value !== CUSTOM) {
        const what = isSaved(option.value) ? 'saved layout' : 'university';
        el.appendChild(itemButton('preset-edit', 'pencil', `Edit ${what}`, label.textContent));
        el.appendChild(itemButton('preset-del', 'trash-2', `Delete ${what}`, label.textContent));
      }
      menu.appendChild(el);
    };
    [...select.children].forEach((node) => {
      if (node.tagName === 'OPTION') {
        addItem(node);
      } else if (node.tagName === 'OPTGROUP' && !node.hidden && node.children.length) {
        const heading = document.createElement('div');
        heading.className = 'preset-group';
        heading.setAttribute('role', 'presentation');
        heading.textContent = node.label;
        menu.appendChild(heading);
        [...node.children].forEach(addItem);
      }
    });
    const current = items().findIndex((el) => el.dataset.value === select.value);
    setActive(current < 0 ? 0 : current, false);
    restoreAction.hidden = !(window.coverdraftUniversities?.hiddenIds().length);
  }

  function place() {
    const r = select.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 360), window.innerWidth - 16);
    popover.style.width = `${width}px`;
    popover.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
    popover.style.top = `${r.bottom + 6}px`;
    popover.style.maxHeight = `${Math.max(220, window.innerHeight - r.bottom - 18)}px`;
  }

  function open() {
    build();
    popover.hidden = false;
    place();
    select.setAttribute('aria-expanded', 'true');
    menu.focus({ preventScroll: true });
    setActive(activeIndex);
  }

  function close(returnFocus = true) {
    if (!isOpen()) return;
    popover.hidden = true;
    select.setAttribute('aria-expanded', 'false');
    window.coverdraftShortSelects?.collapse(select);
    if (returnFocus) select.focus({ preventScroll: true });
  }

  function choose(value) {
    close();
    if (value !== select.value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function edit(el) {
    const value = el.dataset.value;
    if (value === CUSTOM) return;
    close(false);
    window.coverdraftEditUniversity?.(value, select);
  }

  async function remove(el) {
    const value = el.dataset.value;
    const name = el.querySelector('.preset-label')?.textContent || 'this item';
    const isUniversity = !isSaved(value);
    const confirmed = await window.coverdraftConfirm(isUniversity
      ? { title: 'Delete university?', message: `“${name}” will be removed from the university lists. Use “Restore deleted universities” in this menu to bring it back.`, confirmLabel: 'Delete', danger: true, skipKey: 'delete-university' }
      : { title: 'Delete saved layout?', message: `“${name}” will be deleted. This cannot be undone.`, confirmLabel: 'Delete', danger: true, skipKey: 'delete-saved-layout' });
    if (!confirmed) return;
    const wasSelected = select.value === value;
    let deleted;
    if (isUniversity) {
      deleted = window.coverdraftUniversities?.remove(value);
      if (!deleted) {
        window.showToast?.('Keep at least one university in the list.', false);
        return;
      }
    } else {
      deleted = await window.coverdraftDeleteSavedFormat?.(value.slice(SAVED_FORMAT.length));
    }
    if (!deleted) return;
    if (wasSelected) select.value = CUSTOM; // the design stays on the canvas; it is just no longer tied to the deleted item
    window.coverdraftShortSelects?.collapse(select);
    const keep = Math.max(0, activeIndex - 1);
    build();
    setActive(keep, false);
    if (isOpen()) place();
    window.showToast?.(`Deleted “${name}”`);
  }

  // Called by the edit dialog after a save so the list (if reopened) and the closed picker show fresh names.
  window.coverdraftPresetMenu = {
    refresh() {
      window.coverdraftShortSelects?.collapse(select);
    }
  };

  // Open instead of the native popup (capture + stopImmediatePropagation also keeps short-selects from expanding it).
  select.setAttribute('aria-haspopup', 'listbox');
  select.setAttribute('aria-expanded', 'false');
  select.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isOpen()) {
      close();
    } else {
      select.focus({ preventScroll: true });
      open();
    }
  }, true);
  select.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter' || (e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    }
  }, true);

  menu.addEventListener('mousemove', (e) => {
    const el = e.target.closest('.preset-item');
    if (el) {
      const i = items().indexOf(el);
      if (i !== activeIndex) setActive(i, false);
    }
  });
  menu.addEventListener('click', (e) => {
    const el = e.target.closest('.preset-item');
    if (!el) return;
    if (e.target.closest('.preset-edit')) {
      e.stopPropagation();
      edit(el);
    } else if (e.target.closest('.preset-del')) {
      e.stopPropagation();
      remove(el);
    } else {
      choose(el.dataset.value);
    }
  });
  menu.addEventListener('keydown', (e) => {
    const list = items();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(list.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (list[activeIndex]) choose(list[activeIndex].dataset.value);
    } else if (e.key === 'F2') {
      e.preventDefault();
      if (list[activeIndex]) edit(list[activeIndex]);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && list[activeIndex]?.querySelector('.preset-del')) {
      e.preventDefault();
      remove(list[activeIndex]);
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      close();
    }
  });
  popover.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  popover.addEventListener('focusout', (e) => {
    if (isOpen() && e.relatedTarget && !popover.contains(e.relatedTarget)) close(false);
  });
  // Capture phase: the canvas and other widgets stop mouse events from bubbling to the document.
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !popover.contains(e.target) && e.target !== select) close(false);
  }, true);
  window.addEventListener('resize', () => close(false));
  window.addEventListener('blur', () => close(false));
})();
