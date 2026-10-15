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
  let reads = 0;
  const api = { GM_getValue: () => { reads++; return '{broken'; }, GM_setValue: () => {}, localStorage: null };
  assert.deepEqual(loadSettings(api), DEFAULT_SETTINGS);
  assert.equal(reads, 1);
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

test('falls back to namespaced localStorage', () => {
  const backing = new Map();
  const makeApi = () => ({
    localStorage: {
      getItem: key => backing.get(key) ?? null,
      setItem: (key, value) => backing.set(key, value),
    },
  });
  const first = makeApi();
  saveSettings(first, { preset: 'Soft Bloom', enabled: false });
  assert.equal(loadSettings(first).preset, 'Soft Bloom');
  assert.equal(loadSettings(first).enabled, false);
  assert.equal(backing.has(STORAGE_KEY), true);
});

test('persists across sites through shared GM storage with independent local stores', () => {
  const globalBacking = new Map();
  const makeSite = () => {
    const localBacking = new Map();
    return {
      GM_getValue: key => globalBacking.get(key),
      GM_setValue: (key, value) => globalBacking.set(key, value),
      localStorage: { getItem: key => localBacking.get(key) ?? null, setItem: (key, value) => localBacking.set(key, value) },
    };
  };
  const first = makeSite();
  const second = makeSite();
  first.localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: 'Stardust' }));
  second.localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: 'Neon Pulse' }));
  saveSettings(first, { preset: 'Comet Trail', enabled: false });
  assert.equal(loadSettings(second).preset, 'Comet Trail');
  assert.equal(loadSettings(second).enabled, false);
  assert.equal(JSON.parse(second.localStorage.getItem(STORAGE_KEY)).preset, 'Neon Pulse');
});

test('denied localStorage discovery safely loads defaults', () => {
  const api = { get localStorage() { throw new DOMException('Access denied', 'SecurityError'); } };
  assert.deepEqual(loadSettings(api), DEFAULT_SETTINGS);
});

test('denied localStorage discovery safely saves normalized values', () => {
  const api = { get localStorage() { throw new DOMException('Access denied', 'SecurityError'); } };
  assert.deepEqual(saveSettings(api, { preset: 'Soft Bloom' }), normalizeSettings({ preset: 'Soft Bloom' }));
});
