/* App-level extras: wrong-format feedback, install and offline support, and first-run setup. */
(function () {
  const $ = id => document.getElementById(id), LS = window.coverdraftStorage;
  const cfg = () => UNI_CONFIGS[currentUniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID];
  const { expStore, key, saveExp, loadExp, setField } = window.coverdraftSubjectState;
  // Format feedback
  const REPORT_URL = window.COVERDRAFT_CONFIG?.reportUrl || 'https://github.com/rishipx/Coverdraft/issues';
  $('reportFmtBtn').onclick = () => {
    const t = `Coverdraft format report\nUniversity: ${cfg().name} (${currentUniKey})\nPage: ${currentPageKey}\nWhat is wrong: `;
    // Best effort: copy the details so they can be pasted into the new issue.
    try { navigator.clipboard?.writeText(t).catch(() => {}); } catch (e) { /* clipboard unavailable */ }
    window.open(REPORT_URL, '_blank', 'noopener,noreferrer');
    showToast('GitHub Issues opened. Report details copied to paste.');
  };
  // App installation and offline support
  let ip = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    ip = e;
    $('installBtn').style.display = 'block';
  });
  $('installBtn').onclick = () => {
    if (ip) {
      ip.prompt();
      ip = null;
      $('installBtn').style.display = 'none';
    }
  };
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol))
    navigator.serviceWorker.register('sw.js').catch(() => { });
  // first-run setup
  addEventListener('load', () => {
    const cls = window.coverdraftLoadClassFromLink();
    const hasExp = expStore[key()];
    if (hasExp)
      loadExp();
    else
      saveExp();
    window.refreshSubjectShortcutBar();
    if (!cls && !LS.get('coverdraft_onboarded_v1', false) && !Object.keys(LS.get('coverdraft_student_v1', {})).length) {
      $('wUni').innerHTML = [...$('uniPresetSelect').options].filter(o => UNI_CONFIGS[o.value]).map(o => `<option value="${o.value}">${o.dataset.long || o.text}</option>`).join('');
      $('wSem').innerHTML = $('batchSemSelect').innerHTML;
      $('wUni').value = currentUniKey;
      $('wSem').value = currentFormData.sem || '6th';
      $('welcomeModal').style.display = 'flex';
      $('wGo').onclick = () => {
        const u = $('wUni').value, sm = $('wSem').value;
        $('uniPresetSelect').value = u;
        loadUniversityPreset(u);
        currentFormData.sem = sm;
        setField('sem', sm);
        LS.set('coverdraft_onboarded_v1', true);
        $('welcomeModal').style.display = 'none';
        window.refreshSubjectShortcutBar();
        const first = [...document.querySelectorAll('#dynamicStudentFieldsContainer input')].find(i => !i.value) || document.querySelector('#dynamicStudentFieldsContainer input');
        first?.focus();
      };
    }
  });
})();
