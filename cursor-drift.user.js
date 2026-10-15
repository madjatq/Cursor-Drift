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
    return density * (metrics.reducedMotion ? 0.25 : 1) * (Number.isFinite(metrics.fps) && metrics.fps < 40 ? 0.5 : 1);
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
    (document.body || document.documentElement).appendChild(canvas);
    let settings = normalizeSettings(initialSettings);
    let metrics = { reducedMotion: false, fps: 60 };
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
        particles.push(createParticle(px, py, previous, settings, random));
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
      paused = Boolean(value);
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

  const exported = { DEFAULT_SETTINGS, STORAGE_KEY, PRESETS, clamp, normalizeSettings, loadSettings, saveSettings, createParticle, updateParticle, shouldPause, getEffectiveDensity, createRenderer };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
    return;
  }

  // Bootstrap and controls are added by later implementation tasks.
})(typeof globalThis !== 'undefined' ? globalThis : this);
