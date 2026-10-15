// ==UserScript==
// @name         Cursor Drift
// @namespace    cursor-drift
// @version      0.1.0
// @description  Lightweight configurable cursor particle trails.
// @match        http://*/*
// @match        https://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function (root) {
  'use strict';

  const STORAGE_KEY = 'cursor-drift:settings';
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    preset: 'Stardust',
    colorMode: 'preset',
    customColor: '#ffffff',
    size: 4,
    density: 0.6,
    lifetime: 700,
    speed: 1,
    opacity: 0.8,
  });
  const PRESETS = ['Stardust', 'Neon Pulse', 'Soft Bloom', 'Comet Trail'];
  const COLOR_MODES = ['preset', 'custom'];

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function validColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_SETTINGS.customColor;
  }

  function normalizeSettings(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: input.enabled === false || input.enabled === 0 ? false : input.enabled === true || input.enabled === 1 ? true : DEFAULT_SETTINGS.enabled,
      preset: PRESETS.includes(input.preset) ? input.preset : DEFAULT_SETTINGS.preset,
      colorMode: COLOR_MODES.includes(input.colorMode) ? input.colorMode : DEFAULT_SETTINGS.colorMode,
      customColor: validColor(input.customColor),
      size: clamp(input.size ?? DEFAULT_SETTINGS.size, 1, 20),
      density: clamp(input.density ?? DEFAULT_SETTINGS.density, 0, 1),
      lifetime: clamp(input.lifetime ?? DEFAULT_SETTINGS.lifetime, 100, 3000),
      speed: clamp(input.speed ?? DEFAULT_SETTINGS.speed, 0.1, 3),
      opacity: clamp(input.opacity ?? DEFAULT_SETTINGS.opacity, 0, 1),
    };
  }

  function parseStored(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function getStorage(api) {
    const source = api || root || {};
    try {
      const gmGet = source.GM_getValue;
      const gmSet = source.GM_setValue;
      if (typeof gmGet === 'function' && typeof gmSet === 'function') return { type: 'gm', get: gmGet, set: gmSet };
    } catch (_) {
      // Continue to local storage when GM API discovery is unavailable.
    }
    try {
      const local = source.localStorage;
      if (local && typeof local.getItem === 'function' && typeof local.setItem === 'function') return { type: 'local', get: local.getItem.bind(local), set: local.setItem.bind(local) };
    } catch (_) {
      // Accessing localStorage itself can throw in restricted browser contexts.
    }
    return null;
  }

  function loadSettings(api) {
    const storage = getStorage(api);
    if (!storage) return normalizeSettings();
    try {
      const stored = storage.get(STORAGE_KEY);
      const parsed = parseStored(stored);
      return parsed ? normalizeSettings(parsed) : normalizeSettings();
    } catch (_) {
      return normalizeSettings();
    }
  }

  function saveSettings(api, settings) {
    const storage = getStorage(api);
    const normalized = normalizeSettings(settings);
    if (!storage) return normalized;
    try {
      storage.set(STORAGE_KEY, JSON.stringify(normalized));
    } catch (_) {
      // Storage can be unavailable or quota-limited; runtime remains usable.
    }
    return normalized;
  }

  const exported = { DEFAULT_SETTINGS, STORAGE_KEY, clamp, normalizeSettings, loadSettings, saveSettings };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
    return;
  }

  // Rendering and controls are added by later implementation tasks.
  root.CursorDrift = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this);
