/* Per-subject state: experiment rows are kept separately for every subject, and student details are applied when a subject is selected. */
(function () {
  const $ = id => document.getElementById(id), LS = window.coverdraftStorage;
  const cfg = () => UNI_CONFIGS[currentUniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID];
  const studentIds = () => cfg().fields.filter(f => f.group === 'student').map(f => f.id);
  const key = () => currentUniKey + ':' + currentFormData.code;
  const blankExp = () => [{ no: 1, title: '', page: '', date: '' }];
  let expStore = LS.get('coverdraft_exp_v1', {});
  const saveExp = () => {
    expStore[key()] = experimentsList;
    LS.set('coverdraft_exp_v1', expStore);
  };
  window.coverdraftSaveExp = () => saveExp();
  const loadExp = () => {
    experimentsList = expStore[key()] || blankExp();
    renderExperimentsPanel();
    if (currentPageKey === 'index')
      renderPageCanvas();
  };
  const subjects = () => ((UNIVERSITY_SEMESTER_COURSES[currentUniKey] || {})[currentFormData.sem]) || [];
  // student details: autosave + restore, smart defaults
  function setField(id, v) {
    const el = $('field_' + id);
    if (el && v != null && el.value !== v) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  window.coverdraftSetField = setField;
  function applyProfile() {
    const p = LS.get('coverdraft_student_v1', {});
    studentIds().forEach(id => {
      if (p[id])
        setField(id, p[id]);
    });
    const y = new Date().getFullYear(), m = new Date().getMonth();
    const sess = m >= 6 ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : `${y - 1}-${String(y % 100).padStart(2, '0')}`;
    if ($('field_session') && !$('field_session').value)
      setField('session', sess);
    const prof = LS.get('coverdraft_prof_v1', {})[key()];
    if (prof)
      setField('prof', prof);
  }
  const _rdf = renderDynamicForm;
  renderDynamicForm = function (k) {
    _rdf(k);
    applyProfile();
    window.refreshSubjectShortcutBar();
  };
  $('dynamicStudentFieldsContainer').addEventListener('input', e => {
    const id = e.target.dataset.id;
    if (!id)
      return;
    const p = LS.get('coverdraft_student_v1', {});
    p[id] = e.target.value;
    LS.set('coverdraft_student_v1', p);
  });
  $('dynamicStudentFieldsContainer').addEventListener('focusout', e => {
    if (e.target.dataset.id === 'name') {
      const v = e.target.value.trim();
      if (v && (v === v.toLowerCase() || v === v.toUpperCase()))
        setField('name', v.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()));
    }
  });
  $('dynamicCourseFieldsContainer').addEventListener('input', e => {
    if (e.target.dataset.id === 'prof') {
      const m = LS.get('coverdraft_prof_v1', {});
      m[key()] = e.target.value;
      LS.set('coverdraft_prof_v1', m);
    }
  });
  // subject switching keeps a separate experiment list per subject
  const _abs = window.applyBatchSubject;
  window.applyBatchSubject = function (enc, sem, uni) {
    saveExp();
    _abs(enc, sem, uni);
    loadExp();
    applyProfile();
    window.refreshSubjectShortcutBar();
  };
  $('experimentsListWrap').addEventListener('input', () => {
    clearTimeout(window._ex);
    window._ex = setTimeout(saveExp, 400);
  });
  window.addEventListener('beforeunload', saveExp);
  window.coverdraftSubjectState = { expStore, key, saveExp, loadExp, subjects, setField, applyProfile };
})();
