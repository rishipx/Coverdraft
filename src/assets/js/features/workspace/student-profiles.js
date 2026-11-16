/* Reusable named student profiles. Only student fields are stored in a profile. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { get: safeGet, set: safeSet } = window.coverdraftStorage;
  const PROFILES_KEY = 'coverdraft_profiles_v1';
  const ACTIVE_PROFILE_KEY = 'coverdraft_active_profile_v1';
  function currentStudentFieldIds() {
    const config = (typeof UNI_CONFIGS !== 'undefined' && UNI_CONFIGS[currentUniKey]) || (typeof UNI_CONFIGS !== 'undefined' && UNI_CONFIGS[DEFAULT_UNIVERSITY_ID]);
    return (config?.fields || []).filter((field) => field.group === 'student').map((field) => field.id);
  }
  function getProfiles() {
    const entries = safeGet(PROFILES_KEY, []);
    return Array.isArray(entries) ? entries.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.fields && typeof p.fields === 'object') : [];
  }
  function saveProfiles(entries) {
    if (!safeSet(PROFILES_KEY, entries)) {
      showToast('Could not save profiles. Check browser storage.', false);
      return false;
    }
    return true;
  }
  function snapshotStudentFields() {
    const result = {};
    currentStudentFieldIds().forEach((id) => {
      result[id] = String(currentFormData[id] ?? $('field_' + id)?.value ?? '');
    });
    return result;
  }
  function refreshProfiles(selectedId) {
    const select = $('profileSelect');
    if (!select)
      return;
    const profiles = getProfiles();
    const remembered = selectedId !== undefined ? selectedId : (select.value || safeGet(ACTIVE_PROFILE_KEY, ''));
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = profiles.length ? 'Choose a student profile…' : 'No saved profiles yet';
    select.appendChild(placeholder);
    profiles.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      select.appendChild(option);
    });
    select.value = profiles.some((p) => p.id === remembered) ? remembered : '';
    const chosen = profiles.find((p) => p.id === select.value);
    if ($('profileNameInput') && chosen)
      $('profileNameInput').value = chosen.name;
    if ($('profileCount'))
      $('profileCount').textContent = `${profiles.length} saved`;
    ['applyStudentProfileBtn', 'updateStudentProfileBtn', 'deleteStudentProfileBtn'].forEach((id) => {
      if ($(id))
        $(id).disabled = !chosen;
    });
    if (!chosen && $('profileNameInput') && !select.value)
      $('profileNameInput').value = '';
  }
  function applyStudentProfile(profile) {
    if (!profile)
      return showToast('Choose a profile first', false);
    const ids = new Set(currentStudentFieldIds());
    let changed = 0;
    Object.entries(profile.fields || {}).forEach(([id, value]) => {
      if (!ids.has(id))
        return;
      const input = $('field_' + id);
      if (!input)
        return;
      input.value = String(value ?? '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      changed++;
    });
    safeSet(ACTIVE_PROFILE_KEY, profile.id);
    if (typeof renderPageCanvas === 'function')
      renderPageCanvas();
    if (typeof scheduleAutoCompile === 'function')
      scheduleAutoCompile();
    showToast(changed ? `Applied ${profile.name}` : 'No matching student fields in this university format', changed > 0);
  }
  function currentProfileById() {
    const id = $('profileSelect')?.value;
    return getProfiles().find((p) => p.id === id);
  }
  $('profileSelect')?.addEventListener('change', () => {
    const chosen = currentProfileById();
    if (chosen)
      safeSet(ACTIVE_PROFILE_KEY, chosen.id);
    refreshProfiles(chosen?.id || '');
  });
  $('saveProfileAsBtn')?.addEventListener('click', () => {
    const name = ($('profileNameInput')?.value || '').trim();
    if (!name) {
      $('profileNameInput')?.focus();
      return showToast('Enter a name for this profile', false);
    }
    const profiles = getProfiles();
    if (profiles.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return showToast('A profile with that name already exists. Use Update instead.', false);
    const id = (window.crypto?.randomUUID && window.crypto.randomUUID()) || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    profiles.push({ id, name: name.slice(0, 60), fields: snapshotStudentFields(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    if (saveProfiles(profiles)) {
      safeSet(ACTIVE_PROFILE_KEY, id);
      refreshProfiles(id);
      showToast(`Saved profile: ${name}`);
    }
  });
  $('applyStudentProfileBtn')?.addEventListener('click', () => applyStudentProfile(currentProfileById()));
  $('updateStudentProfileBtn')?.addEventListener('click', () => {
    const chosen = currentProfileById();
    if (!chosen)
      return;
    const name = ($('profileNameInput')?.value || '').trim();
    if (!name)
      return showToast('Enter a profile name', false);
    const profiles = getProfiles();
    if (profiles.some((p) => p.id !== chosen.id && p.name.toLowerCase() === name.toLowerCase()))
      return showToast('Another profile already uses that name', false);
    const updated = profiles.map((p) => p.id === chosen.id ? { ...p, name: name.slice(0, 60), fields: snapshotStudentFields(), updatedAt: new Date().toISOString() } : p);
    if (saveProfiles(updated)) {
      refreshProfiles(chosen.id);
      showToast('Student profile updated');
    }
  });
  $('deleteStudentProfileBtn')?.addEventListener('click', () => {
    const chosen = currentProfileById();
    if (!chosen)
      return;
    const profiles = getProfiles().filter((p) => p.id !== chosen.id);
    if (saveProfiles(profiles)) {
      safeSet(ACTIVE_PROFILE_KEY, '');
      refreshProfiles('');
      showToast(`Deleted profile: ${chosen.name}`);
    }
  });
  window.addEventListener('load', () => refreshProfiles());
})();
