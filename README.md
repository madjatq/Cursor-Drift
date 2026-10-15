# Cursor Drift

Version 0.1.0 · 文档版本 / Documentation v1.0 · 2026-10-15

在普通网页上显示可调节的鼠标粒子拖尾。无需 CDN、构建步骤或运行时依赖。
A configurable cursor particle trail for ordinary websites, without CDNs, build steps, or runtime dependencies.

## 中文

### 安装

1. 在桌面版 Chromium 浏览器（例如 Chrome、Edge）或 Firefox 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [安装 Cursor Drift](https://raw.githubusercontent.com/madjatq/Cursor-Drift/main/cursor-drift.user.js)，在 Tampermonkey 中确认安装。该地址依赖仓库已公开且包含此文件；若暂时无法打开，可新建用户脚本，将本仓库 `cursor-drift.user.js` 的完整内容粘贴并保存。
3. 确认扩展已启用并获准访问目标网站。部分 Chromium 版本需要在扩展设置中开启“允许用户脚本”，旧版本可能需要开发者模式；按照 Tampermonkey 的当前提示设置。
4. 刷新一个普通 `http://` 或 `https://` 页面，移动鼠标，点击右上角“鼠标特效”打开设置。

### 使用与设置

面板默认收起，不占网页布局空间；Tab 可访问原生控件，Esc 收起面板并返回触发按钮。修改立即生效，旧粒子会清除。

| 预设 | 效果 |
| --- | --- |
| Stardust（星尘） | 旋转四角星 |
| Neon Pulse（霓虹脉冲） | 发光扩散圆环 |
| Soft Bloom（柔光绽放） | 柔和渐变光斑 |
| Comet Trail（彗星拖尾） | 带方向的短线和亮点 |

中文控件包括启用特效、效果预设、颜色模式、自选颜色、大小、密度、寿命、速度、透明度。“跟随预设”使用各自配色，切换“自选颜色”后可选择颜色。大小、寿命和速度基于预设进行缩放，因此相同数值下不同预设仍有视觉差别。关闭总开关时保留可操作的设置面板。

输入框、文本域、选择控件或可编辑区域聚焦，存在非空文本选择，页面进入后台，或正在操作设置面板时，现有粒子和动画帧会立即清除。所有暂停条件解除后，再次移动鼠标即可恢复。窗口缩放及单页应用导航沿用同一实例；页面进入往返缓存时暂停，返回时恢复。

系统开启“减少动态效果”时，密度为手动设置的 25%，新粒子寿命为正常值的一半。仍可手动开关和调节参数。持续低帧率时密度逐步降低至最多减半；持续恢复后缓慢回升。这些临时调整不会覆盖已保存参数。空闲时无持续动画循环；最多 300 个粒子，设备像素比最多按 2 渲染。

### 保存与隐私

Tampermonkey 的 `GM_getValue/GM_setValue` 将设置保存在本浏览器该脚本的全局空间，随后刷新页面或打开另一网站时读取；已打开的其他标签页不会即时同步。无 GM 接口时回退到当前网站的 `localStorage`，因此只在同一来源有效；存储被禁止或写入失败时，当前页面仍能使用，刷新后可能恢复默认值。损坏或未知版本的设置回退安全默认值。

脚本不发出网络请求，不收集或发送页面文字、表单值、Cookie、凭据或鼠标轨迹；只保存面板参数。鼠标坐标仅在当前粒子动画中短暂使用。选择检测只读取是否折叠及范围数量，不读取选中文字。仅申请两个 GM 设置存储权限。

### 兼容性、排查与验证

面向 Tampermonkey 支持的现代桌面 Chromium 和 Firefox。浏览器内部页面（`chrome://`、`edge://`、`about:`）、扩展商店等受限制页面通常禁止注入；`file://` 不在匹配范围。只在顶层页面运行，不进入 iframe；不支持手机和触屏拖尾。特殊全屏界面、页面移除覆盖层、极端层级或其他用户脚本可能影响显示；Canvas 不可用时安静退出。

没有效果时，先确认页面协议、脚本启用和网站访问权限，再刷新页面；清除文本选择，移开输入焦点，收起设置面板，检查总开关及密度。若只有某个网站冲突，可用总开关暂时关闭效果，或在 Tampermonkey 中排除该网站（总开关是跨网站设置）。设置不能跨网站保留时，检查 GM 权限是否生效；网站存储回退不会跨来源。

本仓库 Node 测试覆盖模拟、真实运行时组合、DOM/Canvas 边界和自启动；没有据此宣称实际安装 Tampermonkey、Firefox 兼容性或浏览器视觉验收已完成。开发验证：安装 Node.js 20+ 后执行 `npm test` 和 `node --check cursor-drift.user.js`。

实际浏览器验收步骤：

1. 在两个普通网站安装运行，逐一选择四个预设，调节所有参数，刷新并跨网站确认保存结果。
2. 测试输入框、Shadow DOM 输入框、可编辑区域及文本选择；在暂停条件重叠时，确认全部解除后才恢复。
3. 切换后台标签、调整窗口、单页导航、前进后退；确认只有一个画布和面板，没有持续空闲动画。
4. 开启系统减少动态效果，确认更稀疏、更短暂且手动设置仍可修改；在性能限制下观察渐进降级及恢复。
5. 用 Tab/Shift+Tab、方向键、Esc 操作面板；测试小窗口、页面按钮/链接点击及滚动，检查覆盖层不拦截页面交互。
6. 在 Chromium 和 Firefox 分别复核，记录版本、异常和截图；确认开发者工具中脚本没有网络请求。

## English

### Installation and controls

Install [Tampermonkey](https://www.tampermonkey.net/) in a modern desktop Chromium browser or Firefox, then open [Install Cursor Drift](https://raw.githubusercontent.com/madjatq/Cursor-Drift/main/cursor-drift.user.js) and confirm installation. The link requires the public repository to contain the script; alternatively, create a new userscript and paste the complete `cursor-drift.user.js` file. Enable the extension and grant access to your website. Follow Tampermonkey's current instructions if Chromium asks you to enable “Allow user scripts” or developer mode. Refresh an ordinary HTTP/HTTPS page and move your mouse.

The Chinese panel opens from the top-right button. Tab reaches native controls; Escape collapses it. Changes apply immediately. The nine controls are enable, preset, color mode, custom color, size, density, lifetime, speed, and opacity. Preset palettes and a retained custom color are available. Preset-specific size, lifetime, and speed scales preserve each effect's character.

The four presets are **Stardust** (rotating stars), **Neon Pulse** (glowing rings), **Soft Bloom** (soft gradient blooms), and **Comet Trail** (directional strokes with bright heads).

### Pausing, preferences and storage

Focusing an input, textarea, select, or editable region, selecting text, hiding the document, or interacting with the panel immediately clears particles and cancels animation. Once every pause condition clears, mouse movement resumes the effect. The panel remains usable with effects disabled. Resize and SPA navigation retain one instance; back/forward cache entry pauses it and return resumes it.

Reduced motion uses 25% of the selected density and halves new particle lifetimes. Manual controls remain available. Sustained low frame rates gradually reduce density by up to half, and sustained recovery restores it slowly. These temporary adjustments never overwrite saved settings. There is no continuous idle animation; particles are capped at 300 and rendering DPR at 2.

GM storage shares settings across websites in this browser for this userscript. Other already-open tabs do not update live. Without GM APIs, storage falls back to the current origin's `localStorage`; when storage is unavailable or writes fail, settings remain effective for the current page session only. Corrupt or unsupported settings versions use safe defaults.

### Privacy, limitations and troubleshooting

The script makes no network requests. It collects or sends no page text, form values, cookies, credentials, or mouse trails. Only panel settings are saved; transient pointer coordinates stay in the current animation. Selection checks inspect only collapse/range flags. The only userscript grants are GM settings read/write.

Browser internal pages, extension stores, and other restricted pages cannot generally run userscripts. File URLs are not matched. Only the top frame runs the effect: iframes, mobile devices, and touch trails are unsupported. Fullscreen views, unusual stacking, removed overlays, or conflicting scripts may affect display. Missing Canvas support causes a quiet exit.

If nothing appears, check the page protocol, extension/site permissions, enable switch and density, then refresh. Clear selections, leave editable controls, and close the panel. For a conflicting website, disable effects temporarily or exclude that site in Tampermonkey; the enable setting itself is global. Site-local fallback storage does not carry settings across origins.

### Validation and development

Node.js 20+ is sufficient for `npm test` and `node --check cursor-drift.user.js`; no dependency installation is needed. The automated suite exercises simulation, combined runtime behavior, DOM/Canvas boundaries, and browser startup. It does not establish an installed Tampermonkey test, Firefox compatibility, or visual acceptance.

For browser acceptance, check all presets and controls on two websites, reload/cross-site persistence, overlapping editing/selection/hidden states, Shadow DOM focus, resize, SPA and history navigation, reduced motion, gradual performance recovery, keyboard access and small viewports. Check that page clicks/scrolling remain usable, only one overlay exists, idle frames stop, and no script network requests occur. Repeat in Chromium and Firefox and record versions and screenshots.

## License / 许可

MIT © 2026 madjatq. See [LICENSE](LICENSE).

## Change log / 变更记录

- 0.1.0 / 文档 v1.0 (2026-10-15): Initial userscript, four presets, Chinese panel, global settings, lifecycle guards and release instructions. 首版脚本、四种预设、中文面板、全局设置与生命周期保护。
