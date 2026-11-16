/* Loads the PDF libraries (html2canvas, jsPDF, pdf-lib) on demand instead of blocking the first paint.
  Exports call `await window.coverdraftEnsurePdfLibs()` first. The libraries are also fetched in idle time
  after the page loads, so the first export is instant and the offline cache still fills. */
(function () {
  'use strict';
  const LIBS = [
    { name: 'html2canvas', ready: () => typeof window.html2canvas === 'function' },
    { name: 'jspdf', ready: () => typeof window.jspdf?.jsPDF === 'function' },
    { name: 'pdf-lib', ready: () => !!window.PDFLib?.PDFDocument }
  ];
  const inflight = new Map();
  function load(lib) {
    if (lib.ready())
      return Promise.resolve(true);
    if (inflight.has(lib.name))
      return inflight.get(lib.name);
    const p = new Promise((resolve) => {
      const s = createCdnScript(lib.name);
      s.onload = () => resolve(lib.ready());
      s.onerror = () => {
        s.remove();
        resolve(false);
      };
      document.head.appendChild(s);
    }).then((ok) => {
      if (!ok)
        inflight.delete(lib.name);
      return ok;
    });
    inflight.set(lib.name, p);
    return p;
  }
  // Resolves true when every library is ready. Never rejects; callers keep their own "not available" message.
  window.coverdraftEnsurePdfLibs = () => Promise.all(LIBS.map(load)).then((r) => r.every(Boolean));
  window.addEventListener('load', () => {
    const warm = () => {
      window.coverdraftEnsurePdfLibs();
    };
    if ('requestIdleCallback' in window)
      window.requestIdleCallback(warm, { timeout: 4000 });
    else
      setTimeout(warm, 1500);
  });
})();
