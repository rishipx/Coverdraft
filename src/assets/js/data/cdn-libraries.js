/* Third-party scripts loaded from cdnjs, pinned to exact versions.
 * `integrity` holds the Subresource Integrity hash; run `npm run sri` (needs internet) to fill or refresh it.
 * Browsers refuse to run a script whose content does not match its hash. An empty value skips the check. */
const CDN_LIBRARIES = {
  html2canvas: { url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H' },
  jspdf: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk' },
  'pdf-lib': { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI' },
  mammoth: { url: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/mammoth.browser.min.js', integrity: 'sha384-8NWE3bZDrmRI4IePMoQaEoLhAQ1MmRMJkdNgnGiHRFanTqsFKr0TmK6aSZvFJ/PO' }
};

/* Appends a <script> for a CDN library, with its integrity hash when one is recorded. */
function createCdnScript(name) {
  const library = CDN_LIBRARIES[name];
  const script = document.createElement('script');
  script.src = library.url;
  script.async = true;
  if (library.integrity) {
    script.integrity = library.integrity;
    script.crossOrigin = 'anonymous';
  }
  return script;
}
