/* Shared localStorage helpers. Reads fall back to a default when a value is missing, malformed or the
 * storage is blocked; writes report success instead of throwing. */
(function () {
  'use strict';

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) ?? fallback);
    } catch (_) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  window.coverdraftStorage = Object.freeze({ get, set });
})();
