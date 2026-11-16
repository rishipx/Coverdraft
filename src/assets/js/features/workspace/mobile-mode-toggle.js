/* On phones, the Coverdraft wordmark toggles between Simple and Advanced modes; the pencil button opens the details sheet. */
(function () {
  'use strict';
  const brandTitle = document.querySelector('.brand-title');
  if (brandTitle) {
    const mobileModeQuery = window.matchMedia('(max-width: 600px)');
    const syncBrandSemantics = () => {
      if (mobileModeQuery.matches) {
        brandTitle.setAttribute('role', 'button');
        brandTitle.setAttribute('tabindex', '0');
        brandTitle.setAttribute('aria-label', document.body.classList.contains('simple-mode') ? 'Switch to Advanced mode' : 'Switch to Simple mode');
        brandTitle.setAttribute('aria-pressed', String(!document.body.classList.contains('simple-mode')));
      } else {
        brandTitle.removeAttribute('role');
        brandTitle.removeAttribute('tabindex');
        brandTitle.removeAttribute('aria-label');
        brandTitle.removeAttribute('aria-pressed');
      }
    };
    const toggleModeFromBrand = () => {
      if (!mobileModeQuery.matches || typeof setAppMode !== 'function')
        return;
      const switchEl = document.getElementById('advancedModeSwitch');
      const isAdvanced = switchEl ? switchEl.checked : !document.body.classList.contains('simple-mode');
      setAppMode(!isAdvanced);
      syncBrandSemantics();
    };
    brandTitle.addEventListener('click', toggleModeFromBrand);
    brandTitle.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && mobileModeQuery.matches) {
        event.preventDefault();
        toggleModeFromBrand();
      }
    });
    mobileModeQuery.addEventListener?.('change', syncBrandSemantics);
    window.addEventListener('resize', syncBrandSemantics, { passive: true });
    syncBrandSemantics();
  }

  const $ = (id) => document.getElementById(id);
  const sidebar = $('appSidebar');
  const backdrop = $('sidebarBackdrop');
  const root = document.documentElement;
  const phone = window.matchMedia('(max-width: 760px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const titles = { styling: 'Design', experiments: 'Index entries' };

  // The page has its own zoom, so the browser must never zoom the whole app. touch-action covers Chromium; these
  // cover Safari (gesture events) and any browser that starts a native pinch from a two-finger touchmove.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => document.addEventListener(type, (event) => {
    if (phone.matches)
      event.preventDefault();
  }, { passive: false }));
  document.addEventListener('touchmove', (event) => {
    if (phone.matches && event.touches.length > 1 && !event.target.closest?.('input, select, textarea'))
      event.preventDefault();
  }, { passive: false });

  /* The Design / Your details sheet opens full height and has only two resting places: open or closed.
     It follows the finger exactly while dragged (transform only, so it stays smooth) and, on release, glides
     the rest of the way on its own: closed once pulled past about a quarter of its height or flicked down,
     otherwise back up. One finger gesture carries on from scrolling the content to dragging the sheet and back. */
  const fullHeight = () => Math.max(240, Math.round(window.innerHeight - 20));
  let offset = 0;
  let animation = 0;
  let paintQueued = false;
  const paint = () => {
    paintQueued = false;
    sidebar.style.transform = `translateY(${offset}px)`;
    if (backdrop)
      backdrop.style.opacity = String(Math.max(0, 1 - offset / fullHeight()));
  };
  const queuePaint = () => {
    if (!paintQueued) {
      paintQueued = true;
      requestAnimationFrame(paint);
    }
  };
  const stopAnimation = () => {
    cancelAnimationFrame(animation);
    animation = 0;
  };
  const animateTo = (target, velocity, done) => {
    stopAnimation();
    const from = offset;
    const distance = target - from;
    if (reducedMotion.matches || Math.abs(distance) < 1) {
      offset = target;
      paint();
      done?.();
      return;
    }
    const duration = Math.max(160, Math.min(300, Math.abs(distance) / Math.max(0.9, Math.abs(velocity)) * 1.1));
    const started = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - started) / duration);
      offset = from + distance * (1 - Math.pow(1 - t, 3));
      paint();
      if (t < 1)
        animation = requestAnimationFrame(frame);
      else {
        animation = 0;
        done?.();
      }
    };
    animation = requestAnimationFrame(frame);
  };
  const finishClose = () => {
    stopAnimation();
    sidebar.classList.remove('mobile-open');
    backdrop?.classList.remove('visible');
    sidebar.style.transform = '';
    if (backdrop)
      backdrop.style.opacity = '';
    root.style.removeProperty('--sheet-full');
    offset = 0;
  };
  const openSheet = () => {
    const title = sidebar.querySelector('.sheet-head strong');
    if (title)
      title.textContent = titles[document.body.dataset.panel] || 'Your details';
    if (sidebar.classList.contains('mobile-open')) {
      animateTo(0, 1.2);
      return;
    }
    root.style.setProperty('--sheet-full', fullHeight() + 'px');
    offset = fullHeight();
    paint();
    sidebar.classList.add('mobile-open');
    backdrop?.classList.add('visible');
    animateTo(0, 1.6);
  };
  const closeSheet = (velocity = 1.4) => {
    if (!sidebar.classList.contains('mobile-open'))
      return;
    animateTo(fullHeight(), velocity, finishClose);
  };
  const setSheet = (open) => {
    if (!sidebar)
      return;
    if (open)
      openSheet();
    else
      closeSheet();
  };

  // On phones the Design tab has no side column to reveal, so it opens the sheet on the Design panel.
  $('tabPanelDesign')?.addEventListener('click', () => {
    if (phone.matches)
      setSheet(true);
  });
  $('mobileEditFab')?.addEventListener('click', () => {
    // The pencil edits the page you are on: Cover -> cover details, Index -> index entries.
    const page = document.querySelector('.view-tab[data-page].active')?.dataset.page;
    if (typeof activateSidebarPanel === 'function')
      activateSidebarPanel(page === 'index' ? 'experiments' : 'doc');
    setSheet(true);
    // Focus the sheet itself (not a field) so screen readers announce it without popping the keyboard.
    sidebar?.setAttribute('tabindex', '-1');
    setTimeout(() => sidebar?.focus({ preventScroll: true }), 0);
  });
  $('sheetDoneBtn')?.addEventListener('click', () => {
    closeSheet();
    $('mobileEditFab')?.focus({ preventScroll: true });
  });
  backdrop?.addEventListener('click', () => {
    if (phone.matches)
      closeSheet();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar?.classList.contains('mobile-open'))
      closeSheet();
  });

  let flingFrame = 0;
  const stopFling = () => {
    cancelAnimationFrame(flingFrame);
    flingFrame = 0;
  };
  const scroller = () => sidebar?.querySelector('.sidebar-scroll');
  const fling = (velocity) => {
    const el = scroller();
    if (!el || Math.abs(velocity) < 0.08)
      return;
    let v = velocity;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(48, now - last);
      last = now;
      const before = el.scrollTop;
      el.scrollTop = before + v * dt;
      v *= Math.pow(0.94, dt / 16);
      if (Math.abs(v) < 0.02 || el.scrollTop === before) {
        flingFrame = 0;
        return;
      }
      flingFrame = requestAnimationFrame(step);
    };
    flingFrame = requestAnimationFrame(step);
  };

  let gesture = null;
  const moveSheet = (delta) => {
    const next = Math.max(0, Math.min(fullHeight(), offset + delta));
    if (next !== offset) {
      offset = next;
      queuePaint();
    }
  };
  const applyStep = (step) => {
    const el = scroller();
    if (gesture.head || !el) {
      moveSheet(step);
      return;
    }
    if (step > 0) {
      // Finger moving down: reveal the content above first, then pull the sheet down.
      const used = Math.min(el.scrollTop, step);
      el.scrollTop -= used;
      if (step - used > 0)
        moveSheet(step - used);
    } else if (step < 0) {
      // Finger moving up: bring the sheet back up first, then scroll the content.
      const raise = Math.min(offset, -step);
      if (raise > 0)
        moveSheet(-raise);
      const left = -step - raise;
      if (left > 0)
        el.scrollTop += left;
    }
  };
  sidebar?.addEventListener('touchstart', (event) => {
    if (!phone.matches || !sidebar.classList.contains('mobile-open') || event.touches.length !== 1)
      return;
    stopFling();
    stopAnimation();
    const touch = event.touches[0];
    gesture = {
      x: touch.clientX,
      y: touch.clientY,
      lastY: touch.clientY,
      lastT: event.timeStamp,
      head: Boolean(event.target.closest('.sheet-head')),
      mode: 'idle',
      velocity: 0
    };
  }, { passive: true });
  sidebar?.addEventListener('touchmove', (event) => {
    if (!gesture || gesture.mode === 'horizontal')
      return;
    const touch = event.touches[0];
    if (gesture.mode === 'idle') {
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (Math.hypot(dx, dy) < 6)
        return;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        gesture.mode = 'horizontal';
        return;
      }
      gesture.mode = 'vertical';
    }
    event.preventDefault();
    const step = touch.clientY - gesture.lastY;
    const dt = Math.max(1, event.timeStamp - gesture.lastT);
    gesture.velocity = gesture.velocity * 0.6 + (step / dt) * 0.4;
    gesture.lastY = touch.clientY;
    gesture.lastT = event.timeStamp;
    applyStep(step);
  }, { passive: false });
  const endGesture = (event) => {
    if (!gesture)
      return;
    const done = gesture;
    gesture = null;
    if (done.mode !== 'vertical') {
      // A tap or horizontal drag: make sure an interrupted animation still finishes.
      if (offset > 0)
        animateTo(0, 1);
      return;
    }
    if (offset === 0 && !done.head) {
      fling(-done.velocity);
      return;
    }
    const v = event?.type === 'touchcancel' ? 0 : done.velocity;
    const closing = v > 0.45 || (offset > fullHeight() * 0.28 && v > -0.3);
    if (closing)
      closeSheet(Math.max(0.9, v));
    else
      animateTo(0, Math.max(0.9, -v));
  };
  sidebar?.addEventListener('touchend', endGesture);
  sidebar?.addEventListener('touchcancel', endGesture);
  window.addEventListener('resize', () => {
    if (sidebar?.classList.contains('mobile-open') && phone.matches) {
      root.style.setProperty('--sheet-full', fullHeight() + 'px');
      offset = Math.min(offset, fullHeight());
      paint();
    }
  }, { passive: true });
})();
