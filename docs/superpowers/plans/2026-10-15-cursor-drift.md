# Cursor Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a dependency-free Tampermonkey userscript that renders configurable mouse particle trails on ordinary web pages.

**Architecture:** Keep the installable artifact as one self-contained `cursor-drift.user.js`. Organize the script internally around validated settings, a particle simulation, a canvas renderer, a Chinese floating settings panel, and lifecycle/performance guards. Keep pure decision functions testable under Node's built-in test runner, then use browser smoke checks for the DOM, canvas, Tampermonkey storage, and page lifecycle integration.

**Tech Stack:** Vanilla JavaScript, HTML/CSS created by the userscript, Canvas 2D, Tampermonkey GM storage APIs with fallbacks, Node.js `node:test`, Git/GitHub.

**Spec:** `docs/superpowers/specs/2026-10-15-cursor-drift-design.md`

The initial `package.json` is private, declares Node `>=20`, and contains exactly the local verification script `{ "scripts": { "test": "node --test tests/cursor-drift.test.js" } }`; it has no runtime dependencies.

## Global Constraints

- The script targets ordinary `http/https` pages and must not depend on a CDN, external runtime, or network request.
- Settings use `GM_getValue/GM_setValue` globally across sites, with `localStorage` or session memory as fallback.
- The panel is Chinese; `README.md` is bilingual Chinese/English.
- The four presets are `Stardust`, `Neon Pulse`, `Soft Bloom`, and `Comet Trail`.
- The canvas must not intercept pointer or keyboard events and the panel must not alter page layout.
- Pause while an editable control is focused, text is selected, or the document is hidden; reduce density when performance is low or `prefers-reduced-motion: reduce` is active.
- Do not read or transmit page text, form values, cookies, tokens, mouse trails, or any other user data.
- Runtime code must remain dependency-free and work in modern Chromium and Firefox desktop browsers supported by Tampermonkey.

## Review Focus

- **Cross-origin settings:** changing a preset on one ordinary site must be visible on another site through GM storage; test storage preference and fallback behavior in Task 1.
- **Host page interference:** canvas and panel must not capture clicks, keyboard input, layout flow, or page scrolling; test DOM styles and pointer behavior in Task 3.
- **Lifecycle leaks:** hidden pages, SPA navigation, resize, and unload must stop or release animation work; test pause/resume and cleanup in Task 4.
- **Invalid settings:** corrupted, missing, or out-of-range stored values must normalize to safe defaults without throwing; test in Task 1.
- **Motion and performance preferences:** reduced-motion and sustained low frame rate must lower particle work while preserving manual enablement; test pure policy decisions in Task 2 and browser behavior in Task 4.

### Task 1: Project scaffold, settings schema, and storage

**Files:**
- Create: `cursor-drift.user.js`
- Create: `tests/cursor-drift.test.js`
- Create: `package.json`
- Modify: `docs/superpowers/specs/2026-10-15-cursor-drift-design.md` (status/version already updated before implementation)

**Interfaces:**
- Produces internal functions `clamp(value, min, max)`, `normalizeSettings(raw)`, `loadSettings(api)`, and `saveSettings(api, settings)`.
- `normalizeSettings` returns a complete settings object with `enabled`, `preset`, `colorMode`, `customColor`, `size`, `density`, `lifetime`, `speed`, and `opacity`.
- `loadSettings` prefers `GM_getValue`, falls back to namespaced `localStorage`, and finally returns defaults; `saveSettings` writes the same schema through the best available backend.

- [ ] **Step 1: Write failing Node tests** for default normalization, clamping, corrupted JSON, GM storage preference, localStorage fallback, and cross-site persistence through the injected storage API.
- [ ] **Step 2: Run `npm test`** and confirm the new tests fail because the script functions do not exist.
- [ ] **Step 3: Implement the Tampermonkey metadata block with `@match http://*/*`, `@match https://*/*`, `@grant GM_getValue`, and `@grant GM_setValue`, then add the namespaced settings schema, safe parser, storage adapter, and test-only CommonJS export path in `cursor-drift.user.js`; do not add runtime dependencies.
- [ ] **Step 4: Run `npm test`** and confirm all Task 1 tests pass.
- [ ] **Step 5: Commit** with `git add cursor-drift.user.js tests/cursor-drift.test.js package.json docs/superpowers/specs/2026-10-15-cursor-drift-design.md && git commit -m "feat: add cursor drift settings foundation"`.

### Task 2: Particle simulation, presets, and rendering policy

**Files:**
- Modify: `cursor-drift.user.js`
- Modify: `tests/cursor-drift.test.js`

**Interfaces:**
- Produces `PRESETS`, `createParticle(x, y, previous, settings, random)`, `updateParticle(particle, dt, settings)`, `shouldPause(state)`, and `getEffectiveDensity(settings, metrics)`.
- `PRESETS` contains the four named presets and their bounded visual defaults; `getEffectiveDensity` accounts for reduced motion and low-performance metrics without changing the user's stored density.

- [ ] **Step 1: Add failing tests** for four distinct presets, bounded particle creation, lifetime expiry, motion updates, pause policy, reduced-motion density reduction, and low-FPS density reduction.
- [ ] **Step 2: Run `npm test`** and confirm the new simulation/policy tests fail.
- [ ] **Step 3: Implement the particle data model and pure update functions inside `cursor-drift.user.js`; use deterministic injected randomness in tests and cap total particles at 300 before adaptive reduction.
- [ ] **Step 4: Implement the Canvas 2D draw loop using `requestAnimationFrame`, device-pixel-ratio-aware resizing, pointer-events disabled, bounded spawn rate, and natural fade-out; clear all particles when disabled or paused.
- [ ] **Step 5: Run `npm test`** and confirm all pure simulation and policy tests pass.
- [ ] **Step 6: Commit** with `git add cursor-drift.user.js tests/cursor-drift.test.js && git commit -m "feat: add particle presets and adaptive renderer"`.

### Task 3: Chinese settings panel and live controls

**Files:**
- Modify: `cursor-drift.user.js`
- Modify: `tests/cursor-drift.test.js`

**Interfaces:**
- Produces `createSettingsPanel(state, callbacks)` and `applySettings(nextSettings)` behavior inside the runtime.
- The panel exposes a collapsed top-right button and controls for total enablement, preset, color mode/custom color, size, density, lifetime, speed, and opacity; every change is validated, saved, and applied without reload.

- [ ] **Step 1: Add failing tests** for panel collapsed/expanded state, Chinese labels, keyboard focusability, control-to-settings updates, persistence callback invocation, and panel isolation from canvas pointer events.
- [ ] **Step 2: Run `npm test`** and confirm the panel tests fail.
- [ ] **Step 3: Implement panel DOM creation with a shadow root or uniquely prefixed class names, fixed top-right positioning, dark translucent styling, bounded width, visible focus states, ARIA labels, and no layout-flow elements.
- [ ] **Step 4: Wire controls to `normalizeSettings`, `saveSettings`, renderer state, and immediate preview updates; prevent panel pointer activity from spawning particles.
- [ ] **Step 5: Run `npm test`** and confirm panel tests pass; manually inspect keyboard tab order in a minimal browser page.
- [ ] **Step 6: Commit** with `git add cursor-drift.user.js tests/cursor-drift.test.js && git commit -m "feat: add floating settings panel"`.

### Task 4: Page lifecycle, accessibility preferences, and integration

**Files:**
- Modify: `cursor-drift.user.js`
- Modify: `tests/cursor-drift.test.js`
- Create: `README.md`
- Create: `LICENSE`

**Interfaces:**
- Integrates pointer, focus, selection, visibility, resize, media-query, and unload listeners into one runtime cleanup path.
- Provides no network permissions in metadata and exits quietly when canvas or storage capabilities are unavailable.

- [ ] **Step 1: Add failing integration-oriented tests** for editable-focus pause, non-empty text selection pause, hidden-document pause, reduced-motion media query handling, resize cleanup, unsupported-context early exit, and listener teardown.
- [ ] **Step 2: Run `npm test`** and confirm the integration tests fail.
- [ ] **Step 3: Implement lifecycle guards and cleanup; resume only when all pause conditions clear, adapt density gradually after sustained low FPS, and keep the panel usable while particles are paused.
- [ ] **Step 4: Add bilingual `README.md` covering Tampermonkey installation, supported pages, four presets, Chinese panel controls, global settings, privacy, compatibility, troubleshooting, and limitations; add an MIT `LICENSE`.
- [ ] **Step 5: Run `npm test`** and verify the complete Node suite passes.
- [ ] **Step 6: Commit** with `git add cursor-drift.user.js tests/cursor-drift.test.js package.json README.md LICENSE && git commit -m "docs: add usage and release documentation"`.

### Task 5: Browser verification and GitHub delivery

**Files:**
- Modify: `README.md` if verification finds documentation gaps.
- No new runtime files unless a verified defect requires a focused fix.

**Interfaces:**
- Consumes the installable `cursor-drift.user.js`, test suite, README, and the user-created public GitHub repository.

- [ ] **Step 1: Run the fresh verification set:** `npm test`, a metadata/static check confirming no `@require`, `@connect`, or external URL, and `git diff --check`.
- [ ] **Step 2: Install the userscript in Tampermonkey on a local test page and manually verify default particles, all four presets, immediate controls, cross-site GM persistence, focus/selection/visibility pauses, reduced-motion behavior, keyboard operation, and click-through behavior.
- [ ] **Step 3: Record any browser findings in README and rerun the affected tests plus the full verification set.
- [ ] **Step 4: Read the configured Git remote, initialize Git if needed, and add the user-created public `cursor-drift` repository without exposing credentials; do not force-push or overwrite unrelated remote history.
- [ ] **Step 5: Push the verified commits to the configured default branch, then run `git status --short --branch` and `git log -1 --oneline` to verify the local branch is clean and points at the published commit.
