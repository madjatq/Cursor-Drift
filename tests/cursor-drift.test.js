const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SETTINGS,
  clamp,
  normalizeSettings,
  loadSettings,
  saveSettings,
  STORAGE_KEY,
  PRESETS,
  createParticle,
  updateParticle,
  shouldPause,
  getEffectiveDensity,
  createRenderer,
  createSettingsPanel,
  createRuntime,
  createQualityController,
} = require('../cursor-drift.user.js');
const { createDOM } = require('./helpers/dom.js');

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

// A missing/aliased preset must not silently turn every visual into Stardust.
test('all four presets produce distinct particles with bounded visual defaults', () => {
  assert.deepEqual(Object.keys(PRESETS), ['Stardust', 'Neon Pulse', 'Soft Bloom', 'Comet Trail']);
  const shapes = new Set();
  for (const preset of Object.keys(PRESETS)) {
    const settings = normalizeSettings({ preset });
    const particle = createParticle(40, 80, { x: 30, y: 75 }, settings, () => 0.5);
    shapes.add(particle.shape);
    assert.ok(particle.size >= 1 && particle.size <= 20);
    assert.ok(particle.lifetime >= 100 && particle.lifetime <= 3000);
    assert.match(particle.color, /^#[0-9a-f]{6}$/i);
    assert.equal(normalizeSettings({ preset }).preset, preset);
  }
  assert.equal(shapes.size, 4);
});

test('particle creation bounds unsafe settings and respects custom color', () => {
  const particle = createParticle(10, 20, null, {
    preset: 'Soft Bloom', size: 999, lifetime: 99999, speed: 999,
    opacity: 999, colorMode: 'custom', customColor: '#123abc',
  }, () => 99);
  assert.ok(particle.size <= 20);
  assert.ok(particle.lifetime <= 3000);
  assert.ok(particle.opacity <= 1);
  assert.ok(Number.isFinite(particle.x) && Number.isFinite(particle.vx));
  assert.ok(Math.hypot(particle.vx, particle.vy) <= 1);
  assert.equal(particle.color, '#123abc');
});

test('particle motion uses milliseconds without mutating input and expires at lifetime', () => {
  const particle = createParticle(10, 20, null, DEFAULT_SETTINGS, () => 0.25);
  const snapshot = { ...particle };
  const advanced = updateParticle(particle, 20, DEFAULT_SETTINGS);
  assert.equal(advanced.age, 20);
  assert.notEqual(advanced.x + advanced.y, particle.x + particle.y);
  assert.deepEqual(particle, snapshot);
  assert.equal(updateParticle(particle, particle.lifetime, DEFAULT_SETTINGS), null);
  assert.equal(updateParticle(particle, particle.lifetime + 100, DEFAULT_SETTINGS), null);
  assert.deepEqual(updateParticle(particle, -100, DEFAULT_SETTINGS), particle);
});

test('pause policy combines disabled, hidden, editing, and selection independently', () => {
  assert.equal(shouldPause({ enabled: true }), false);
  for (const flag of ['hidden', 'editableFocused', 'hasSelection']) {
    assert.equal(shouldPause({ enabled: true, [flag]: true }), true, flag);
  }
  assert.equal(shouldPause({ enabled: false }), true);
});

test('effective density combines quality and reduced motion without changing user settings', () => {
  const settings = normalizeSettings({ density: 0.8 });
  assert.equal(getEffectiveDensity(settings, { fps: 60 }), 0.8);
  assert.equal(getEffectiveDensity(settings, { fps: 60, reducedMotion: true }), 0.2);
  assert.equal(getEffectiveDensity(settings, { quality: 0.5 }), 0.4);
  assert.equal(getEffectiveDensity(settings, { quality: 0.5, reducedMotion: true }), 0.1);
  assert.equal(settings.density, 0.8);
});

// Canvas and the browser clock are the external boundaries; simulation and drawing stay real.
function rendererHarness(settings = {}) {
  const operations = [];
  const context = {};
  for (const name of ['setTransform', 'clearRect', 'save', 'restore', 'translate', 'rotate', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'fill', 'stroke']) {
    context[name] = (...args) => operations.push({ name, args, alpha: context.globalAlpha, color: context.fillStyle });
  }
  context.createRadialGradient = (...args) => {
    operations.push({ name: 'createRadialGradient', args });
    return { addColorStop: (...stops) => operations.push({ name: 'addColorStop', args: stops }) };
  };
  const canvas = {
    style: {}, attributes: {}, parentNode: null,
    setAttribute(name, value) { this.attributes[name] = value; },
    getContext(kind) { assert.equal(kind, '2d'); return context; },
    remove() { this.parentNode = null; },
  };
  const container = { appendChild(node) { node.parentNode = this; } };
  const document = { documentElement: container, createElement: tag => { assert.equal(tag, 'canvas'); return canvas; } };
  const frames = new Map();
  let now = 0;
  let nextId = 0;
  const window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 4 };
  const renderer = createRenderer({
    document, window, random: () => 0.5, now: () => now,
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  }, normalizeSettings(settings));
  return {
    renderer, canvas, window, frames, operations,
    advance(ms = 16) {
      now += ms;
      const scheduled = [...frames.values()];
      frames.clear();
      operations.length = 0;
      scheduled.forEach(callback => callback(now));
      return operations;
    },
  };
}

test('renderer creates a non-interactive DPR-bounded overlay and remains idle without particles', () => {
  const h = rendererHarness();
  assert.equal(h.canvas.style.pointerEvents, 'none');
  assert.equal(h.canvas.style.position, 'fixed');
  assert.equal(h.canvas.attributes['aria-hidden'], 'true');
  assert.equal(h.canvas.width, 1600);
  assert.equal(h.canvas.height, 1200);
  assert.equal(h.frames.size, 0);
  h.window.innerWidth = 400;
  h.renderer.resize();
  assert.equal(h.canvas.width, 800);
  assert.equal(h.frames.size, 0);
  h.renderer.destroy();
  assert.equal(h.canvas.parentNode, null);
});

test('renderer gives each preset its actual distinct canvas drawing path', () => {
  const signatures = new Set();
  for (const preset of ['Stardust', 'Neon Pulse', 'Soft Bloom', 'Comet Trail']) {
    const h = rendererHarness({ preset });
    h.renderer.addPointer(40, 50);
    const commands = h.advance().map(operation => operation.name);
    assert.ok(commands.includes('fill') || commands.includes('stroke'), preset);
    signatures.add(commands.join(','));
    if (preset === 'Stardust') assert.ok(commands.filter(name => name === 'lineTo').length >= 7);
    if (preset === 'Neon Pulse') assert.ok(commands.includes('arc') && commands.includes('stroke'));
    if (preset === 'Soft Bloom') assert.ok(commands.includes('createRadialGradient'));
    if (preset === 'Comet Trail') assert.ok(commands.includes('lineTo') && commands.includes('arc'));
    h.renderer.destroy();
  }
  assert.equal(signatures.size, 4);
});

test('renderer bounds pointer burst emissions, particle count, and density-zero work', () => {
  const h = rendererHarness({ preset: 'Soft Bloom', density: 1, lifetime: 3000 });
  for (let i = 0; i < 10000; i++) h.renderer.addPointer(i, i);
  assert.equal(h.frames.size, 1);
  assert.ok(h.advance().filter(operation => operation.name === 'fill').length <= 12);
  let peak = 0;
  for (let i = 0; i < 250; i++) {
    const count = h.advance().filter(operation => operation.name === 'fill').length;
    peak = Math.max(peak, count);
    assert.ok(count <= 300);
    h.renderer.addPointer(i, i);
  }
  assert.equal(peak, 300);
  h.renderer.setSettings({ ...DEFAULT_SETTINGS, density: 0 });
  for (let i = 0; i < 10; i++) h.renderer.addPointer(i, i);
  assert.equal(h.frames.size, 0);
  h.renderer.destroy();
});

test('renderer clears and cancels immediately on pause, disable, and settings changes', () => {
  const h = rendererHarness();
  h.renderer.addPointer(10, 10);
  h.renderer.setPaused(true);
  assert.equal(h.frames.size, 0);
  h.renderer.addPointer(20, 20);
  assert.equal(h.frames.size, 0);
  h.renderer.setPaused(false);
  assert.equal(h.frames.size, 0);
  h.renderer.addPointer(30, 30);
  assert.equal(h.frames.size, 1);
  h.renderer.setSettings({ ...DEFAULT_SETTINGS, size: 10 });
  assert.equal(h.frames.size, 0);
  h.renderer.addPointer(40, 40);
  h.renderer.setSettings({ ...DEFAULT_SETTINGS, enabled: false });
  assert.equal(h.frames.size, 0);
  h.renderer.addPointer(50, 50);
  assert.equal(h.frames.size, 0);
  h.renderer.destroy();
  h.renderer.addPointer(60, 60);
  assert.equal(h.frames.size, 0);
});

test('renderer fades naturally, stops after expiry, and removes scheduled work on destroy', () => {
  const h = rendererHarness({ preset: 'Soft Bloom', lifetime: 100 });
  h.renderer.addPointer(10, 10);
  const first = h.advance().find(operation => operation.name === 'fill').alpha;
  const later = h.advance(30).find(operation => operation.name === 'fill').alpha;
  assert.ok(later < first && later > 0);
  for (let i = 0; i < 30; i++) h.advance();
  assert.equal(h.frames.size, 0);
  h.renderer.addPointer(20, 20);
  assert.equal(h.frames.size, 1);
  h.renderer.destroy();
  assert.equal(h.frames.size, 0);
});

test('renderer applies reduced-motion capacity without modifying stored density', () => {
  const h = rendererHarness({ preset: 'Soft Bloom', density: 1, lifetime: 3000 });
  for (let i = 0; i < 90; i++) {
    h.renderer.addPointer(i, i);
    h.advance();
  }
  h.renderer.setMetrics({ reducedMotion: true });
  assert.equal(h.advance().filter(operation => operation.name === 'fill').length, 75);
  h.renderer.destroy();
});

test('renderer adapts its real particle capacity after sustained slow frames', () => {
  const h = rendererHarness({ preset: 'Soft Bloom', density: 1, lifetime: 3000 });
  for (let i = 0; i < 120; i++) {
    h.renderer.addPointer(i, i);
    h.advance();
  }
  assert.equal(h.advance().filter(operation => operation.name === 'fill').length, 300);
  for (let i = 0; i < 85; i++) {
    h.renderer.addPointer(i, i);
    h.advance(50);
  }
  assert.equal(h.advance(50).filter(operation => operation.name === 'fill').length, 150);
  h.renderer.destroy();
});

test('renderer forgets the last pointer after natural expiry so idle time cannot bank a burst', () => {
  const h = rendererHarness({ preset: 'Soft Bloom', lifetime: 100 });
  h.renderer.addPointer(10, 10);
  for (let i = 0; i < 20; i++) h.advance();
  assert.equal(h.frames.size, 0);
  h.advance(30000);
  h.renderer.addPointer(200, 300);
  assert.equal(h.advance().filter(operation => operation.name === 'fill').length, 1);
  h.renderer.destroy();
});

function panelHarness(settings = {}, callbacks = {}) {
  const dom = createDOM();
  const changes = [];
  const panel = createSettingsPanel({ document: dom.document, settings }, {
    onChange: next => changes.push(next), ...callbacks,
  });
  const shadow = panel.host.shadowRoot;
  return {
    ...dom, panel, shadow, changes,
    control: name => dom.find(shadow, node => node.name === name),
    trigger: dom.find(shadow, node => node.getAttribute('aria-controls') === 'cursor-drift-settings'),
    content: dom.find(shadow, node => node.id === 'cursor-drift-settings'),
  };
}

// Catches an expanded/in-flow panel, unlabeled controls, and keyboard dead ends.
test('panel is isolated, initially collapsed, Chinese and keyboard operable', () => {
  const h = panelHarness();
  assert.equal(h.panel.host.parentNode, h.document.body);
  assert.equal(h.panel.host.style.position, 'fixed');
  assert.equal(h.panel.host.style.pointerEvents, 'none');
  assert.match(h.panel.host.style.font, /system-ui/, 'host reset must preserve the panel font');
  assert.equal(h.panel.host.style.colorScheme, 'dark');
  assert.match(h.panel.host.style.maxWidth, /100vw/);
  assert.equal(h.trigger.tagName, 'BUTTON');
  assert.equal(h.trigger.type, 'button');
  assert.equal(h.trigger.style.pointerEvents, 'auto');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.content.hidden, true);
  assert.equal(h.panel.isOpen(), false);
  for (const text of ['鼠标特效', '启用特效', '效果预设', '颜色模式', '自选颜色', '大小', '密度', '寿命', '速度', '透明度']) {
    assert.ok(h.shadow.textContent.includes(text), text);
  }
  for (const name of ['enabled', 'preset', 'colorMode', 'customColor', 'size', 'density', 'lifetime', 'speed', 'opacity']) {
    const control = h.control(name);
    const label = h.find(h.shadow, node => node.tagName === 'LABEL' && node.htmlFor === control.id);
    assert.ok(label?.textContent, `${name} must have a visible associated label`);
    assert.ok(['INPUT', 'SELECT'].includes(control.tagName));
  }
  h.fire(h.trigger, 'click');
  assert.equal(h.content.hidden, false);
  assert.match(h.content.style.maxHeight, /100dvh/);
  assert.equal(h.content.style.overflowY, 'auto');
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(h.document.activeElement, h.control('enabled'));
  assert.equal(h.fire(h.control('size'), 'keydown', { key: 'Escape' }), false);
  assert.equal(h.content.hidden, true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.deepEqual(h.changes, []);
});

// Catches controls that update UI only, wrong setting keys, or partial/unsafe callbacks.
test('panel controls emit full normalized settings with live numeric readouts', () => {
  const h = panelHarness();
  h.panel.setOpen(true);
  const updates = [
    ['enabled', false, 'change'], ['preset', 'Comet Trail', 'change'],
    ['colorMode', 'custom', 'change'], ['customColor', '#123abc', 'input'],
    ['size', '12', 'input'], ['density', '0.25', 'input'],
    ['lifetime', '1200', 'input'], ['speed', '2.1', 'input'], ['opacity', '0.45', 'input'],
  ];
  for (const [name, value, type] of updates) {
    if (name === 'enabled') h.control(name).checked = value;
    else h.control(name).value = value;
    h.fire(h.control(name), type);
  }
  assert.equal(h.changes.length, 9);
  assert.deepEqual(h.changes[8], { enabled: false, preset: 'Comet Trail', colorMode: 'custom', customColor: '#123abc', size: 12, density: 0.25, lifetime: 1200, speed: 2.1, opacity: 0.45 });
  assert.equal(h.changes[0].preset, 'Stardust', 'previous callback snapshots remain independent');
  assert.equal(h.find(h.shadow, node => node.tagName === 'OUTPUT' && node.htmlFor === h.control('lifetime').id).textContent, '1200 ms');
  assert.equal(h.find(h.shadow, node => node.tagName === 'OUTPUT' && node.htmlFor === h.control('density').id).textContent, '25%');
  h.control('size').value = '999';
  h.fire(h.control('size'), 'input');
  assert.equal(h.changes[9].size, 20);
  assert.equal(h.control('size').value, '20');
});

// Catches duplicate persistence during synchronization and disabled color controls.
test('panel sync normalizes external settings without writing them back', () => {
  const h = panelHarness();
  assert.equal(h.control('customColor').disabled, true);
  h.panel.setOpen(true);
  h.panel.sync({ preset: 'Soft Bloom', colorMode: 'custom', customColor: '#aabbcc', enabled: false, density: 9 });
  assert.equal(h.control('preset').value, 'Soft Bloom');
  assert.equal(h.control('enabled').checked, false);
  assert.equal(h.control('customColor').disabled, false);
  assert.equal(h.control('customColor').value, '#aabbcc');
  assert.equal(h.control('density').value, '1');
  assert.equal(h.panel.isOpen(), true);
  assert.deepEqual(h.changes, []);
  h.control('colorMode').value = 'preset';
  h.fire(h.control('colorMode'), 'change');
  assert.equal(h.control('customColor').disabled, true);
  assert.equal(h.changes[0].customColor, '#aabbcc');
});

// Catches missing callback invocation and delayed renderer/storage application.
test('panel callback can save and update the real renderer immediately', () => {
  const renderer = rendererHarness();
  const storage = new Map();
  const api = { GM_getValue: key => storage.get(key), GM_setValue: (key, value) => storage.set(key, value) };
  const h = panelHarness({}, { onChange(next) { renderer.renderer.setSettings(saveSettings(api, next)); } });
  renderer.renderer.addPointer(10, 20);
  assert.equal(renderer.frames.size, 1);
  h.control('enabled').checked = false;
  h.fire(h.control('enabled'), 'change');
  assert.equal(renderer.frames.size, 0);
  assert.equal(loadSettings(api).enabled, false);
  h.control('enabled').checked = true;
  h.fire(h.control('enabled'), 'change');
  h.control('preset').value = 'Neon Pulse';
  h.fire(h.control('preset'), 'change');
  renderer.renderer.addPointer(10, 20);
  assert.ok(renderer.advance().some(operation => operation.name === 'stroke'));
  assert.equal(loadSettings(api).preset, 'Neon Pulse');
  renderer.renderer.destroy();
});

// Catches shadow-retargeting leaks in the Task4 pointer guard and stale listeners.
test('panel identifies shadow interactions, releases resources and ignores stale controls', () => {
  const transitions = [];
  const h = panelHarness({}, { onOpenChange: value => transitions.push(value) });
  assert.equal(h.panel.containsEvent({ target: h.panel.host }), true);
  assert.equal(h.panel.containsEvent({ target: h.document.body, composedPath: () => [h.control('size'), h.shadow, h.panel.host, h.document.body] }), true);
  assert.equal(h.panel.containsEvent({ target: h.document.body }), false);
  h.panel.setOpen(true);
  h.panel.setOpen(true);
  h.panel.setOpen(false);
  assert.deepEqual(transitions, [true, false]);
  h.panel.destroy();
  h.panel.destroy();
  assert.equal(h.panel.host.parentNode, null);
  h.control('size').value = '15';
  h.fire(h.control('size'), 'input');
  h.fire(h.trigger, 'click');
  h.panel.setOpen(true);
  h.panel.sync({ size: 10 });
  assert.deepEqual(h.changes, []);
  assert.equal(h.panel.isOpen(), false);
  assert.equal(h.panel.containsEvent({ target: h.panel.host }), false);
});

// Browser APIs are boundary fakes; runtime, panel, storage and renderer stay real.
function runtimeHarness({ protocol = 'https:', framed = false, canvasAvailable = true, readyState = 'complete', stored } = {}) {
  const dom = createDOM();
  const window = dom.document.createElement('window');
  const document = dom.document;
  Object.assign(window, { document, location: { protocol }, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 });
  window.top = framed ? {} : window;
  window.window = window;
  document.parentNode = window;
  document.readyState = readyState;
  document.hidden = false;
  document.getElementById = id => dom.find(document.documentElement, node => node.id === id);
  let selection = { isCollapsed: true, rangeCount: 0, toString() { throw new Error('page text must not be read'); } };
  window.getSelection = () => selection;
  const media = document.createElement('media-query');
  media.matches = false;
  window.matchMedia = query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; };
  const operations = [];
  const context = { createRadialGradient: () => ({ addColorStop() {} }) };
  for (const name of ['setTransform', 'clearRect', 'save', 'restore', 'translate', 'rotate', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'fill', 'stroke']) {
    context[name] = (...args) => operations.push({ name, args, alpha: context.globalAlpha });
  }
  const createElement = document.createElement;
  document.createElement = tag => {
    const node = createElement(tag);
    if (tag === 'canvas') node.getContext = () => canvasAvailable ? context : null;
    return node;
  };
  const frames = new Map();
  let now = 0;
  let nextId = 0;
  window.performance = { now: () => now };
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.queueMicrotask = callback => callback();
  const backing = new Map(stored ? [[STORAGE_KEY, JSON.stringify(stored)]] : []);
  const api = { GM_getValue: key => backing.get(key), GM_setValue: (key, value) => backing.set(key, value) };
  const env = { document, window, storage: api, random: () => 0.5 };
  return {
    ...dom, document, window, media, operations, frames, env, api,
    select(next) { selection = { ...selection, ...next }; dom.fire(document, 'selectionchange'); },
    start() { this.runtime = createRuntime(env); return this.runtime; },
    pointer(target = document.body, type = 'pointermove') { dom.fire(target, type, { clientX: 100, clientY: 200, pointerType: 'mouse' }); },
    advance(ms = 16) {
      now += ms;
      const scheduled = [...frames.values()]; frames.clear(); operations.length = 0;
      scheduled.forEach(callback => callback(now));
      return operations;
    },
    control(name) { return dom.find(this.runtime.panel.host.shadowRoot, node => node.name === name); },
    get canvas() { return dom.find(document.body, node => node.tagName === 'CANVAS'); },
  };
}

// Catches instantaneous threshold jumps, chatter, and recovery without sustained headroom.
test('quality controller degrades and recovers gradually with separate sustained thresholds', () => {
  const quality = createQualityController();
  assert.equal(quality.update(500, 20), 1);
  assert.equal(quality.update(500, 20), 0.9);
  assert.equal(quality.update(500, 20), 0.8);
  assert.equal(quality.update(500, 45), 0.8);
  assert.equal(quality.update(1500, 60), 0.8);
  const recovered = quality.update(500, 60);
  assert.ok(recovered > 0.8 && recovered <= 0.85);
  assert.equal(quality.update(1000, 45), recovered);
});

test('runtime pauses all particles for editable focus including shadow inputs and only resumes when every guard clears', () => {
  const h = runtimeHarness(); h.start(); h.pointer();
  assert.equal(h.frames.size, 1);
  const input = h.document.body.appendChild(h.document.createElement('input'));
  Object.defineProperty(input, 'value', { get() { throw new Error('page form values must not be read'); } });
  h.document.activeElement = input; h.fire(input, 'focusin');
  assert.equal(h.frames.size, 0);
  assert.equal(h.operations.at(-1).name, 'clearRect');
  h.pointer(); assert.equal(h.frames.size, 0);
  h.select({ isCollapsed: false, rangeCount: 1 });
  h.document.activeElement = h.document.body; h.fire(input, 'focusout');
  h.pointer(); assert.equal(h.frames.size, 0);
  h.select({ isCollapsed: true }); h.pointer(); assert.equal(h.frames.size, 1);
  const host = h.document.body.appendChild(h.document.createElement('div'));
  host.attachShadow().activeElement = input;
  h.document.activeElement = host; h.fire(host, 'focusin');
  assert.equal(h.frames.size, 0);
  h.runtime.destroy();
});

test('runtime selection detection uses collapse and range flags, and hidden documents cancel immediately', () => {
  const h = runtimeHarness(); h.start();
  h.select({ isCollapsed: false, rangeCount: 0 }); h.pointer(); assert.equal(h.frames.size, 1);
  h.document.hidden = true; h.fire(h.document, 'visibilitychange'); assert.equal(h.frames.size, 0);
  h.select({ isCollapsed: false, rangeCount: 1 });
  h.document.hidden = false; h.fire(h.document, 'visibilitychange');
  h.pointer(); assert.equal(h.frames.size, 0);
  h.select({ isCollapsed: true }); h.pointer(); assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('runtime panel changes save immediately while interaction pauses rendering and pointer events never leak', () => {
  const h = runtimeHarness(); h.start(); h.pointer();
  h.runtime.panel.setOpen(true);
  h.pointer(h.control('size'), 'pointerover'); assert.equal(h.frames.size, 0);
  h.control('preset').value = 'Neon Pulse'; h.fire(h.control('preset'), 'change');
  assert.equal(loadSettings(h.api).preset, 'Neon Pulse');
  h.pointer(h.control('size')); assert.equal(h.frames.size, 0);
  h.pointer();
  assert.ok(h.advance().some(operation => operation.name === 'stroke'));
  assert.equal(h.runtime.panel.isOpen(), true, 'preview works outside the expanded panel even while its control retains focus');
  h.control('enabled').checked = false; h.fire(h.control('enabled'), 'change');
  assert.equal(h.frames.size, 0);
  h.pointer(); assert.equal(h.frames.size, 0);
  h.runtime.panel.setOpen(true); assert.equal(h.runtime.panel.isOpen(), true);
  h.runtime.destroy();
});

test('runtime reduced motion shortens real particle lifetime while leaving manual settings saved', () => {
  const h = runtimeHarness({ stored: { lifetime: 1000, density: 1 } }); h.start();
  h.media.matches = true; h.fire(h.media, 'change');
  h.pointer(); h.advance(); h.advance(490);
  assert.equal(h.frames.size, 0, 'reduced-motion particles expire at half their normal lifetime');
  assert.equal(loadSettings(h.api).lifetime, 1000);
  h.control('lifetime').value = '2000'; h.fire(h.control('lifetime'), 'input');
  h.pointer(); h.advance(); h.advance(600); assert.equal(h.frames.size, 1);
  h.media.matches = false; h.fire(h.media, 'change');
  assert.equal(loadSettings(h.api).lifetime, 2000);
  h.runtime.destroy();
});

test('runtime survives resize and BFCache, creates no duplicate overlays, and tears down listeners on final pagehide', () => {
  const h = runtimeHarness(); const runtime = h.start(); const canvas = h.canvas;
  assert.equal(createRuntime(h.env), runtime);
  h.window.innerWidth = 400; h.fire(h.window, 'resize');
  assert.equal(h.canvas, canvas); assert.equal(canvas.width, 400);
  h.pointer(); h.fire(h.window, 'pagehide', { persisted: true });
  assert.equal(h.frames.size, 0); h.pointer(); assert.equal(h.frames.size, 0);
  h.fire(h.window, 'pageshow', { persisted: true }); h.pointer(); assert.equal(h.frames.size, 1);
  h.fire(h.window, 'popstate'); h.pointer(); assert.equal(h.canvas, canvas);
  h.fire(h.window, 'pagehide', { persisted: false });
  assert.equal(h.canvas, null); assert.equal(runtime.panel.host.parentNode, null);
  assert.equal(h.frames.size, 0);
  for (const target of [h.window, h.document, h.media]) {
    assert.equal([...target.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  }
  h.pointer(); h.fire(h.media, 'change'); assert.equal(h.frames.size, 0);
  runtime.destroy();
});

test('runtime exits quietly on unsupported pages, frames and missing canvas but works without persistence', () => {
  for (const options of [{ protocol: 'about:' }, { framed: true }, { canvasAvailable: false }]) {
    const h = runtimeHarness(options);
    assert.equal(h.start(), null);
    assert.equal(h.document.body.children.length, 0);
    assert.equal([...h.document.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  }
  const h = runtimeHarness(); h.env.storage = {}; h.start();
  h.control('size').value = '8'; h.fire(h.control('size'), 'input');
  h.pointer(); assert.equal(h.frames.size, 1); h.runtime.destroy();
});

test('browser entry waits for DOM readiness, captures sandbox GM bindings and prevents duplicate installation', () => {
  const vm = require('node:vm');
  const source = require('node:fs').readFileSync(require.resolve('../cursor-drift.user.js'), 'utf8');
  const h = runtimeHarness({ readyState: 'loading', stored: { preset: 'Comet Trail' } });
  const sandbox = { globalThis: h.window, GM_getValue: h.api.GM_getValue, GM_setValue: h.api.GM_setValue };
  vm.runInNewContext(source, sandbox);
  assert.equal(h.document.body.children.length, 0);
  h.document.readyState = 'interactive'; h.fire(h.document, 'DOMContentLoaded');
  assert.equal(h.document.body.children.length, 2);
  const panel = h.document.body.children.find(node => node.shadowRoot);
  const preset = h.find(panel.shadowRoot, node => node.name === 'preset');
  assert.equal(preset.value, 'Comet Trail');
  preset.value = 'Soft Bloom'; h.fire(preset, 'change');
  assert.equal(loadSettings(h.api).preset, 'Soft Bloom');
  vm.runInNewContext(source, sandbox);
  assert.equal(h.document.body.children.length, 2);
  h.fire(h.window, 'pagehide', { persisted: false });
});

test('unknown settings schema falls back safely without losing current unversioned settings', () => {
  const unsupported = { GM_getValue: () => JSON.stringify({ schemaVersion: 99, size: 12 }), GM_setValue() {} };
  assert.deepEqual(loadSettings(unsupported), DEFAULT_SETTINGS);
  const current = { GM_getValue: () => JSON.stringify({ schemaVersion: 1, size: 12 }), GM_setValue() {} };
  assert.equal(loadSettings(current).size, 12);
});
