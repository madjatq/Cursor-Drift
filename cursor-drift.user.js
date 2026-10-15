// ==UserScript==
// @name         Cursor Drift
// @namespace    cursor-drift
// @version      0.1.0
// @description  Lightweight configurable cursor particle trails.
// @match        http://*/*
// @match        https://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function (root) {
  'use strict';

  const STORAGE_KEY = 'cursor-drift:settings';
  const SCHEMA_VERSION = 1;
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
  const PRESETS = Object.freeze({
    Stardust: Object.freeze({ shape: 'star', colors: Object.freeze(['#b9d8ff', '#fff2b3', '#ffffff']), size: 4, lifetime: 700, speed: 1, opacity: 1 }),
    'Neon Pulse': Object.freeze({ shape: 'ring', colors: Object.freeze(['#39f5ff', '#ff59d6', '#a088ff']), size: 5, lifetime: 600, speed: 0.8, opacity: 1 }),
    'Soft Bloom': Object.freeze({ shape: 'bloom', colors: Object.freeze(['#ffd2e4', '#d5c5ff', '#b7eddf']), size: 7, lifetime: 900, speed: 0.5, opacity: 0.7 }),
    'Comet Trail': Object.freeze({ shape: 'comet', colors: Object.freeze(['#ffe4ad', '#ffbb79', '#fff4d6']), size: 3, lifetime: 500, speed: 1.5, opacity: 1 }),
  });
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
      preset: Object.hasOwn(PRESETS, input.preset) ? input.preset : DEFAULT_SETTINGS.preset,
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
      if (parsed && parsed.schemaVersion !== undefined && parsed.schemaVersion !== SCHEMA_VERSION) return normalizeSettings();
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
      storage.set(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...normalized }));
    } catch (_) {
      // Storage can be unavailable or quota-limited; runtime remains usable.
    }
    return normalized;
  }

  function createParticle(x, y, previous, settings, random = Math.random) {
    const values = normalizeSettings(settings);
    const preset = PRESETS[values.preset];
    const sample = () => clamp(random(), 0, 1);
    const angle = sample() * Math.PI * 2;
    const speed = clamp(values.speed * preset.speed, 0.1, 3) * (0.025 + sample() * 0.055);
    const directionX = previous ? clamp(x - previous.x, -40, 40) : 0;
    const directionY = previous ? clamp(y - previous.y, -40, 40) : 0;
    return {
      x, y, age: 0,
      vx: Math.cos(angle) * speed - directionX * 0.001,
      vy: Math.sin(angle) * speed - directionY * 0.001,
      rotation: sample() * Math.PI * 2,
      size: clamp(values.size * preset.size / DEFAULT_SETTINGS.size, 1, 20),
      lifetime: clamp(values.lifetime * preset.lifetime / DEFAULT_SETTINGS.lifetime, 100, 3000),
      opacity: values.opacity * preset.opacity,
      color: values.colorMode === 'custom' ? values.customColor : preset.colors[Math.min(preset.colors.length - 1, Math.floor(sample() * preset.colors.length))],
      shape: preset.shape,
    };
  }

  // dt and lifetime are milliseconds; the input particle remains untouched.
  function updateParticle(particle, dt, settings) {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const age = particle.age + elapsed;
    if (age >= particle.lifetime || settings?.enabled === false) return null;
    return { ...particle, age, x: particle.x + particle.vx * elapsed, y: particle.y + particle.vy * elapsed };
  }

  function shouldPause(state = {}) {
    return state.enabled === false || Boolean(state.hidden || state.editableFocused || state.hasSelection);
  }

  function getEffectiveDensity(settings, metrics = {}) {
    const density = clamp(settings?.density ?? DEFAULT_SETTINGS.density, 0, 1);
    return density * (metrics.reducedMotion ? 0.25 : 1) * clamp(metrics.quality ?? 1, 0.5, 1);
  }

  // Separate thresholds and sustained intervals avoid oscillation near 40 FPS.
  function createQualityController() {
    let quality = 1;
    let lowTime = 0;
    let highTime = 0;
    return {
      update(dt, fps) {
        const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (fps < 40) {
          highTime = 0;
          lowTime += elapsed;
          while (lowTime >= 1000) {
            quality = Math.max(0.5, Math.round((quality - 0.1) * 100) / 100);
            lowTime -= 500;
          }
        } else if (fps > 55) {
          lowTime = 0;
          highTime += elapsed;
          while (highTime >= 2000) {
            quality = Math.min(1, Math.round((quality + 0.05) * 100) / 100);
            highTime -= 500;
          }
        } else {
          lowTime = 0;
          highTime = 0;
        }
        return quality;
      },
    };
  }

  function drawParticle(context, particle) {
    const progress = particle.age / particle.lifetime;
    const size = particle.size;
    context.save();
    context.translate(particle.x, particle.y);
    context.globalAlpha = particle.opacity * (1 - progress) ** 2;
    context.fillStyle = particle.color;
    context.strokeStyle = particle.color;
    context.beginPath();
    if (particle.shape === 'star') {
      context.rotate(particle.rotation + progress * 0.8);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const radius = i % 2 ? size * 0.3 : size;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
    } else if (particle.shape === 'ring') {
      context.shadowColor = particle.color;
      context.shadowBlur = size * 2;
      context.lineWidth = Math.max(1, size * 0.25);
      context.arc(0, 0, size * (0.6 + progress), 0, Math.PI * 2);
      context.stroke();
    } else if (particle.shape === 'bloom') {
      const radius = size * (1 + progress * 0.4);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, particle.color);
      gradient.addColorStop(1, `${particle.color}00`);
      context.fillStyle = gradient;
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
    } else {
      context.lineCap = 'round';
      context.lineWidth = Math.max(1, size * 0.8);
      context.moveTo(-particle.vx * 110, -particle.vy * 110);
      context.lineTo(0, 0);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, size * 0.6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  // Owns only the canvas and frame work. Bootstrap owns page event listeners.
  function createRenderer(env, initialSettings) {
    const document = env.document;
    const window = env.window || root;
    const requestFrame = env.requestAnimationFrame || window.requestAnimationFrame.bind(window);
    const cancelFrame = env.cancelAnimationFrame || window.cancelAnimationFrame.bind(window);
    const now = env.now || (() => window.performance.now());
    const random = env.random || Math.random;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483646' });
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    (document.body || document.documentElement).appendChild(canvas);
    let settings = normalizeSettings(initialSettings);
    let metrics = { reducedMotion: false, fps: 60, quality: 1 };
    const qualityController = createQualityController();
    let particles = [];
    let frameId = null;
    let lastFrameTime = null;
    let previous = null;
    let lastPointerTime = null;
    let spawnCredit = 1;
    let paused = false;
    let destroyed = false;
    let width = 1;
    let height = 1;

    function clear() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      lastFrameTime = null;
      particles = [];
      previous = null;
      lastPointerTime = null;
      spawnCredit = 1;
      context.clearRect(0, 0, width, height);
    }

    function resize() {
      if (destroyed) return;
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      width = Math.max(1, window.innerWidth || 1);
      height = Math.max(1, window.innerHeight || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function render(timestamp) {
      frameId = null;
      if (destroyed || paused || !settings.enabled) return;
      const dt = lastFrameTime === null ? 16 : Math.max(0, timestamp - lastFrameTime);
      lastFrameTime = timestamp;
      if (dt > 0) metrics.fps = metrics.fps * 0.9 + Math.min(120, 1000 / dt) * 0.1;
      metrics.quality = qualityController.update(dt, metrics.fps);
      const capacity = Math.floor(300 * getEffectiveDensity(settings, metrics));
      particles = capacity > 0 ? particles.slice(-capacity).map(particle => updateParticle(particle, dt, settings)).filter(Boolean) : [];
      context.clearRect(0, 0, width, height);
      for (const particle of particles) drawParticle(context, particle);
      if (particles.length) frameId = requestFrame(render);
      else clear();
    }

    function addPointer(x, y) {
      if (destroyed || paused || !settings.enabled || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const density = getEffectiveDensity(settings, metrics);
      const capacity = Math.floor(300 * density);
      if (!capacity) return;
      const timestamp = now();
      const elapsed = lastPointerTime === null ? 0 : Math.max(0, timestamp - lastPointerTime);
      lastPointerTime = timestamp;
      // A token bucket bounds work by elapsed time, independent of pointer event frequency.
      spawnCredit = Math.min(12, spawnCredit + elapsed * 0.18 * density);
      const count = Math.min(Math.floor(spawnCredit), Math.max(0, capacity - particles.length));
      for (let i = 0; i < count; i++) {
        const fraction = (i + 1) / count;
        const px = previous ? previous.x + (x - previous.x) * fraction : x;
        const py = previous ? previous.y + (y - previous.y) * fraction : y;
        const particle = createParticle(px, py, previous, settings, random);
        if (metrics.reducedMotion) particle.lifetime *= 0.5;
        particles.push(particle);
      }
      spawnCredit -= count;
      previous = { x, y };
      if (particles.length && frameId === null) frameId = requestFrame(render);
    }

    function setSettings(nextSettings) {
      if (destroyed) return;
      settings = normalizeSettings(nextSettings);
      clear();
    }

    function setPaused(value) {
      if (destroyed) return;
      const nextPaused = Boolean(value);
      if (nextPaused === paused) return;
      paused = nextPaused;
      if (paused) clear();
    }

    function setMetrics(nextMetrics) {
      if (destroyed) return;
      metrics = { ...metrics, ...nextMetrics };
    }

    function destroy() {
      if (destroyed) return;
      clear();
      destroyed = true;
      canvas.remove();
    }

    resize();
    return { addPointer, setSettings, setPaused, setMetrics, resize, destroy };
  }

  // Owns only its Shadow DOM. Bootstrap owns persistence and renderer updates.
  function createSettingsPanel(state, callbacks = {}) {
    const document = state.document || root.document;
    let settings = normalizeSettings(state.settings);
    let open = false;
    let destroyed = false;
    const listeners = [];
    const controls = {};
    const readouts = {};
    const host = document.createElement('div');
    Object.assign(host.style, {
      all: 'initial', position: 'fixed', top: '12px', right: '12px',
      width: '312px', maxWidth: 'calc(100vw - 24px)',
      pointerEvents: 'none', zIndex: '2147483647',
      font: '13px/1.5 system-ui, -apple-system, "Microsoft YaHei", sans-serif',
      color: '#e8edf5', colorScheme: 'dark',
    });
    const shadow = host.attachShadow({ mode: 'open' });

    function element(tag, parent, text) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }
    function listen(node, type, handler) {
      node.addEventListener(type, handler);
      listeners.push(() => node.removeEventListener(type, handler));
    }
    const style = element('style', shadow);
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button, input, select { font: inherit; }
      button, select, input { accent-color: #78dce8; }
      button, select { color: #e8edf5; background: #252d3a; border: 1px solid #485465; border-radius: 8px; }
      button { min-height: 36px; padding: 7px 12px; cursor: pointer; }
      button:hover { background: #344254; }
      button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #8ee8f1; outline-offset: 3px; }
      .trigger { display: block; margin-left: auto; background: rgba(21, 28, 39, .94); box-shadow: 0 4px 18px #0004; }
      .card { margin-top: 9px; padding: 16px; border: 1px solid #ffffff26; border-radius: 14px; background: rgba(19, 26, 37, .96); box-shadow: 0 14px 42px #0005; backdrop-filter: blur(16px); scrollbar-width: thin; }
      .heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
      h2 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: .02em; }
      .close { padding: 4px 9px; font-size: 12px; }
      .row { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: center; margin: 13px 0; }
      label { color: #dce3ee; }
      select, input[type="range"], input[type="color"] { grid-column: 1 / -1; width: 100%; min-width: 0; }
      select { min-height: 36px; padding: 6px 8px; }
      input[type="range"] { margin: 3px 0; min-height: 24px; cursor: pointer; }
      input[type="checkbox"] { width: 18px; height: 18px; margin: 0; cursor: pointer; }
      input[type="color"] { height: 34px; padding: 3px; border: 1px solid #485465; border-radius: 7px; background: #252d3a; cursor: pointer; }
      input:disabled { opacity: .4; cursor: default; }
      output { color: #8ee8f1; font-size: 12px; font-variant-numeric: tabular-nums; }
      .hint { margin: 14px 0 0; color: #a3afbf; font-size: 11px; }
      @media (forced-colors: active) { .card, .trigger { border: 1px solid CanvasText; } }
    `;
    const trigger = element('button', shadow, '✦ 鼠标特效');
    trigger.type = 'button';
    trigger.className = 'trigger';
    trigger.style.pointerEvents = 'auto';
    trigger.setAttribute('aria-controls', 'cursor-drift-settings');
    trigger.setAttribute('aria-expanded', 'false');
    const content = element('section', shadow);
    content.id = 'cursor-drift-settings';
    content.className = 'card';
    content.hidden = true;
    content.setAttribute('aria-labelledby', 'cursor-drift-title');
    Object.assign(content.style, { pointerEvents: 'auto', maxHeight: 'calc(100dvh - 76px)', overflowY: 'auto' });
    const heading = element('div', content);
    heading.className = 'heading';
    element('h2', heading, '鼠标特效设置').id = 'cursor-drift-title';
    const close = element('button', heading, '收起');
    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', '收起鼠标特效设置');

    function addControl(name, labelText, tag, type) {
      const row = element('div', content);
      row.className = 'row';
      const label = element('label', row, labelText);
      const control = element(tag, row);
      control.name = name;
      control.id = `cursor-drift-${name}`;
      label.htmlFor = control.id;
      if (type) control.type = type;
      controls[name] = control;
      return { row, control };
    }
    function addSelect(name, label, options) {
      const { control } = addControl(name, label, 'select');
      for (const [value, text] of options) element('option', control, text).value = value;
    }
    addControl('enabled', '启用特效', 'input', 'checkbox');
    const presetLabels = { Stardust: '星尘', 'Neon Pulse': '霓虹脉冲', 'Soft Bloom': '柔光绽放', 'Comet Trail': '彗星拖尾' };
    addSelect('preset', '效果预设', Object.keys(PRESETS).map(name => [name, `${presetLabels[name]} · ${name}`]));
    addSelect('colorMode', '颜色模式', [['preset', '跟随预设'], ['custom', '自选颜色']]);
    addControl('customColor', '自选颜色', 'input', 'color');
    const numericControls = [
      ['size', '大小', 1, 20, 0.5], ['density', '密度', 0, 1, 0.05],
      ['lifetime', '寿命', 100, 3000, 50], ['speed', '速度', 0.1, 3, 0.1], ['opacity', '透明度', 0, 1, 0.05],
    ];
    for (const [name, label, min, max, step] of numericControls) {
      const { row, control } = addControl(name, label, 'input', 'range');
      control.min = String(min);
      control.max = String(max);
      control.step = String(step);
      const output = element('output', row);
      output.htmlFor = control.id;
      // The range is on its own second row; the value remains beside its label.
      output.style.gridColumn = '2';
      output.style.gridRow = '1';
      readouts[name] = output;
    }
    element('p', content, '调整即时生效 · 按 Esc 收起').className = 'hint';

    function sync(nextSettings) {
      if (destroyed) return;
      settings = normalizeSettings(nextSettings);
      for (const [name, control] of Object.entries(controls)) {
        if (name === 'enabled') control.checked = settings.enabled;
        else control.value = String(settings[name]);
      }
      controls.customColor.disabled = settings.colorMode !== 'custom';
      for (const [name, output] of Object.entries(readouts)) {
        const value = settings[name];
        output.textContent = name === 'density' || name === 'opacity' ? `${Math.round(value * 100)}%`
          : name === 'lifetime' ? `${value} ms` : name === 'size' ? `${value} px` : `${value}×`;
      }
    }
    function setOpen(value) {
      if (destroyed || open === Boolean(value)) return;
      open = Boolean(value);
      content.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) controls.enabled.focus();
      else trigger.focus();
      if (typeof callbacks.onOpenChange === 'function') callbacks.onOpenChange(open);
    }
    for (const [name, control] of Object.entries(controls)) {
      listen(control, name === 'enabled' || control.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (destroyed) return;
        const value = name === 'enabled' ? control.checked : control.value;
        sync({ ...settings, [name]: value });
        if (typeof callbacks.onChange === 'function') callbacks.onChange({ ...settings });
      });
    }
    listen(trigger, 'click', () => setOpen(!open));
    listen(close, 'click', () => setOpen(false));
    listen(shadow, 'keydown', event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    });
    function containsEvent(event) {
      if (destroyed || !event) return false;
      if (typeof event.composedPath === 'function' && event.composedPath().includes(host)) return true;
      return Boolean(event.target && (host.contains(event.target) || shadow.contains(event.target)));
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      open = false;
      for (const removeListener of listeners) removeListener();
      host.remove();
    }
    sync(settings);
    (document.body || document.documentElement).appendChild(host);
    return { host, sync, setOpen, isOpen: () => open, containsEvent, destroy };
  }

  const runtimes = new WeakMap();
  const RUNTIME_HOST_ID = 'cursor-drift-runtime';

  function createRuntime(env = {}) {
    const window = env.window || root.window || root;
    const document = env.document || window.document;
    try {
      if (!document || !['http:', 'https:'].includes(window.location.protocol) || window.top !== window) return null;
      if (runtimes.has(document)) return runtimes.get(document);
      if (document.getElementById?.(RUNTIME_HOST_ID)) return null;
      if (!(document.body || document.documentElement) || typeof window.requestAnimationFrame !== 'function') return null;
    } catch (_) {
      return null;
    }
    const storage = env.storage || window;
    let settings = loadSettings(storage);
    let renderer;
    let panel;
    let destroyed = false;
    let suspended = false;
    let panelPointer = false;
    const disposers = [];

    function listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      disposers.push(() => target.removeEventListener(type, handler, options));
    }
    function isEditable(element) {
      return Boolean(element && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
        || element.isContentEditable || ['true', '', 'plaintext-only'].includes(element.getAttribute?.('contenteditable'))));
    }
    function editableFocused() {
      let active = document.activeElement;
      if (panel?.containsEvent({ target: active })) return false;
      while (active) {
        if (isEditable(active)) return true;
        active = active.shadowRoot?.activeElement;
      }
      return false;
    }
    function hasSelection() {
      try {
        const selection = window.getSelection();
        return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
      } catch (_) {
        return false;
      }
    }
    function updatePause(event) {
      if (destroyed || !renderer) return;
      const focusPath = event?.type === 'focusin' && !panel?.containsEvent(event) && typeof event.composedPath === 'function'
        ? event.composedPath().some(isEditable) : false;
      renderer.setPaused(suspended || panelPointer || shouldPause({
        enabled: settings.enabled, hidden: document.hidden,
        editableFocused: editableFocused() || focusPath, hasSelection: hasSelection(),
      }));
    }
    function applySettings(next) {
      if (destroyed) return;
      settings = saveSettings(storage, next);
      renderer.setSettings(settings);
      panel.sync(settings);
      updatePause();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const dispose of disposers) dispose();
      renderer?.destroy();
      panel?.destroy();
      runtimes.delete(document);
    }
    try {
      renderer = createRenderer({ ...env, document, window }, settings);
      panel = createSettingsPanel({ document, settings }, { onChange: applySettings, onOpenChange: () => updatePause() });
      panel.host.id = RUNTIME_HOST_ID;
      listen(document, 'pointermove', event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        panelPointer = panel.containsEvent(event);
        updatePause();
        if (!panelPointer) renderer.addPointer(event.clientX, event.clientY);
      }, true);
      listen(document, 'pointerover', event => { panelPointer = panel.containsEvent(event); updatePause(); }, true);
      listen(document, 'pointerout', event => { panelPointer = panel.containsEvent({ target: event.relatedTarget }); updatePause(); }, true);
      listen(document, 'pointerdown', event => {
        if (panel.containsEvent(event)) { panelPointer = true; updatePause(); }
      }, true);
      listen(document, 'focusin', updatePause, true);
      listen(document, 'focusout', () => {
        // focusout precedes the browser's next activeElement assignment.
        (window.queueMicrotask || (callback => Promise.resolve().then(callback)))(() => updatePause());
      }, true);
      listen(document, 'selectionchange', updatePause);
      listen(document, 'visibilitychange', updatePause);
      listen(window, 'resize', () => renderer.resize());
      listen(window, 'pagehide', event => {
        if (event.persisted) { suspended = true; updatePause(); }
        else destroy();
      });
      listen(window, 'pageshow', () => {
        suspended = false;
        panelPointer = false;
        renderer.resize();
        updatePause();
      });
      const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      if (media) {
        const updateMotion = () => renderer.setMetrics({ reducedMotion: media.matches });
        updateMotion();
        if (typeof media.addEventListener === 'function') listen(media, 'change', updateMotion);
        else if (typeof media.addListener === 'function') {
          media.addListener(updateMotion);
          disposers.push(() => media.removeListener(updateMotion));
        }
      }
      updatePause();
      const runtime = { panel, renderer, destroy };
      runtimes.set(document, runtime);
      return runtime;
    } catch (_) {
      destroy();
      return null;
    }
  }

  const exported = { DEFAULT_SETTINGS, STORAGE_KEY, PRESETS, clamp, normalizeSettings, loadSettings, saveSettings, createParticle, updateParticle, shouldPause, getEffectiveDensity, createQualityController, createRenderer, createSettingsPanel, createRuntime };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
    return;
  }

  // GM grants may be lexical sandbox bindings rather than properties on window.
  const storage = {
    GM_getValue: typeof GM_getValue === 'function' ? GM_getValue : undefined,
    GM_setValue: typeof GM_setValue === 'function' ? GM_setValue : undefined,
    get localStorage() { return root.localStorage; },
  };
  const window = root.window || root;
  const document = window.document;
  const start = () => createRuntime({ window, document, storage });
  if (document?.readyState === 'loading') {
    const ready = () => {
      document.removeEventListener('DOMContentLoaded', ready);
      start();
    };
    document.addEventListener('DOMContentLoaded', ready);
  } else start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
