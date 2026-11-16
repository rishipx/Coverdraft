(function () {
  'use strict';
  const LSX = window.coverdraftStorage;
  const q = id => document.getElementById(id);
  const PROFILE_KEY = 'coverdraft_student_v1', HISTORY_KEY = 'coverdraft_recent_v1', TYPE_KEY = 'coverdraft_assignment_type_v1', SEM_KEY = 'coverdraft_semester_setup_v1';
  let pendingParsedExperiments = [];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const profile = () => LSX.get(PROFILE_KEY, {});
  function saveProfileFromQuick() {
    const p = profile();
    const map = { name: 'qsName', roll: 'qsRoll', rollNo: 'qsRoll', registration: 'qsReg', regNo: 'qsReg', section: 'qsSection', branch: 'qsBranch', session: 'qsSession' };
    Object.entries(map).forEach(([k, id]) => {
      const v = (q(id)?.value || '').trim();
      if (v)
        p[k] = v;
    });
    LSX.set(PROFILE_KEY, p);
    return p;
  }
  function fillQuickProfile() {
    const p = profile();
    const map = { name: 'qsName', roll: 'qsRoll', rollNo: 'qsRoll', registration: 'qsReg', regNo: 'qsReg', section: 'qsSection', branch: 'qsBranch', session: 'qsSession' };
    Object.entries(map).forEach(([k, id]) => {
      if (q(id))
        q(id).value = p[k] || '';
    });
  }
  function currentSubjects(uni, sem) {
    return (((typeof UNIVERSITY_SEMESTER_COURSES !== 'undefined' ? UNIVERSITY_SEMESTER_COURSES : {}))[uni] || {})[sem] || [];
  }
  function populateQSSubjects() {
    const uni = q('qsUniversity').value, sem = q('qsSemester').value, list = currentSubjects(uni, sem), sel = q('qsSubject');
    sel.innerHTML = '';
    if (!list.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'Other course…';
      sel.appendChild(o);
      return;
    }
    list.forEach((s, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = s.title;
      o.dataset.code = s.code;
      sel.appendChild(o);
    });
  }
  function getSelectedQSSubject() {
    const sel = q('qsSubject'), uni = q('qsUniversity').value, sem = q('qsSemester').value, list = currentSubjects(uni, sem), i = parseInt(sel.value, 10);
    return list[i] || { code: '', title: '', department: '' };
  }
  function parseInstructions(text) {
    const out = { experiments: [] };
    const t = text || '';
    const pick = (re) => {
      const m = t.match(rei(re));
      return m ? m[1].trim() : '';
    };
    function rei(x) {
      return new RegExp(x, 'i');
    }
    out.prof = pick('\\b(?:faculty|professor|teacher|instructor|sir|ma\\.?am)\\b\\s*[:\\-]?\\s*([^\\n|]+)');
    out.sem = pick('\\b(?:semester|sem)\\b\\s*[:\\-]?\\s*([1-8](?:st|nd|rd|th)?)') || pick('\\b([1-8](?:st|nd|rd|th))\\s*(?:semester|sem)\\b');
    out.code = pick('\\b(?:course\\s*code|subject\\s*code|code)\\b\\s*[:\\-]?\\s*([A-Za-z0-9._/-]+)');
    out.assignment = pick('\\b(?:assignment|lab|practical|experiment)\\b\\s*(?:no\\.?|number|#)?\\s*[:\\-]?\\s*([A-Za-z0-9 ._-]{1,40})');
    const lines = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^(?:\d+[.)\-]|(?:exp(?:eriment)?)[ .#:-]*\d*)\s+/i.test(line)) {
        const x = line.replace(/^\s*(?:\d+[.)\-]|(?:exp(?:eriment)?)[ .#:-]*\d*)\s*/i, '').trim();
        if (x)
          out.experiments.push(x);
      }
    }
    if (!out.experiments.length) {
      for (const line of lines) {
        if (/(?:implement|study|design|write|calculate|analy[sz]e|develop|perform|find|create|construct)/i.test(line) && line.length < 180)
          out.experiments.push(line.replace(/^[-*•]\s*/, '').trim());
      }
    }
    out.title = pick('\\b(?:subject|course|paper)\\b(?!\\s*code)\\s*[:\\-]?\\s*([^\\n|]+)');
    return out;
  }
  function showParse(d) {
    const p = q('qsParsePreview');
    const tags = [];
    if (d.title)
      tags.push('Subject: ' + d.title);
    if (d.prof)
      tags.push('Faculty: ' + d.prof);
    if (d.sem)
      tags.push('Semester: ' + d.sem);
    if (d.code)
      tags.push('Code: ' + d.code);
    if (d.experiments.length)
      tags.push(d.experiments.length + ' experiments');
    p.innerHTML = tags.length ? '<div class="parse-tags">' + tags.map(x => '<span class="parse-tag">' + esc(x) + '</span>').join('') + '</div>' : 'Nothing obvious detected — you can still create manually.';
    p.classList.add('show');
  }
  function applyParsed(d) {
    if (d.prof)
      q('qsProfessor').value = d.prof;
    if (d.assignment)
      q('qsTaskTitle').value = d.assignment;
    if (d.sem) {
      const sem = [...q('qsSemester').options].find(o => o.value.toLowerCase() === d.sem.toLowerCase() || o.textContent.toLowerCase().startsWith(d.sem.toLowerCase()));
      if (sem) {
        q('qsSemester').value = sem.value;
        populateQSSubjects();
      }
    }
    pendingParsedExperiments = Array.isArray(d.experiments) ? d.experiments.map(x => String(x).trim()).filter(Boolean) : [];
    if (d.title) {
      const sel = q('qsSubject');
      const opts = [...sel.options];
      const hit = opts.find(o => o.textContent.toLowerCase().includes(d.title.toLowerCase()) || d.title.toLowerCase().includes(o.textContent.toLowerCase()));
      if (hit)
        sel.value = hit.value;
    }
  }
  function renderRecent() {
    const box = q('qsRecent');
    const h = LSX.get(HISTORY_KEY, []);
    box.innerHTML = '';
    if (!h.length) {
      box.innerHTML = '<div class="recent-empty">No recent assignments yet. Your next one will appear here.</div>';
      return;
    }
    h.slice(0, 8).forEach((r, idx) => {
      const el = document.createElement('div');
      el.className = 'recent-item';
      el.innerHTML = '<div class="recent-main"><div class="recent-title">' + esc(r.title || r.subject || 'Untitled') + '</div><div class="recent-meta">' + esc(r.sem || '') + ' · ' + esc(r.uniName || r.uni || '') + ' · ' + new Date(r.updatedAt).toLocaleDateString() + '</div></div><div class="recent-actions"><button class="btn btn-secondary" data-open="' + idx + '" style="font-size:10px;padding:4px 7px">Open</button><button class="btn btn-secondary" data-dup="' + idx + '" style="font-size:10px;padding:4px 7px">Duplicate</button></div>';
      box.appendChild(el);
    });
    box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openRecent(parseInt(b.dataset.open, 10)));
    box.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => openRecent(parseInt(b.dataset.dup, 10)));
  }
  function recordRecent(extra) {
    const h = LSX.get(HISTORY_KEY, []);
    const item = { ...extra, updatedAt: Date.now() };
    const key = item.uni + ':' + item.code;
    const filtered = h.filter(x => x.uni + ':' + x.code !== key);
    filtered.unshift(item);
    LSX.set(HISTORY_KEY, filtered.slice(0, 15));
    renderRecent();
  }
  function openRecent(i) {
    const h = LSX.get(HISTORY_KEY, []), r = h[i];
    if (!r)
      return;
    if (typeof loadUniversityPreset === 'function' && r.uni) {
      q('uniPresetSelect').value = r.uni;
      loadUniversityPreset(r.uni);
    }
    if (r.form && typeof currentFormData !== 'undefined')
      Object.assign(currentFormData, r.form);
    if (r.type)
      LSX.set(TYPE_KEY, r.type);
    if (typeof renderDynamicForm === 'function')
      renderDynamicForm(r.uni || DEFAULT_UNIVERSITY_ID);
    if (typeof window.applyBatchSubject === 'function' && r.code)
      window.applyBatchSubject(encodeURIComponent(JSON.stringify({ code: r.code, title: r.title, department: r.department || '' })), r.sem || '6th', r.uni || DEFAULT_UNIVERSITY_ID);
    q('studentQuickStart').classList.remove('open');
    document.body.classList.add('student-quick');
    if (typeof renderPageCanvas === 'function')
      renderPageCanvas();
  }
  function assignmentType() {
    return LSX.get(TYPE_KEY, 'lab');
  }
  function configureType(type) {
    LSX.set(TYPE_KEY, type);
    document.querySelectorAll('.qs-type').forEach(x => x.classList.toggle('active', x.dataset.type === type));
  }
  function syncQSFromApp() {
    const p = profile();
    q('qsName').value = p.name || '';
    q('qsRoll').value = p.roll || p.rollNo || '';
    q('qsReg').value = p.registration || p.regNo || '';
    q('qsSection').value = p.section || '';
    q('qsBranch').value = p.branch || '';
    q('qsSession').value = p.session || '';
    q('qsUniversity').value = typeof currentUniKey !== 'undefined' ? currentUniKey : DEFAULT_UNIVERSITY_ID;
    q('qsSemester').value = typeof currentFormData !== 'undefined' && currentFormData.sem ? currentFormData.sem : '6th';
    populateQSSubjects();
    if (typeof currentFormData !== 'undefined') {
      q('qsProfessor').value = currentFormData.prof || '';
      q('qsTaskTitle').value = currentFormData.taskNo || '';
    }
    configureType(assignmentType());
  }
  function openQS(compact = false) {
    syncQSFromApp();
    renderRecent();
    const overlay = q('studentQuickStart');
    overlay.classList.toggle('profile-mode', compact);
    // The compact "Add student profile" panel opens where its menu was: under the More actions button.
    overlay.style.removeProperty('--qs-top');
    overlay.style.removeProperty('--qs-right');
    const anchor = q('moreMenuBtn')?.getBoundingClientRect();
    if (compact && anchor && anchor.width > 0) {
      const cardWidth = Math.min(440, window.innerWidth - 24);
      const right = Math.max(12, Math.min(window.innerWidth - anchor.right, window.innerWidth - cardWidth - 12));
      overlay.style.setProperty('--qs-top', `${Math.round(anchor.bottom + 8)}px`);
      overlay.style.setProperty('--qs-right', `${Math.round(right)}px`);
    }
    if (compact) {
      q('qsTitle').textContent = 'Add student profile';
      q('qsName').value = '';
      q('qsRoll').value = '';
      q('qsReg').value = '';
      q('qsSection').value = '';
      q('qsBranch').value = '';
      q('qsSession').value = '';
    } else {
      q('qsTitle').textContent = 'Student profiles & assignment setup';
    }
    q('studentQuickStart').classList.add('open');
    setTimeout(() => q(compact ? 'qsName' : 'qsName').focus(), 30);
  }
  function applyTypePages(type) {
    const wanted = { lab: ['cover', 'index'], practical: ['cover', 'index'], record: ['cover', 'index'], assignment: ['cover'], project: ['cover', 'index'], seminar: ['cover'] };
    const arr = wanted[type] || wanted.lab;
    const rows = q('pageRows');
    if (rows) {
      rows.querySelectorAll('[data-pg]').forEach(r => {
        const cb = r.querySelector('input');
        if (cb)
          cb.checked = arr.includes(r.dataset.pg);
      });
      window.coverdraftSavePageManager?.();
    }
  }
  function createFromQS() {
    const p = saveProfileFromQuick(), sub = getSelectedQSSubject(), uni = q('qsUniversity').value, sem = q('qsSemester').value;
    LSX.set('coverdraft_onboarded_v1', true);
    configureType(document.querySelector('.qs-type.active')?.dataset.type || 'lab');
    if (typeof loadUniversityPreset === 'function' && uni !== currentUniKey) {
      q('uniPresetSelect').value = uni;
      loadUniversityPreset(uni);
    }
    if (typeof window.applyBatchSubject === 'function' && sub.code)
      window.applyBatchSubject(encodeURIComponent(JSON.stringify(sub)), sem, uni);
    const map = { name: p.name, roll: p.roll || p.rollNo, registration: p.registration || p.regNo, section: p.section, branch: p.branch, session: p.session, prof: q('qsProfessor').value.trim() };
    Object.entries(map).forEach(([k, v]) => {
      if (v != null)
        window.coverdraftSetField(k, v);
    });
    const task = q('qsTaskTitle').value.trim();
    if (task)
      window.coverdraftSetField('taskNo', task);
    applyTypePages(assignmentType());
    if (pendingParsedExperiments.length && typeof window.coverdraftAppendIndexEntries === 'function') {
      window.coverdraftAppendIndexEntries(pendingParsedExperiments);
      pendingParsedExperiments = [];
    }
    recordRecent({ uni, uniName: q('qsUniversity').selectedOptions[0]?.textContent, sem, code: sub.code, title: sub.title || q('qsTaskTitle').value, department: sub.department, type: assignmentType(), form: typeof currentFormData !== 'undefined' ? { ...currentFormData } : null, experiments: typeof experimentsList !== 'undefined' ? JSON.parse(JSON.stringify(experimentsList)) : [] });
    q('studentQuickStart').classList.remove('open');
    document.body.classList.add('student-quick');
    if (typeof renderPageCanvas === 'function')
      renderPageCanvas();
    if (typeof showToast === 'function')
      showToast('Assignment ready — review and download.');
  }
  function openSemester() {
    const uni = q('qsUniversity').value || currentUniKey || DEFAULT_UNIVERSITY_ID, sem = q('qsSemester').value || '6th', list = currentSubjects(uni, sem), box = q('semesterSubjectGrid');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div class="recent-empty">No preset subjects for this semester. Use Change course to add one.</div>';
      return;
    }
    list.forEach((s, i) => {
      const d = document.createElement('label');
      d.className = 'semester-sub';
      d.innerHTML = '<input type="checkbox" checked data-i="' + i + '"><div><strong>' + esc(s.title) + '</strong><small>' + esc(s.code) + '</small></div>';
      box.appendChild(d);
    });
    q('semesterPrepModal').style.display = 'flex';
  }
  function saveSemester() {
    const uni = q('qsUniversity').value || currentUniKey || DEFAULT_UNIVERSITY_ID, sem = q('qsSemester').value || '6th', list = currentSubjects(uni, sem), chosen = [...q('semesterSubjectGrid').querySelectorAll('input:checked')].map(x => list[+x.dataset.i]).filter(Boolean);
    LSX.set(SEM_KEY, { uni, sem, subjects: chosen });
    chosen.forEach(s => recordRecent({ uni, uniName: q('qsUniversity').selectedOptions[0]?.textContent, sem, code: s.code, title: s.title, department: s.department, type: 'lab', form: null, experiments: [] }));
    q('semesterPrepModal').style.display = 'none';
    showToast && showToast(chosen.length + ' subjects saved for semester prep');
  }
  function getSavedProfiles() {
    try {
      return JSON.parse(localStorage.getItem('coverdraft_profiles_v1') || '[]').filter(p => p && p.id && p.name);
    } catch (e) {
      return [];
    }
  }
  function refreshProfileSwitcher() {
    const sel = q('studentProfileSwitchSelect');
    if (!sel)
      return;
    const profiles = getSavedProfiles();
    const active = localStorage.getItem('coverdraft_active_profile_v1') || '';
    sel.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = profiles.length ? 'Choose a profile…' : 'No saved profiles yet';
    sel.appendChild(first);
    profiles.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = profiles.some(p => p.id === active) ? active : '';
    const del = q('deleteSwitcherProfileBtn');
    if (del) {
      del.hidden = !sel.value;
      del.disabled = !sel.value;
    }
  }
  async function deleteSwitcherProfile() {
    const sel = q('studentProfileSwitchSelect');
    const id = sel?.value;
    if (!id)
      return;
    const profiles = getSavedProfiles();
    const chosen = profiles.find(p => p.id === id);
    if (!chosen)
      return;
    const confirmed = await window.coverdraftConfirm({ title: 'Delete student profile?', message: `The saved profile “${chosen.name}” will be deleted. This cannot be undone.`, confirmLabel: 'Delete', danger: true, skipKey: 'delete-profile' });
    if (!confirmed)
      return;
    const remaining = profiles.filter(p => p.id !== id);
    try {
      localStorage.setItem('coverdraft_profiles_v1', JSON.stringify(remaining));
      if (localStorage.getItem('coverdraft_active_profile_v1') === id)
        localStorage.removeItem('coverdraft_active_profile_v1');
    } catch (e) { }
    refreshProfileSwitcher();
    if (typeof showToast === 'function')
      showToast('Deleted profile: ' + chosen.name);
  }
  function applySwitcherProfile(id) {
    if (!id)
      return;
    let profiles = [];
    try {
      profiles = JSON.parse(localStorage.getItem('coverdraft_profiles_v1') || '[]');
    } catch (e) { }
    const chosen = profiles.find(p => p.id === id);
    if (!chosen)
      return;
    Object.entries(chosen.fields || {}).forEach(([field, value]) => {
      const input = q('field_' + field);
      if (!input)
        return;
      input.value = String(value ?? '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    try {
      localStorage.setItem('coverdraft_active_profile_v1', id);
    } catch (e) { }
    if (typeof renderPageCanvas === 'function')
      renderPageCanvas();
    if (typeof scheduleAutoCompile === 'function')
      scheduleAutoCompile();
    if (typeof showToast === 'function')
      showToast('Applied ' + chosen.name);
  }
  function bootProductivity() {
    // Keep the quick-workflow class aligned with the selected editor mode. Adding this class
    // unconditionally used to force-hide the Design panel even after switching to Studio.
    document.body.classList.toggle('student-quick', !(q('advancedModeSwitch')?.checked));
    const wm = q('welcomeModal');
    if (wm && wm.style.display === 'flex' && !Object.keys(profile()).length)
      wm.style.display = 'none';
    q('studentDashboardBar').style.display = 'flex';
    q('studentProfileSwitchSelect').onchange = e => {
      const del = q('deleteSwitcherProfileBtn');
      if (del) {
        del.hidden = !e.target.value;
        del.disabled = !e.target.value;
      }
      applySwitcherProfile(e.target.value);
    };
    q('deleteSwitcherProfileBtn').onclick = deleteSwitcherProfile;
    q('addStudentProfileBtn').onclick = () => openQS(true);
    // The switcher lives at the top of the More menu; refresh its list each time the menu opens.
    q('moreMenuBtn')?.addEventListener('click', refreshProfileSwitcher);
    q('quickStartBtn').onclick = () => openQS(false);
    q('semesterPrepBtn').onclick = openSemester;
    q('qsClose').onclick = () => q('studentQuickStart').classList.remove('open');
    q('studentQuickStart').addEventListener('click', e => {
      if (e.target === q('studentQuickStart'))
        q('studentQuickStart').classList.remove('open');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && q('studentQuickStart').classList.contains('open'))
        q('studentQuickStart').classList.remove('open');
    });
    q('qsProfileOnly').onclick = () => {
      const name = (q('qsName').value || '').trim();
      if (!name) {
        q('qsName').focus();
        showToast && showToast('Enter the student name first');
        return;
      }
      let profiles = [];
      try {
        profiles = JSON.parse(localStorage.getItem('coverdraft_profiles_v1') || '[]');
      } catch (e) { }
      const fields = {};
      const values = { name, roll: (q('qsRoll').value || '').trim(), registration: (q('qsReg').value || '').trim(), section: (q('qsSection').value || '').trim(), branch: (q('qsBranch').value || '').trim(), session: (q('qsSession').value || '').trim() };
      const ids = (typeof UNI_CONFIGS !== 'undefined' && ((UNI_CONFIGS[currentUniKey] || UNI_CONFIGS[DEFAULT_UNIVERSITY_ID])?.fields || []).filter(f => f.group === 'student').map(f => f.id)) || [];
      ids.forEach(id => {
        const key = /roll/i.test(id) ? 'roll' : /reg/i.test(id) ? 'registration' : /section/i.test(id) ? 'section' : /branch|department/i.test(id) ? 'branch' : /session|year/i.test(id) ? 'session' : /name/i.test(id) ? 'name' : null;
        if (key && values[key])
          fields[id] = values[key];
      });
      if (!Object.keys(fields).length)
        Object.assign(fields, values);
      const id = (window.crypto?.randomUUID && window.crypto.randomUUID()) || ('profile-' + Date.now());
      profiles.push({ id, name, fields, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      try {
        localStorage.setItem('coverdraft_profiles_v1', JSON.stringify(profiles));
        localStorage.setItem('coverdraft_active_profile_v1', id);
      } catch (e) { }
      refreshProfileSwitcher();
      const sw = q('studentProfileSwitchSelect');
      if (sw)
        sw.value = id;
      q('studentQuickStart').classList.remove('open');
      saveProfileFromQuick();
      showToast && showToast('Saved profile: ' + name);
    };
    q('qsCreate').onclick = createFromQS;
    q('qsSemesterPrep').onclick = openSemester;
    q('qsParseBtn').onclick = () => {
      const d = parseInstructions(q('qsInstructionBox').value);
      showParse(d);
      applyParsed(d);
    };
    q('qsUniversity').onchange = () => {
      populateQSSubjects();
    };
    q('qsSemester').onchange = () => {
      populateQSSubjects();
    };
    document.querySelectorAll('.qs-type').forEach(b => b.onclick = () => configureType(b.dataset.type));
    q('closeSemesterPrep').onclick = () => q('semesterPrepModal').style.display = 'none';
    q('semesterPrepare').onclick = saveSemester;
    q('semesterSelectAll').onclick = () => q('semesterSubjectGrid').querySelectorAll('input').forEach(x => x.checked = true);
    q('qsRecent').addEventListener('click', () => { });
    // Keep the simplified workflow as the default.
    const adv = q('advancedModeSwitch');
    if (adv) {
      adv.addEventListener('change', () => {
        if (adv.checked)
          document.body.classList.remove('student-quick');
        else
          document.body.classList.add('student-quick');
      });
    }
    fillQuickProfile();
    populateQSSubjects();
    refreshProfileSwitcher();
    const pp = profile();
    q('dashboardStudentName').textContent = pp.name || 'Not set';
    q('dashboardCourseName').textContent = (typeof currentFormData !== 'undefined' && currentFormData.title) || 'New assignment';
    syncQSFromApp();
  }
  window.addEventListener('load', () => setTimeout(bootProductivity, 120));
})();
