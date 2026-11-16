/* Share a class preset (subjects, index rows and design, without student details) and open a class link. */
(function () {
  const $ = id => document.getElementById(id), LS = window.coverdraftStorage;
  const { expStore, saveExp, loadExp, subjects, setField, applyProfile } = window.coverdraftSubjectState;
  function rebind(id, fn) {
    const b = $(id), n = b.cloneNode(true);
    b.replaceWith(n);
    n.addEventListener('click', fn);
  }
  // Share a class preset without student details
  rebind('sharePresetBtn', () => {
    saveExp();
    const uni = currentUniKey, sem = currentFormData.sem, subs = subjects(), pm = LS.get('coverdraft_prof_v1', {}), exps = {}, profs = {};
    if (!subs.length)
      return showToast('Pick a semester with subjects first', false);
    subs.forEach(x => {
      const k = uni + ':' + x.code;
      if (expStore[k] && expStore[k].some(r => r.title))
        exps[k] = expStore[k];
      if (pm[k])
        profs[k] = pm[k];
    });
    const url = location.href.split('#')[0] + '#class=' + btoa(encodeURIComponent(JSON.stringify({ uni, sem, subs, exps, profs })));
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => showToast('Class link copied. It has no personal details.')).catch(() => fallbackCopy(url));
  });
  window.coverdraftLoadClassFromLink = loadClass;
  function loadClass() {
    const m = location.hash.match(/^#class=(.+)$/);
    if (!m)
      return false;
    try {
      // A class link is untrusted input: validate every field before it reaches the catalog,
      // the index store or any innerHTML-built dialog.
      const raw = JSON.parse(decodeURIComponent(atob(m[1])));
      const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
      if (!raw || typeof raw !== 'object' || typeof raw.uni !== 'string' || !own(UNI_CONFIGS, raw.uni) || !/^[1-8](?:st|nd|rd|th)$/.test(String(raw.sem)) || !Array.isArray(raw.subs))
        return false;
      const str = (v, n) => String(v ?? '').slice(0, n);
      const subs = raw.subs.slice(0, 60).filter(x => x && typeof x === 'object' && x.code && x.title)
        .map(x => ({ code: str(x.code, 40), title: str(x.title, 100), department: str(x.department || 'Department of Computer Science Engineering', 120) }));
      if (!subs.length)
        return false;
      const knownKeys = new Set(subs.map(x => raw.uni + ':' + x.code));
      const exps = {}, profs = {};
      Object.entries(raw.exps && typeof raw.exps === 'object' ? raw.exps : {}).forEach(([k, v]) => {
        if (knownKeys.has(k) && Array.isArray(v))
          exps[k] = v.slice(0, 250).map((r, i) => ({ no: i + 1, title: str(r?.title, 300), page: str(r?.page, 40), date: str(r?.date, 40) }));
      });
      Object.entries(raw.profs && typeof raw.profs === 'object' ? raw.profs : {}).forEach(([k, v]) => {
        if (knownKeys.has(k) && typeof v === 'string')
          profs[k] = str(v, 120);
      });
      const d = { uni: raw.uni, sem: String(raw.sem), subs, exps, profs };
      if (d.uni !== currentUniKey) {
        $('uniPresetSelect').value = d.uni;
        loadUniversityPreset(d.uni);
      }
      const cat = UNIVERSITY_SEMESTER_COURSES[d.uni] = UNIVERSITY_SEMESTER_COURSES[d.uni] || {}, have = cat[d.sem] = cat[d.sem] || [];
      d.subs.forEach(x => {
        if (!have.some(h => h.code === x.code))
          have.push(x);
      });
      currentFormData.sem = d.sem;
      setField('sem', d.sem);
      window.applyBatchSubject(encodeURIComponent(JSON.stringify(d.subs[0])), d.sem, d.uni);
      Object.entries(d.exps).forEach(([k, v]) => {
        if (!(expStore[k] || []).some(r => r.title))
          expStore[k] = v;
      });
      const pm = LS.get('coverdraft_prof_v1', {});
      Object.assign(pm, d.profs, pm);
      LS.set('coverdraft_prof_v1', pm);
      LS.set('coverdraft_exp_v1', expStore);
      loadExp();
      applyProfile();
      history.replaceState(null, '', location.pathname + location.search);
      LS.set('coverdraft_onboarded_v1', true);
      showToast('Class set-up loaded. Add your own details once.');
      document.querySelector('#dynamicStudentFieldsContainer input')?.focus();
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }
})();
