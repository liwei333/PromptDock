# 开发资料包的生成期检查记录

**时间**：2026-10-13

注意：下面是交付材料和 HTML 原型的检查记录，**不是** macOS Tauri 应用运行结果。正式应用尚未开发，`AT-01` 到 `AT-16` 均待 Codex 在目标 Mac 上逐条验收。

## 已检查

- SQLite `reference/schema.sql`：Python SQLite 内存库执行建表成功；外键开启后，插入未知分类 ID 触发 `IntegrityError`。
- 浏览器主原型 `UI_PROTOTYPE.html`：Chromium Headless 使用 `set_content` 加载（避免沙盒环境的本地 `file://` 导航限制），运行时无 JS page errors；可显示 10 条演示数据、新建提示词、搜索、打开/关闭快捷面板、导出 JSON，共 11 条记录。
- 快捷面板 `UI_QUICK_WINDOW.html`：Chromium Headless 加载，6 条演示数据可显示；输入搜索词过滤、回车打开变量模板、变量填写和预览、取消、方向键/Esc 交互均完成检查；无 JS page errors。

## 未检查（必须由 Codex 真机验证）

- Tauri/Rust 项目编译、`pnpm tauri dev`、`.app` 打包。
- macOS 系统剪贴板原生插件的跨应用复制行为。
- `Option+Space` 在其他 macOS 应用前台唤起快捷窗并聚焦。
- SQLx migration 在 Rust 中执行、真实文件 SQLite 的跨重启持久化。
- 导入 JSON 的生产事务实现、备份恢复、大小限制、报错处理。
- 原生菜单栏、系统设置权限、自动启动等 P1 能力。

**结论**：设计与交付资料的基础示例可供实施参考；正式 App 需由 Codex 开发、编译、实测，不能宣称已交付软件安装包。


## V1.1 便签模式新增烟雾测试（2026-10-13）

- Node.js `node --check` 对 UI_PROTOTYPE.html / UI_STICKY_WINDOW.html 内联脚本进行语法检查：通过。
- Playwright + Chromium 对 HTML 原型执行：五条渲染、340×270尺寸、最后一行不与页脚重叠、整行复制的浏览器反馈、手动上下重排、移除/补位、第六条置顶阻止、变量模板填写/复制 UI：通过。
- Python SQLite 内存库按 `schema.sql` → `002_sticky_mode.sql` 顺序实际执行：通过，包含 is_pinned / pin_order 字段。
- 这些测试不证明系统级始终置顶、独立 macOS 运行、Tauri Clipboard API、跨重启本地 SQLite 持久化或多显示器兼容已通过；上述能力须在 macOS 真机按 AT-17~AT-25 执行并留证。
