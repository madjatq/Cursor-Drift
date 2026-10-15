const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SETTINGS,
  clamp,
  normalizeSettings,
  loadSettings,
  saveSettings,
  STORAGE_KEY,
} = require('../cursor-drift.user.js');

test('normalizes missing settings to the complete defaults', () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(Object.keys(normalizeSettings()).sort(), [
    'colorMode', 'customColor', 'density', 'enabled', 'lifetime', 'opacity', 'preset', 'size', 'speed',
  ].sort());
});

test('clamps numeric settings and sanitizes enum/color values', () => {
  assert.equal(clamp(20, 0, 10), 10);
  assert.equal(clamp(-2, 0, 10), 0);
  const result = normalizeSettings({ enabled: 0, preset: 'Unknown', colorMode: 'invalid', customColor: 'bad', size: -1, density: 999, lifetime: 1, speed: 99, opacity: -4 });
  assert.equal(result.enabled, false);
  assert.equal(result.preset, DEFAULT_SETTINGS.preset);
  assert.equal(result.colorMode, DEFAULT_SETTINGS.colorMode);
  assert.equal(result.customColor, DEFAULT_SETTINGS.customColor);
  assert.ok(result.size >= 1);
  assert.ok(result.density <= 1);
  assert.ok(result.lifetime >= 100);
  assert.ok(result.speed <= 3);
  assert.equal(result.opacity, 0);
});

test('corrupted storage values safely fall back to defaults', () => {
  const api = { GM_getValue: () => '{broken', localStorage: null };
  assert.deepEqual(loadSettings(api), DEFAULT_SETTINGS);
});

test('prefers GM storage and saves normalized settings through GM', () => {
  const calls = [];
  const api = {
    GM_getValue: key => key === STORAGE_KEY ? JSON.stringify({ preset: 'Neon Pulse', density: 0.7 }) : null,
    GM_setValue: (...args) => calls.push(args),
    localStorage: { getItem: () => JSON.stringify({ preset: 'Soft Bloom' }), setItem: () => { throw new Error('should not use localStorage'); } },
  };
  assert.equal(loadSettings(api).preset, 'Neon Pulse');
  saveSettings(api, { preset: 'Comet Trail', density: 0.4 });
  assert.equal(calls[0][0], STORAGE_KEY);
  assert.equal(JSON.parse(calls[0][1]).preset, 'Comet Trail');
});

test('falls back to namespaced localStorage and persists across injected sites', () => {
  const backing = new Map();
  const makeApi = () => ({
    localStorage: {
      getItem: key => backing.get(key) ?? null,
      setItem: (key, value) => backing.set(key, value),
    },
  });
  const first = makeApi();
  saveSettings(first, { preset: 'Soft Bloom', enabled: false });
  const second = makeApi();
  assert.equal(loadSettings(second).preset, 'Soft Bloom');
  assert.equal(loadSettings(second).enabled, false);
  assert.equal(backing.has(STORAGE_KEY), true);
});
