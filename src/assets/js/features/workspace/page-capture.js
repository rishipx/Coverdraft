/* Choose and order the pages in the PDF, and render every page (a long index continues on extra pages) for preview and export. */
(function () {
  const tick = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id), LS = window.coverdraftStorage;
  // pages in the PDF: choose and reorder
  const rows = $('pageRows'), pr = () => [...rows.querySelectorAll('[data-pg]')], on = () => pr().filter(r => r.querySelector('input').checked).map(r => r.dataset.pg);
  window.pdfPages = () => on();
  const sp = LS.get('coverdraft_pages_v2', null);
  if (sp) {
    const isAllowedPageKey = k => ['cover', 'index'].includes(k) || /^import-\d+$/.test(String(k));
    const allowed = ['cover', 'index', ...(Array.isArray(sp.order) ? sp.order.filter(k => /^import-\d+$/.test(String(k))) : [])];
    const savedOrder = Array.isArray(sp.order) ? sp.order.filter(isAllowedPageKey) : [];
    const order = [...savedOrder, ...allowed.filter(k => !savedOrder.includes(k))];
    order.forEach(k => {
      const row = rows.querySelector(`[data-pg="${k}"]`);
      if (row)
        rows.appendChild(row);
    });
    const savedEnabled = Array.isArray(sp.on) ? sp.on.filter(isAllowedPageKey) : ['cover', 'index'];
    pr().forEach(r => r.querySelector('input').checked = savedEnabled.includes(r.dataset.pg));
    if (!pr().some(r => r.querySelector('input').checked) && !savedEnabled.some(k => /^import-\d+$/.test(String(k)))) {
      const cover = rows.querySelector('[data-pg="cover"] input');
      if (cover)
        cover.checked = true;
    }
  }
  const savePg = () => LS.set('coverdraft_pages_v2', { order: pr().map(r => r.dataset.pg), on: on() });
  rows.addEventListener('change', savePg);
  rows.addEventListener('click', e => {
    const b = e.target.closest('.mv');
    if (!b)
      return;
    const r = b.closest('[data-pg]');
    if (b.dataset.d < 0) {
      if (r.previousElementSibling)
        rows.insertBefore(r, r.previousElementSibling);
    } else if (r.nextElementSibling)
      rows.insertBefore(r.nextElementSibling, r);
    savePg();
    b.focus();
  });
  // Native renderer: paints the page copy straight from the browser's own layout (boxes, borders, images and each
  // word's measured position), so it does not depend on html2canvas's text measuring, which mis-draws on some phones.
  const SKIP_CLASS = /\b(el-badge|resize-handle|guide-line)\b/;
  const px = (value) => parseFloat(value) || 0;
  const roundedRectPath = (ctx, x, y, w, h, radii) => {
    const [tl, tr, br, bl] = radii.map(r => Math.max(0, Math.min(r, w / 2, h / 2)));
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  };
  const paintBox = (ctx, cs, x, y, w, h, alpha, borderMode = 'inset') => {
    const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => px(cs[k]));
    const rounded = radii.some(r => r > 0);
    ctx.globalAlpha = alpha;
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = bg;
      if (rounded) {
        roundedRectPath(ctx, x, y, w, h, radii);
        ctx.fill();
      } else
        ctx.fillRect(x, y, w, h);
    }
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({
      width: px(cs['border' + side + 'Width']), style: cs['border' + side + 'Style'], color: cs['border' + side + 'Color']
    }));
    const visible = sides.map(sd => sd.width > 0 && sd.style !== 'none' && sd.style !== 'hidden');
    if (!visible.some(Boolean) || borderMode === 'skip')
      return;
    const uniform = visible.every(Boolean) && sides.every(sd => sd.width === sides[0].width && sd.style === sides[0].style && sd.color === sides[0].color);
    const dash = (sd) => sd.style === 'dashed' ? [sd.width * 3, sd.width * 2] : sd.style === 'dotted' ? [sd.width, sd.width] : [];
    if (uniform && rounded) {
      const bw = sides[0].width;
      ctx.strokeStyle = sides[0].color;
      ctx.lineWidth = bw;
      ctx.setLineDash(dash(sides[0]));
      roundedRectPath(ctx, x + bw / 2, y + bw / 2, w - bw, h - bw, radii.map(r => Math.max(0, r - bw / 2)));
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const line = (sd, x1, y1, x2, y2) => {
      ctx.strokeStyle = sd.color;
      ctx.lineWidth = sd.width;
      ctx.setLineDash(dash(sd));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const [t, r, b, l] = sides;
    const draw = (sd, i, parts) => {
      if (!visible[i])
        return;
      if (sd.style === 'double' && sd.width >= 3) {
        const third = sd.width / 3;
        parts(third, third / 2);
        parts(third, sd.width - third / 2);
      } else
        parts(sd.width, borderMode === 'center' ? 0 : sd.width / 2);
    };
    draw(t, 0, (wd, off) => line({ ...t, width: wd }, x, y + off, x + w, y + off));
    draw(b, 2, (wd, off) => line({ ...b, width: wd }, x, y + h - off, x + w, y + h - off));
    draw(l, 3, (wd, off) => line({ ...l, width: wd }, x + off, y, x + off, y + h));
    draw(r, 1, (wd, off) => line({ ...r, width: wd }, x + w - off, y, x + w - off, y + h));
  };
  const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
  const paintImageBox = async (ctx, el, x, y, w, h, cs, alpha) => {
    let source = null;
    if (el instanceof HTMLImageElement) {
      if (!el.complete || !el.naturalWidth)
        await el.decode().catch(() => { });
      source = el.naturalWidth ? el : null;
    } else if (el instanceof HTMLCanvasElement)
      source = el;
    else if (el instanceof SVGElement) {
      const clone = el.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      source = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)));
    }
    if (!source)
      return;
    const sw = source.naturalWidth || source.width || w, sh = source.naturalHeight || source.height || h;
    let dx = x, dy = y, dw = w, dh = h;
    const fit = cs.objectFit;
    if ((fit === 'contain' || fit === 'scale-down' || fit === 'cover') && sw && sh) {
      const k = fit === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
      dw = sw * k;
      dh = sh * k;
      dx = x + (w - dw) / 2;
      dy = y + (h - dh) / 2;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    if (fit === 'cover') {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
    }
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
  };
  const paintText = (ctx, node, pageRect, alpha) => {
    const parent = node.parentElement;
    if (!parent)
      return;
    const cs = getComputedStyle(parent);
    let value = node.textContent;
    if (!/\S/.test(value))
      return;
    const transform = cs.textTransform;
    const cased = (text) => transform === 'uppercase' ? text.toUpperCase() : transform === 'lowercase' ? text.toLowerCase() : transform === 'capitalize' ? text.replace(/\b\w/g, c => c.toUpperCase()) : text;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    if ('letterSpacing' in ctx)
      ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const underline = /underline/.test(cs.textDecorationLine || '');
    const strike = /line-through/.test(cs.textDecorationLine || '');
    const fontSize = px(cs.fontSize);
    const range = document.createRange();
    const drawPiece = (start, end) => {
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = [...range.getClientRects()].filter(r => r.width > 0 || r.height > 0);
      if (!rects.length)
        return;
      const piece = value.slice(start, end);
      if (rects.length > 1 && piece.length > 1) {
        // The word itself wrapped: place it character by character.
        for (let i = start; i < end; i++)
          drawPiece(i, i + 1);
        return;
      }
      const r = rects[0];
      const metrics = ctx.measureText(piece);
      const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.8;
      const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.2;
      const baseline = r.top - pageRect.top + (r.height - (ascent + descent)) / 2 + ascent;
      const x = r.left - pageRect.left;
      ctx.fillText(cased(piece), x, baseline);
      if (underline || strike) {
        ctx.fillRect(x, underline ? baseline + fontSize * 0.1 : baseline - fontSize * 0.3, r.width, Math.max(1, fontSize / 16));
      }
    };
    const wordPattern = /\S+/g;
    let match;
    while ((match = wordPattern.exec(value)))
      drawPiece(match.index, match.index + match[0].length);
    ctx.restore();
  };
  const renderNative = async (page, scale) => {
    const width = page.offsetWidth, height = page.offsetHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    const pageRect = page.getBoundingClientRect();
    const pageStyle = getComputedStyle(page);
    ctx.fillStyle = pageStyle.backgroundColor && pageStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? pageStyle.backgroundColor : '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const paintElement = async (el, parentAlpha, isRoot) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || SKIP_CLASS.test(el.getAttribute('class') || ''))
        return;
      const alpha = parentAlpha * (parseFloat(cs.opacity) || 0);
      if (alpha <= 0)
        return;
      const rect = el.getBoundingClientRect();
      const x = rect.left - pageRect.left, y = rect.top - pageRect.top;
      if (!isRoot) {
        if (el instanceof HTMLImageElement || el instanceof SVGElement || el instanceof HTMLCanvasElement) {
          paintBox(ctx, cs, x, y, rect.width, rect.height, alpha);
          await paintImageBox(ctx, el, x, y, rect.width, rect.height, cs, alpha);
          return;
        }
        // In a collapsed-border table the cell edges are shared, so draw them centred on the edge (and not on the table).
        const tag = el.tagName;
        const collapsed = (tag === 'TD' || tag === 'TH' || tag === 'TABLE') && getComputedStyle(el.closest('table')).borderCollapse === 'collapse';
        paintBox(ctx, cs, x, y, rect.width, rect.height, alpha, collapsed ? (tag === 'TABLE' ? 'skip' : 'center') : 'inset');
      }
      const clip = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
      if (clip) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, rect.width, rect.height);
        ctx.clip();
      }
      // Paint children in stacking order (z-index), then document order.
      const kids = [...el.childNodes].map((node, index) => {
        let z = 0;
        if (node.nodeType === 1) {
          const kidStyle = getComputedStyle(node);
          z = kidStyle.position !== 'static' && kidStyle.zIndex !== 'auto' ? parseInt(kidStyle.zIndex, 10) || 0 : 0;
        }
        return { node, index, z };
      }).sort((a, b) => a.z - b.z || a.index - b.index);
      for (const { node } of kids) {
        if (node.nodeType === 3)
          paintText(ctx, node, pageRect, alpha);
        else if (node.nodeType === 1)
          await paintElement(node, alpha, false);
      }
      if (clip)
        ctx.restore();
    };
    await paintElement(page, 1, true);
    return canvas;
  };

  // How well a rendered canvas matches the page: the share of text/image elements whose text (specifically the
  // far end of it, which a left-stacked or clipped render never reaches) actually shows ink. ~1 is a good render;
  // a clipped, black, blank or letter-stacked render scores far lower.
  const renderScore = (canvas, probes, scale) => {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || canvas.width < 2 || canvas.height < 2)
        return 0;
      const mid = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 3), 1, 1).data;
      if (mid[3] < 200 || (mid[0] < 40 && mid[1] < 40 && mid[2] < 40))
        return 0;
      if (!probes.length)
        return 1;
      let hits = 0;
      probes.forEach(box => {
        const x = Math.max(0, Math.floor(box.x * scale)), y = Math.max(0, Math.floor(box.y * scale));
        const w = Math.min(canvas.width - x, Math.ceil(box.w * scale)), h = Math.min(canvas.height - y, Math.ceil(box.h * scale));
        if (w < 1 || h < 1)
          return;
        const data = ctx.getImageData(x, y, w, h).data;
        for (let i = 0; i < data.length; i += 8)
          if (data[i + 3] > 40 && (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200)) {
            hits++;
            return;
          }
      });
      return hits / probes.length;
    } catch (_) {
      return 1;
    }
  };
  const inkProbes = (page) => {
    const pageRect = page.getBoundingClientRect();
    const range = document.createRange();
    const boxes = [];
    page.querySelectorAll('.c-el').forEach(el => {
      if (el.offsetWidth < 4 || el.offsetHeight < 4)
        return;
      if (el.querySelector('img, svg, canvas')) {
        const r = el.getBoundingClientRect();
        boxes.push({ x: r.left - pageRect.left, y: r.top - pageRect.top, w: r.width, h: r.height });
        return;
      }
      if (!el.textContent.trim())
        return;
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width < 8 || r.height < 4)
        return;
      const tail = Math.max(6, r.width * 0.25);
      boxes.push({ x: r.right - pageRect.left - tail, y: r.top - pageRect.top, w: tail, h: r.height });
    });
    return boxes.slice(0, 16);
  };
  // Render a page. The editor viewport on a phone is zoomed, scrolled and clipped, so render an unscaled off-screen
  // copy: first with the native renderer, then with html2canvas in other modes, and keep the first result that really
  // contains the page's content (or the best one if none does).
  const renderPage = async (target, scale) => {
    const base = { scale, useCORS: true, logging: false, backgroundColor: '#ffffff' };
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${target.offsetWidth}px;height:${target.offsetHeight}px;overflow:visible;pointer-events:none;`;
    const copy = target.cloneNode(true);
    copy.style.cssText += ';position:relative;left:0;top:0;margin:0;transform:none;box-shadow:none;';
    holder.appendChild(copy);
    document.body.appendChild(holder);
    let best = null, bestScore = -1;
    try {
      if (document.fonts?.ready)
        await document.fonts.ready.catch(() => { });
      const probes = inkProbes(copy);
      const attempts = [
        () => renderNative(copy, scale),
        () => html2canvas(copy, { ...base, windowWidth: 1280, windowHeight: 1600 }),
        () => html2canvas(copy, { ...base, foreignObjectRendering: true, windowWidth: 1280, windowHeight: 1600 }),
        () => html2canvas(target, base)
      ];
      for (const attempt of attempts) {
        let canvas = null;
        try {
          canvas = await attempt();
        } catch (_) {
          canvas = null;
        }
        if (!canvas)
          continue;
        const score = renderScore(canvas, probes, scale);
        if (score > bestScore) {
          best = canvas;
          bestScore = score;
        }
        if (score >= 0.8)
          break;
      }
    } finally {
      holder.remove();
    }
    if (!best)
      throw new Error('The page could not be rendered. Try again.');
    return best;
  };

  // render every page; a long index continues on extra pages
  window.captureDocPages = async function (target, scale, options = {}) {
    await window.coverdraftEnsurePdfLibs?.();
    if (typeof html2canvas !== 'function')
      throw new Error('The PDF tools could not be loaded. Check your internet connection and try again.');
    const shots = [];
    const basePageKey = currentPageKey;
    const baseCanvasElements = canvasElements;
    const baseExperiments = experimentsList;
    documentPages[currentPageKey] = canvasElements;
    const originalPages = { ...documentPages };
    const full = Array.isArray(baseExperiments) ? baseExperiments.slice() : [];
    let pageCount = 0;
    const emit = async () => {
      await tick(24);
      const canvas = await renderPage(target, scale);
      const index = pageCount++;
      if (typeof options.onPage === 'function') {
        await options.onPage(canvas, index);
        canvas.width = 1;
        canvas.height = 1;
      } else
        shots.push(canvas);
    };
    try {
      if (options.onlyCurrentPage) {
        const k = options.pageKey || basePageKey;
        documentPages[currentPageKey] = canvasElements;
        currentPageKey = k;
        canvasElements = documentPages[k] || [];
        if (!canvasElements.length && k === 'index')
          canvasElements = documentPages[k] = window.coverdraftScaleA4Layout?.(buildIndexTemplate()) || buildIndexTemplate();
        renderPageCanvas();
        await emit();
        return shots;
      }
      const keys = typeof window.pdfPages === 'function' ? window.pdfPages() : ['cover', 'index'];
      for (const k of keys) {
        documentPages[currentPageKey] = canvasElements;
        currentPageKey = k;
        canvasElements = documentPages[k] || [];
        // Only the Index page falls back to its template; an emptied Cover or imported page stays as-is.
        if (!canvasElements.length && k === 'index')
          canvasElements = documentPages[k] = window.coverdraftScaleA4Layout?.(buildIndexTemplate()) || buildIndexTemplate();
        if (k !== 'index') {
          renderPageCanvas();
          await emit();
          continue;
        }
        const fits = n => {
          experimentsList = full.slice(0, n);
          renderPageCanvas();
          const t = target.querySelector('.exp-table');
          if (!t)
            return true;
          const r = target.getBoundingClientRect(), sc = r.height / target.offsetHeight;
          return (t.getBoundingClientRect().bottom - r.top) / sc <= target.offsetHeight - 70;
        };
        let n = full.length;
        if (n > 1 && !fits(n)) {
          let lo = 1, hi = n - 1;
          while (lo < hi) {
            const m = (lo + hi + 1) >> 1;
            fits(m) ? lo = m : hi = m - 1;
          }
          n = lo;
        }
        const step = Math.max(n, 1);
        for (let i = 0; i < Math.max(full.length, 1); i += step) {
          experimentsList = full.slice(i, i + step);
          renderPageCanvas();
          await emit();
        }
      }
    } finally {
      experimentsList = baseExperiments;
      documentPages = originalPages;
      currentPageKey = basePageKey;
      canvasElements = baseCanvasElements;
      renderPageCanvas();
    }
    return shots;
  };
})();
