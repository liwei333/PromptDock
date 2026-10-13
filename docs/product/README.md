# PromptDock · macOS 本地提示词管理 App — 开发交付包

**版本：V1.1（2026-10-13）** 　|　**平台：macOS 优先，个人单机离线使用**

## 包内文件与阅读顺序

| 文件 | 用途 | 读者 |
|---|---|---|
| `PRD.md` | 需求、范围、用户流程、验收标准 | 产品/开发 |
| `UI_PROTOTYPE.html` | 已认可的单文件交互原型，**可直接用浏览器打开** | 开发/设计 |
| `UI_DESIGN_SPEC.md` | 色彩/尺寸/组件/交互状态/键盘细则 | 前端开发 |
| `UI_STICKY_WINDOW.html` | **新增独立五条黄色便签**的可操作视觉原型 | 前端/Tauri 开发 |
| `STICKY_MODE_CODEX_PROMPT.md` | V1.1 增量功能 Codex 任务书 | Codex |
| `reference/002_sticky_mode.sql` | 置顶顺序数据库增量 migration | Rust 开发 |
| `reference/STICKY_WINDOW_PREVIEW.png` | 便签模式的参考预览 | 设计 |
| `reference/STICKY_STANDALONE_PREVIEW.png` | 独立便签设计预览 | 设计 |
| `UI_QUICK_WINDOW.html` | **独立快捷复制浮窗**的浏览器可操作视觉原型（正式全局热键需原生实现） | 前端开发 |
| `TECH_ARCHITECTURE.md` | 技术栈、SQLite SQL、IPC、安全、备份、测试、工程目录 | 技术负责人/Codex |
| `CODEX_TASKS.md` | 可直接复制的启动提示词、阶段任务及逐阶段验收 | Codex |
| `AGENTS.md` | 代码协作约束，可复制到工程仓库根目录 | Codex |
| `reference/schema.sql` | SQLite 初始建表 SQL（开发时可转为 migration 文件） | Rust 开发 |
| `reference/acceptance-checklist.md` | 手工验收表，方便逐项记录通过/失败 | 测试 |
| `reference/UI_PREVIEW.png` | 已认可交互原型的页面预览 | 设计 |
| `reference/QUICK_WINDOW_PREVIEW.png` | 系统快捷浮窗的样式预览 | 设计 |
| `reference/sample_import_v1.json` | 旧浏览器导出结构兼容测试数据（示例） | 测试 |
| `reference/document_validation.md` | HTML 和 SQL 交付资料的烟雾测试记录（**非原生 App 验收**） | 开发/测试 |

## 已经作出的决定

1. **现在不做跨设备同步**：没有 iCloud、账号、网络 API、云数据库或 SDK。
2. **只做 Mac 桌面应用**：优先使用 Tauri 2 + Vue 3 + TS + Rust + SQLite。
3. **核心是复制**：主窗口和快捷面板均有「点击复制」，最终写入系统剪贴板，不自动模拟粘贴。
4. **全局快捷面板列入 P0**：默认 `Option + Space`；应用内 `⌘K`。键位冲突要可见、可退路。
5. **SQLite 是事实源**：UI 原型为了浏览器可单文件体验才用 `localStorage`，正式 App 必须替换，不能直接把演示 JS 包进应用当作完成。
6. **本人自用且不上架**：当前不要求苹果付费开发者资格。Tauri 原生本机编译与安装需 macOS/Rust/Node/Command Line Tools 等开发环境。
7. **离线无联网** 不等于数据库加密：默认 SQLite 和 JSON 备份是明文；建议开启系统 FileVault。

## 原型使用说明

- 双击 `UI_PROTOTYPE.html` 在浏览器打开即可演示；不需要服务器、依赖或联网。
- 原型内含 **10 条示例提示词**；这些是交互演示数据，不会被自动植入正式 App。
- 可体验新建、编辑、分类、搜索、收藏、置顶、变量模板、一键复制、JSON 导入导出、应用内 `⌘K` 快捷面板。
- 打开 `UI_QUICK_WINDOW.html` 可单独预览和操作全局快捷浮窗的 UI（搜索、候选键盘导航、模板输入）；HTML 无法真实注册 macOS 全局快捷键。
- 浏览器可能因本地文件来源限制系统剪贴板写入；**不能据此判断原生 Tauri 剪贴板能力是否可用**。
- 原型无法实现其他程序前台时的全局快捷键；真实行为需在 macOS `.app` 实测。

## 开发方法（不要一次性把所有任务写完）

1. 把本包放进新的 PromptDock 项目目录（示例：`docs/product/`），将 `AGENTS.md` 复制至仓库根目录。
2. 交给 Codex：先读全部文档，在独立分支上执行 `CODEX_TASKS.md` 的 **阶段 0**，核查本机环境与工程初始化。
3. 第二轮只做 **SQLite 真持久化 + CRUD + 剪贴板**，做完实测并反馈证据。
4. 第三轮做原型 UI 迁移、搜索、快捷面板和变量模板。
5. 最后做备份导入导出、边界处理、测试和 `.app` 本机安装验收。

## 交付合格的判定

Codex 必须展示**真实文件、真实运行命令、实际测试结果**。不得以静态 UI、浏览器 localStorage 或「按钮点了有 Toast」冒充本机持久化、剪贴板或全局唤起成功。

官方资料入口：
- Tauri 2 macOS 前置环境：https://v2.tauri.app/start/prerequisites/
- Tauri 2 IPC：https://v2.tauri.app/concept/inter-process-communication/
- Tauri 2 Global Shortcut：https://v2.tauri.app/plugin/global-shortcut/
- Tauri 2 Clipboard：https://v2.tauri.app/plugin/clipboard/
- Tauri 2 Single Instance：https://v2.tauri.app/plugin/single-instance/
- Tauri 2 Dialog：https://v2.tauri.app/plugin/dialog/
- SQLite Online Backup API：https://www.sqlite.org/backup.html


## V1.1 新增：Mac 黄色便签尺寸的「五条快捷提示词」模式

- `UI_PROTOTYPE.html` 已加入顶部 **「📌 便签模式」**：点击可在页面中演示黄色 340×270 浮动便签，五条置顶提示词点击复制、上下排序、移除、拖动、空位提示、置顶按钮状态。
- `UI_STICKY_WINDOW.html` 为第三窗口 `sticky` 的单独视觉原型。
- `STICKY_MODE_CODEX_PROMPT.md` 是在既有项目完成阶段 0～3 后，交给 Codex 实施阶段 **3B** 的专用增量提示词。
- `reference/002_sticky_mode.sql` 是在 `schema.sql` 之后执行的非破坏性迁移，用于持久化 `pin_order`。
- **注意**：浏览器 HTML 只能演示页面内拖动和样式，**无法真的始终置顶于 VS Code 或 Safari 之上**；系统级始终置顶只能由 macOS 原生 Tauri 实现及验收。
- 小便签只展示最多五条**标题**，点击复制的是完整 `body`，绝不使用已被截断的可见标题代替正文；变量模板需先填写变量。
- **不做 iCloud、联网、自动粘贴或其他额外权限**。

建议开发顺序：阶段 0 → 1 → 2 → 3 → **3B** → 4；如果 Codex 已经完成上一阶段，则直接把本包作为 V1.1 增量需求使用，不清库、不重建项目。

