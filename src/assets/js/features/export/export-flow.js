/* Export flow: pre-download checks, page choice for Attach PDF, combined and per-subject downloads, drag-and-drop attach, and separate PDF/PNG export. */
(function () {
  const $ = id => document.getElementById(id);
  const tick = ms => new Promise(r => setTimeout(r, ms));
  const { subjects, saveExp } = window.coverdraftSubjectState;
  const cfg = () => UNI_CONFIGS[currentUniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID];
  // check before download
  function issues(options = {}) {
    const out = [], c = cfg(), d = currentFormData;
    const currentOnly = options.scope === 'current';
    const pageKeys = currentOnly ? [currentPageKey] : window.pdfPages();
    if (!currentOnly || currentPageKey === 'cover') {
      c.fields.forEach(f => {
        if ((f.group === 'student' || ['title', 'code', 'prof'].includes(f.id)) && !String(d[f.id] || '').trim())
          out.push(`${f.label} is empty`);
      });
      if ((d.title || '').length > 70)
        out.push('The course title is long and may wrap on the cover');
    }
    if (pageKeys.includes('index')) {
      const rows = Array.isArray(experimentsList) ? experimentsList : [];
      const n = rows.filter(r => !String(r?.title || '').trim()).length;
      if (!rows.length || n === rows.length)
        out.push('The index is empty (used on the Index page)');
      else if (n)
        out.push(`${n} index ${n > 1 ? 'entries have' : 'entry has'} no title`);
    }
    return out;
  }
  function guarded(run, options = {}) {
    const l = issues(options);
    if (!l.length)
      return run();
    const issueList = $('checkList');
    issueList.replaceChildren();
    l.forEach(x => {
      const item = document.createElement('li');
      item.textContent = x;
      issueList.appendChild(item);
    });
    $('checkModal').style.display = 'flex';
    $('checkAnyway').onclick = () => {
      $('checkModal').style.display = 'none';
      run();
    };
    $('checkFix').onclick = () => {
      $('checkModal').style.display = 'none';
    };
  }
  window.coverdraftRunExportPreflight = guarded;
  function rebind(id, fn) {
    const b = $(id), n = b.cloneNode(true);
    b.replaceWith(n);
    n.addEventListener('click', fn);
  }
  $('exportPdfBtn')?.addEventListener('click', () => guarded(() => exportFinalPdf(false, { onlyCurrentPage: true }), { scope: 'current' }));
  // Simple mode only exports the cover, so "cover + index + assignment" needs its own page list for this one export.
  $('openMergerBtn')?.addEventListener('click', () => {
    buildMergePageRows();
    const box = $('mergeIncludeIndex');
    if (box)
      box.checked = Array.isArray(experimentsList) && experimentsList.some(r => r && String(r.title || '').trim());
  });
  rebind('confirmMergeDownloadBtn', () => {
    const simple = document.body.classList.contains('simple-mode');
    const picked = mergeRows().filter(r => r.querySelector('input').checked).map(r => r.dataset.pg);
    if (!simple && !picked.length)
      return showToast('Tick at least one page to put before your assignment.', false);
    $('mergerModal').style.display = 'none';
    const withIndex = simple && !!$('mergeIncludeIndex')?.checked;
    // The choice only applies to this export; the page manager in Preview PDF is left alone.
    guarded(() => {
      const prevPages = window.pdfPages;
      window.pdfPages = simple ? () => withIndex ? ['cover', 'index'] : ['cover'] : () => picked.slice();
      return Promise.resolve(exportFinalPdf(true)).finally(() => {
        window.pdfPages = prevPages;
      });
    });
  });
  // Attach PDF (Advanced mode): choose and order the pages that go in front of the assignment.
  const mergeList = $('mergePageRows'), mergeRows = () => [...document.querySelectorAll('#mergePageRows [data-pg]')];
  function syncMergeRows() {
    const rows = mergeRows(), n = rows.filter(r => r.querySelector('input').checked).length;
    rows.forEach((row, i) => row.querySelectorAll('.mv').forEach(b => {
      const d = +b.dataset.d;
      b.disabled = (d < 0 && i === 0) || (d > 0 && i === rows.length - 1);
    }));
    if ($('mergePagesCount'))
      $('mergePagesCount').textContent = `${n} included · drag to reorder`;
    const go = $('confirmMergeDownloadBtn');
    if (go) {
      const none = !document.body.classList.contains('simple-mode') && n === 0;
      go.disabled = none;
      go.title = none ? 'Tick at least one page to put before your assignment.' : '';
    }
  }
  function buildMergePageRows() {
    if (!mergeList)
      return;
    mergeList.replaceChildren();
    // Start from the page order and ticks chosen in Preview PDF.
    [...document.querySelectorAll('#pageRows [data-pg]')].forEach(src => {
      const key = src.dataset.pg, label = (src.querySelector('label')?.textContent || key).trim();
      const row = document.createElement('div');
      row.className = 'page-row';
      row.dataset.pg = key;
      row.draggable = true;
      const lab = document.createElement('label'), box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!src.querySelector('input[type="checkbox"]')?.checked;
      lab.append(box, document.createTextNode(' ' + label));
      const btns = document.createElement('span');
      [['chevron-left', -1, 'earlier'], ['chevron-right', 1, 'later']].forEach(([icon, d, w]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mv';
        b.dataset.d = String(d);
        b.innerHTML = lucideSvg(icon, 14);
        b.setAttribute('aria-label', `Move ${label} ${w}`);
        btns.appendChild(b);
      });
      row.append(lab, btns);
      mergeList.appendChild(row);
    });
    syncMergeRows();
  }
  let mergeDrag = null;
  mergeList?.addEventListener('dragstart', e => {
    const r = e.target.closest?.('[data-pg]');
    if (!r)
      return;
    mergeDrag = r;
    r.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', r.dataset.pg);
    } catch (_) { }
  });
  mergeList?.addEventListener('dragover', e => {
    if (!mergeDrag)
      return;
    e.preventDefault();
    const over = e.target.closest('[data-pg]');
    if (!over || over === mergeDrag)
      return;
    const box = over.getBoundingClientRect();
    const sameRow = Math.abs(e.clientY - (box.top + box.height / 2)) < box.height / 2, before = sameRow ? e.clientX < box.left + box.width / 2 : e.clientY < box.top;
    mergeList.insertBefore(mergeDrag, before ? over : over.nextSibling);
  });
  mergeList?.addEventListener('drop', e => e.preventDefault());
  mergeList?.addEventListener('dragend', () => {
    mergeDrag?.classList.remove('dragging');
    mergeDrag = null;
    syncMergeRows();
  });
  mergeList?.addEventListener('change', syncMergeRows);
  mergeList?.addEventListener('click', e => {
    const mv = e.target.closest('.mv');
    if (!mv)
      return;
    const row = mv.closest('[data-pg]'), up = +mv.dataset.d < 0, sib = up ? row.previousElementSibling : row.nextElementSibling;
    if (!sib)
      return;
    if (up)
      mergeList.insertBefore(row, sib);
    else
      mergeList.insertBefore(sib, row);
    syncMergeRows();
    (mv.disabled ? row.querySelector('.mv:not(:disabled)') : mv)?.focus();
  });
  // Export the subjects selected in Preview PDF. By default they go into one combined PDF; with
  // { individual: true } each subject becomes its own PDF with the same pages (for example cover + index).
  window.coverdraftExportMultipleSubjects = async function (selectedSubjectKeys, { individual = false, copies = {} } = {}) {
    const catalog = subjects().slice();
    const keyOf = (subject) => String(subject?.code || subject?.title || '');
    const keys = new Set(Array.isArray(selectedSubjectKeys) ? selectedSubjectKeys.map(String) : []);
    const subs = catalog.filter(subject => keys.has(keyOf(subject)));
    const sem = currentFormData.sem, uni = currentUniKey, target = $('page');
    if (!subs.length || !target)
      return showToast('Choose at least one subject to include.', false);
    if (typeof window.coverdraftBeginExport === 'function' && !window.coverdraftBeginExport())
      return;
    const z = zoomLevel, orig = currentPageKey, keep = currentFormData.code;
    const hiddenEls = [...document.querySelectorAll('.el-badge,.guide-line,.resize-handle')].map(el => ({ el, display: el.style.display }));
    try {
      saveExp();
      deselectAll();
      updateZoom(1);
      hiddenEls.forEach(({ el }) => {
        el.style.display = 'none';
      });
      await window.coverdraftEnsurePdfLibs?.();
      const { jsPDF } = window.jspdf, dims = window.coverdraftPageDimensions?.() || { width: 794, height: 1123 }, fmt = [dims.width, dims.height];
      const makeSink = () => ({ doc: new jsPDF({ orientation: 'portrait', unit: 'px', format: fmt }), pages: 0 });
      const addImageData = (sink, data, alias) => {
        if (sink.pages)
          sink.doc.addPage(fmt, 'portrait');
        sink.doc.addImage(data, 'JPEG', 0, 0, fmt[0], fmt[1], alias);
        sink.pages++;
      };
      const safePart = window.coverdraftSafePdfFilePart || ((v) => String(v || 'submission').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80));
      const who = safePart(currentFormData.name || 'submission');
      const semester = safePart(sem || 'semester');
      const combined = individual ? null : makeSink();
      const exportScale = window.matchMedia?.('(max-width: 760px)').matches ? 1.35 : 1.65;
      let capturedPages = 0, savedFiles = 0;
      for (let i = 0; i < subs.length; i++) {
        showToast(`Rendering subject ${i + 1} of ${subs.length}: ${subs[i].title}`);
        window.applyBatchSubject(encodeURIComponent(JSON.stringify(subs[i])), sem, uni);
        await tick(40);
        const sink = individual ? makeSink() : combined;
        const before = sink.pages;
        const shots = [];
        await window.captureDocPages(target, exportScale, {
          onPage: (cv) => {
            shots.push(cv.toDataURL('image/jpeg', 0.86));
            cv.width = 1;
            cv.height = 1;
          }
        });
        // Each copy is a full set of the chosen pages (for example cover + index), repeated.
        const sets = Math.max(1, Math.min(50, Number(copies[keyOf(subs[i])]) || 1));
        for (let copy = 0; copy < sets; copy++)
          shots.forEach((data, index) => addImageData(sink, data, `s${i}p${index}`));
        capturedPages += sink.pages - before;
        if (individual && sink.pages) {
          const number = String(i + 1).padStart(2, '0');
          sink.doc.save(`${who}_${semester}_${number}_${safePart(subs[i].code)}_${safePart(subs[i].title).slice(0, 40)}.pdf`);
          savedFiles++;
          await tick(350); // browsers throttle several downloads fired in the same instant
        }
      }
      if (!capturedPages)
        throw new Error('No pages were captured. Check the selected page options and retry.');
      if (individual) {
        showToast(`${savedFiles} separate PDFs downloaded`);
      } else {
        combined.doc.save(`${who}_${semester}_Semester_${subs.length}_Subjects.pdf`);
        showToast(`Combined PDF download started (${subs.length} subjects)`);
      }
    } catch (err) {
      console.error(err);
      showToast('Export error: ' + err.message, false);
    } finally {
      try {
        documentPages[currentPageKey] = canvasElements;
        currentPageKey = orig;
        canvasElements = documentPages[orig];
        const back = catalog.find(subject => subject.code === keep);
        if (back)
          window.applyBatchSubject(encodeURIComponent(JSON.stringify(back)), sem, uni);
        hiddenEls.forEach(({ el, display }) => {
          if (el.isConnected)
            el.style.display = display;
        });
        updateZoom(z);
        renderPageCanvas();
      } finally {
        window.coverdraftEndExport?.();
      }
    }
  };
  // Print the ticked subjects, each repeated by its number of copies, in one print job.
  window.coverdraftPrintMultipleSubjects = async function (selectedSubjectKeys, { copies = {} } = {}) {
    const catalog = subjects().slice();
    const keyOf = (subject) => String(subject?.code || subject?.title || '');
    const keys = new Set(Array.isArray(selectedSubjectKeys) ? selectedSubjectKeys.map(String) : []);
    const subs = catalog.filter(subject => keys.has(keyOf(subject)));
    const sem = currentFormData.sem, uni = currentUniKey;
    if (!subs.length)
      return showToast('Choose at least one subject to print.', false);
    if (typeof window.coverdraftBeginExport === 'function' && !window.coverdraftBeginExport())
      return;
    const z = zoomLevel, orig = currentPageKey, keep = currentFormData.code;
    let built = 0;
    try {
      saveExp();
      deselectAll();
      updateZoom(1);
      const ctx = window.coverdraftBeginPrintBuild?.({ alreadyBusy: true });
      if (!ctx)
        throw new Error('The print layout could not be prepared.');
      for (let i = 0; i < subs.length; i++) {
        showToast(`Preparing subject ${i + 1} of ${subs.length}: ${subs[i].title}`);
        window.applyBatchSubject(encodeURIComponent(JSON.stringify(subs[i])), sem, uni);
        await tick(40);
        const sets = Math.max(1, Math.min(50, Number(copies[keyOf(subs[i])]) || 1));
        for (let copy = 0; copy < sets; copy++) {
          window.coverdraftAppendPrintPages(ctx);
          built++;
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Print error: ' + err.message, false);
      built = 0;
    } finally {
      try {
        documentPages[currentPageKey] = canvasElements;
        currentPageKey = orig;
        canvasElements = documentPages[orig];
        const back = catalog.find(subject => subject.code === keep);
        if (back)
          window.applyBatchSubject(encodeURIComponent(JSON.stringify(back)), sem, uni);
        updateZoom(z);
        renderPageCanvas();
      } finally {
        window.coverdraftEndExport?.();
      }
    }
    if (built)
      window.print();
  };
  // drop an assignment PDF anywhere
  const hint = $('dropHint');
  let dc = 0;
  const hasFile = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  addEventListener('dragenter', e => {
    if (hasFile(e)) {
      dc++;
      hint.classList.add('on');
    }
  });
  addEventListener('dragleave', e => {
    if (hasFile(e) && --dc <= 0) {
      dc = 0;
      hint.classList.remove('on');
    }
  });
  addEventListener('dragover', e => {
    if (hasFile(e))
      e.preventDefault();
  });
  addEventListener('drop', e => {
    if (!hasFile(e))
      return;
    e.preventDefault();
    dc = 0;
    hint.classList.remove('on');
    const f = [...e.dataTransfer.files].find(x => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (!f)
      return showToast('Only PDF files can be attached', false);
    const input = $('assignmentPdfInput');
    if (!input)
      return showToast('PDF attachment input is unavailable. Use Attach PDF instead.', false);
    try {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    } catch (_) {
      showToast('Could not attach the dropped file. Use Attach PDF instead.', false);
    }
  });
  // Export the cover and index as independent PDF files or PNG images.
  async function exportSelectedPagesSeparately(asPng) {
    if (typeof window.captureDocPages !== 'function')
      return showToast('Page export is unavailable', false);
    const rows = [...document.querySelectorAll('#pageRows [data-pg]')];
    const savedChecks = rows.map(row => row.querySelector('input').checked);
    const savedMode = document.body.classList.contains('simple-mode');
    const savedKey = currentPageKey;
    const savedZoom = zoomLevel;
    const originalPdfPages = window.pdfPages;
    const dims = window.coverdraftPageDimensions?.() || { width: 794, height: 1123 };
    const fmt = [dims.width, dims.height];
    const labels = { cover: 'Cover', index: 'Index' };
    const outputs = [];
    await window.coverdraftEnsurePdfLibs?.();
    const { jsPDF } = window.jspdf || {};
    if (typeof window.coverdraftBeginExport === 'function' && !window.coverdraftBeginExport())
      return;
    try {
      if (!asPng && typeof jsPDF !== 'function')
        throw new Error('PDF export tools are not available. Reload the app and retry.');
      document.body.classList.remove('simple-mode');
      deselectAll();
      updateZoom(1);
      document.querySelectorAll('.el-badge,.guide-line,.resize-handle').forEach(el => {
        el.style.display = 'none';
      });
      for (const wanted of ['cover', 'index']) {
        rows.forEach(row => {
          row.querySelector('input').checked = row.dataset.pg === wanted;
        });
        window.pdfPages = () => [wanted];
        let pageCount = 0;
        const pdf = asPng ? null : new jsPDF({ orientation: 'portrait', unit: 'px', format: fmt });
        const scale = window.matchMedia?.('(max-width: 760px)').matches ? (asPng ? 1.45 : 1.25) : (asPng ? 1.8 : 1.55);
        await window.captureDocPages(document.getElementById('page'), scale, {
          onPage: async (canvas, index) => {
            pageCount++;
            if (asPng) {
              const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
              if (!blob)
                throw new Error('Could not prepare a PNG image');
              outputs.push({ blob, name: `${labels[wanted]}${index ? `-${index + 1}` : ''}.png` });
            } else {
              if (index)
                pdf.addPage(fmt, 'portrait');
              pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, fmt[0], fmt[1]);
            }
            canvas.width = 1;
            canvas.height = 1;
          }
        });
        if (!asPng && pageCount)
          outputs.push({ blob: new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }), name: `${labels[wanted]}.pdf` });
      }
      if (!outputs.length)
        throw new Error('No pages were exported. Check the selected page settings and retry.');
      for (const output of outputs) {
        const url = URL.createObjectURL(output.blob), link = document.createElement('a');
        link.href = url;
        link.download = output.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        await tick(220);
      }
      showToast(asPng ? 'PNG downloads started' : 'Separate PDF downloads started');
    } catch (err) {
      console.error(err);
      showToast('Export error: ' + (err?.message || 'Unknown error'), false);
    } finally {
      try {
        window.pdfPages = originalPdfPages;
        rows.forEach((row, i) => {
          row.querySelector('input').checked = savedChecks[i];
        });
        document.body.classList.toggle('simple-mode', savedMode);
        documentPages[currentPageKey] = canvasElements;
        currentPageKey = savedKey;
        canvasElements = documentPages[savedKey] || [];
        document.querySelectorAll('.el-badge,.guide-line,.resize-handle').forEach(el => {
          el.style.display = '';
        });
        renderPageCanvas();
        updateZoom(savedZoom);
      } finally {
        window.coverdraftEndExport?.();
      }
    }
  }
  document.getElementById('exportSeparatePdfBtn')?.addEventListener('click', () => guarded(() => exportSelectedPagesSeparately(false)));
  document.getElementById('exportPngBtn')?.addEventListener('click', () => guarded(() => exportSelectedPagesSeparately(true)));
})();
