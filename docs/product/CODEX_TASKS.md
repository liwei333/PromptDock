# PromptDock — Codex 开发启动提示词与分阶段执行任务书

> **用法**：把整个开发资料包放进新仓库的 `docs/product/`（其中 `AGENTS.md` 再复制到仓库根目录）。然后将本文件的「启动提示词」直接发送给 Codex。**第一轮只做阶段 0+1**，实际验收通过后再提交后续阶段提示词。

## 一、第一轮可直接粘贴给 Codex 的提示词

```text
你现在是 PromptDock macOS 本地桌面软件的技术负责人和开发执行者。

一、必须阅读
在当前 PromptDock 工程目录下，完整阅读：
1. AGENTS.md
2. docs/product/README.md
3. docs/product/PRD.md
4. docs/product/UI_DESIGN_SPEC.md
5. docs/product/TECH_ARCHITECTURE.md
6. docs/product/CODEX_TASKS.md
7. docs/product/reference/schema.sql
8. docs/product/UI_PROTOTYPE.html（仅提供配色、CSS Token 和轻量 macOS 视觉语言参考；不复用其 localStorage 假数据层）
9. docs/product/UI_QUICK_WINDOW.html（仅提供配色、CSS Token 和轻量 macOS 视觉语言参考）

二、产品目标与硬约束
这是给我自己使用的 macOS 提示词管理 App。
技术栈：Tauri 2 + Vue 3 + TypeScript + Rust + SQLite。
必须完全离线，本地数据存 SQLite，暂不做账号、云同步、iCloud、联网 API、iPhone/iPad、遥测、AI 模型调用。
主目标是系统剪贴板一键复制。未来还需要 Option+Space 系统级快捷浮窗，但本轮只做到文档规定的阶段 0 + 阶段 1。
HTML 原型只提供配色、CSS Token 和轻量 macOS 视觉语言；当前主窗口布局、导航、按钮位置和交互以 PRD、UI_DESIGN_SPEC 第 3–4 节及当前组件合同为准。
每一个开发阶段必须独立 Git 分支，通过用户验收后才能合并 main。

三、开始前真实核查
1. pwd、Git 当前分支、工作区状态、最新提交。
2. macOS 架构/版本、Node、pnpm、Rust、Cargo、Command Line Tools。
3. 如果当前目录不是 PromptDock 项目，不允许直接覆盖别的项目；在当前工作目录下面新建 promptdock 工程。
4. 查看官方 Tauri v2/SQLx 文档和实际安装版本，选择真实可编译的依赖特性。
5. 输出简要实施顺序和会新增/修改哪些文件，但不要止步于方案，要实际落盘编码。

四、只执行阶段 0 + 1
阶段 0：初始化 Vue3+TS+Vite+Tauri2；工程目录结构、锁文件、基础样式 token、基本单元测试命令；确保 macOS 本机能运行空壳窗口。
阶段 1：在 Rust 端实现 SQLite 路径、连接池、SQL migrations、6 个默认分类初始化、Prompts CRUD、分类创建/列表、参数校验、查询/排序、必要数据测试、TS typed IPC 包装。
首次运行数据库为空提示词+6 个默认分类；重启后新增/编辑数据保持一致。
UI 这一阶段可以只是最小真实调试界面，不必实现完整视觉，也不要提前做快捷浮窗、备份导入和所有功能。

五、必须执行的验收
1. 在数据库首次创建时自动执行 migrations，禁止重复种子数据。
2. 实际新建/编辑/查询/删除提示词，在退出重开后检查真实 SQLite 数据。
3. 至少运行 TS 类型检查、前端构建、Rust 测试；在 Mac 上运行 tauri dev 验证。
4. 测试空标题、空正文、非法分类、中文搜索、同名分类、特殊字符和重复启动。
5. 确认数据库真实目录，并明确它不是浏览器 localStorage。
6. 发现失败须记录可重现步骤，不得改成硬编码演示掩盖问题。

六、反馈格式
使用 AGENTS.md 的阶段反馈模板；附真实变更文件、Git 分支/提交、运行命令与结果、验收证据、遗留问题。
此次不 push、不 merge、不改其它仓库，也不要擅自进入阶段 2 及以后。
```

## 二、阶段拆分与验收门槛（V1.1：阶段 3 后新增 3B）

### 阶段 0 — 工程初始化

- [ ] Git 工作区检查、独立分支，例如 `feat/promptdock-bootstrap`
- [ ] Tauri 2/Vue 3/TS/Pinia 初始化，应用历史原型提供的配色与 CSS Token 视觉语言
- [ ] 锁文件、工程 README、TypeScript 严格模式、lint/test 命令
- [ ] `pnpm tauri dev` 能在 Mac 上显示原生桌面窗口
- [ ] `pnpm build`、基础测试可运行

**门槛**：真实 `.app` 技术路线已跑通；不得以浏览器打开 HTML 代替。

### 阶段 1 — Rust + SQLite 真实数据（必须优先）

- [ ] `src-tauri/migrations/0001_init.sql` 使用 `reference/schema.sql`
- [ ] `app_data_dir` 自动创建 DB、执行迁移，6 个默认分类仅初始化一次
- [ ] `create_prompt/update_prompt/delete_prompt/get_prompt/list_prompts`
- [ ] `list_categories/create_category/get_dashboard_stats`
- [ ] 可靠参数校验、UUID、时间戳、事务、错误模型
- [ ] TS `commands.ts` typed invoke 包装
- [ ] SQLite 单元/集成测试（临时文件库）
- [ ] 重启保留数据；SQL 注入样本不影响真实内容

**门槛**：UI 真实使用 SQLite，而不是 Pinia/localStorage 临时对象。

### 阶段 2 — UI 和一键复制

把下面内容发给 Codex（上一阶段验收后）：

```text
根据 docs/product/PRD.md、UI_DESIGN_SPEC.md 和 AGENTS.md，
在新的 feat 分支完成阶段 2，保持已确认的配色、CSS Token 和轻量 macOS 视觉语言；主窗口实现按 PRD、UI_DESIGN_SPEC 第 3–4 节及当前组件合同执行。
拆分 Vue3 组件：工作台图标栏、搜索筛选、统计卡、提示词列表、详情面板、编辑/删除/分类管理弹窗；不要虚构主窗口顶部三条快捷区或对应组件。
全部数据来自阶段 1 的 Rust SQLite IPC；清除浏览器原型 localStorage 依赖，不自动灌入演示提示词。
通过 @tauri-apps/plugin-clipboard-manager.writeText 实现普通提示词的一键复制：
成功后才能增加 copy_count，失败不增加；需要区分“复制成功但统计失败”。
实现 Pinia 页面状态、中文子串搜索、筛选与排序、收藏和置顶。
执行构建、类型检查、单测，以及 Mac 原生窗口点击复制到 Notes/VS Code 的实测。
不要实现阶段 3/4，不 push 或 merge。
```

**门槛**：页面不只是视觉复刻；选中/复制/重启都有真实行为，AT-02/03/04/05 通过。

### 阶段 3 — 全局快捷浮窗与变量模板

```text
根据 docs/product/PRD.md、UI_DESIGN_SPEC.md、TECH_ARCHITECTURE.md，
在新的 feat 分支完成阶段 3：
1. 系统全局 Option+Space 注册一次，冲突可见可退路。
2. 独立 quick Tauri 浮窗，Vue QuickPalette 共享同一 SQLite；支持搜索、↑↓、Enter、Esc；复制成功后隐藏。
3. 主界面 Cmd+K 打开应用内快速搜索；Cmd+N 新建。
4. 实现 {{变量名}} 去重、输入、非空校验、实时预览、纯字面文本替换。
5. 普通提示词按一次直接复制；变量模板先填变量再复制替换后的全文。
在 Safari/VS Code 前台使用真实 Mac 验证快捷唤起与焦点，不允许只测试浏览器 Ctrl+K。
执行测试并逐项记录证据，不 push、不 merge。
```

**门槛**：AT-06/07/08 通过，中文变量、特殊字符、同名变量测试均通过。

### 阶段 3B — V1.1 新增独立「便签模式」（P0）

在阶段 3 完成真实系统剪贴板和 `quick` 变量流程之后执行，不可把 HTML 浮动 Div 当做 macOS 窗口。

完整的可复制任务指令：**`STICKY_MODE_CODEX_PROMPT.md`**。

- Rust 创建默认隐藏的独立第三窗口 `sticky`：舒适模式默认 420×695，精简模式 340×270；只允许两个精确逻辑尺寸直接切换，不允许任意缩放，并持久化密度选择。
- migration 002 `pin_order`，数据库事务确保至多 5 个位置、不因复制次数变化排序，兼容旧库。
- 标题栏只有密度直接切换、通用完整窗口动作、收起；底部只有「排序」与「始终置顶」，不增加通用底部管理按钮或便签设置齿轮/对话框。
- 主 UI 保留进入便签入口；底部「排序」进入主窗口并直接打开或在已有模态工作之后排队既有 `StickyManagerDialog`。超过 5 条拒绝新增并保留编辑状态。
- 点击条目复制全文，变量复用 quick，跨窗变更后重查 SQLite。
- 持久化便签密度、可见状态、位置与置顶开关；不退出主程序、不联网、不自动粘贴。
- 完成 PRD 新增 **AT-17 至 AT-25**，只在 macOS 原生通过后标记 PASS。

**门槛**：在 Mac 原生验证 420×695 / 340×270 一键双向切换、密度跨重启保留、任意缩放禁用、Sort 直达/安全排队管理器、位置重启恢复、系统置顶和复制；未完成原生验证的项目必须标为 `UNVERIFIED_MACOS_RUNTIME`，不 push 或 merge。

### 阶段 4 — 导入导出、异常与桌面交付

```text
根据 docs/product 资料与 AGENTS.md，
在新的 feat 分支完成阶段 4：
1. UTF-8 JSON 手动导出，保留分类/提示词/收藏/置顶/使用统计。
2. 原生文件对话框、安全校验、导入预览、合并/替换策略。
3. 替换前先做安全备份；导入必须使用一个事务，可回滚。
4. 兼容 reference/sample_import_v1.json 的旧浏览器导出格式。
5. 完善空库、无结果、复制失败、数据库错误、未保存编辑的 UX。
6. 检查最小权限、无远端调用、无自动更新与 telemetry。
7. 完成 PRD AT-01 到 AT-16，打包本机 macOS .app。
每条 AT 给出真实运行证据和状态（通过/失败/未验证）。
此阶段交付仅用于本人本机使用，不上架 App Store。不要擅自 push/merge。
```

**门槛**：一次完整导出→新库导入→逐字段比较成立，所有 P0 无阻塞缺陷，macOS 原生窗口可用。

## 三、无条件遵守的开发边界

1. 每次准备开发前检查仓库状态和文档。
2. 不因为用户说“完整开发”而一轮塞进四个阶段，优先让每阶段能交付、复测、纠错。
3. 不要跳过 SQLite，就去做外观或全局浮窗的静态演示。
4. 不要让 Codex 自行创建在线账户、申请苹果开发者资格或引入同步。
5. 不要声称已经执行测试而没有命令与真实输出。
6. 若历史原型与当前 PRD、UI_DESIGN_SPEC 或组件合同冲突，记录差异并按当前高优先级规范执行；不擅自改变已确认的配色和轻量 macOS 视觉语言。

## 四、给用户的验收方式

每阶段只需把 Codex 反馈贴给 ChatGPT 审核，重点看：分支/文件、构建命令、SQLite 表内容、原生窗口复制行为、全局快捷键真实生效情况。没通过的先修复本阶段，不必立即推进下一阶段。
