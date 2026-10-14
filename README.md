# PromptDock V1.1 for macOS

PromptDock 是一款完全离线、单机使用的 macOS 提示词工作台。它使用 Vue 3 + TypeScript 构建界面，Tauri 2 提供原生窗口、系统剪贴板、全局快捷键与单实例生命周期，Rust + SQLx + SQLite 负责持久化、校验和事务。

应用不需要账号，不连接远程服务，不自动粘贴或发送内容。提示词以明文 SQLite 保存在当前 Mac。

## 功能

- 提示词新建、编辑、删除、分类、标签、收藏和本地全文检索
- 创建/编辑提示词时支持 macOS 原生“编辑”菜单及 `⌘A`、`⌘C`、`⌘V`、`⌘X`、`⌘Z`、`⇧⌘Z` 快捷键
- 点击复制完整正文；复制成功后才更新使用次数
- `Option + Space` 全局呼出快速搜索窗口，主窗口内也可用 `⌘K`
- 支持 `{{变量名}}` 模板，变量必须完整填写后才能复制
- 340×270 独立五槽便签窗口，支持固定排序、空槽、始终置顶和位置记忆；便签模式与完整模式互斥显示
- JSON 导出、导入预览、合并或替换；替换前自动创建安全备份
- 兼容产品包中的旧浏览器 JSON，旧 ID 会稳定映射为 UUID
- 首次启动只创建 6 个默认分类，不写入示例提示词

## 系统要求与安装

- macOS 13.0 或更高版本
- 当前交付包为 Apple Silicon (`aarch64`) 本地构建

打开 DMG 后，将 `PromptDock.app` 拖到 `Applications`。当前产物为本地 ad-hoc 签名，未使用 Apple Developer ID 签名或公证；若 Gatekeeper 阻止首次打开，请在 Finder 中右键应用并选择“打开”，确认只运行你信任的本地构建。

## 使用

1. 点击“新建提示词”，填写标题、正文和分类。输入框支持系统“编辑”菜单以及 `⌘A`、`⌘C`、`⌘V`、`⌘X`、`⌘Z`、`⇧⌘Z`。
2. 点击提示词卡片查看详情，点击复制按钮将完整正文写入系统剪贴板。
3. 在侧栏切换“最近使用”“我的收藏”“快捷置顶”或具体分类。
4. 使用 `Option + Space` 从其他应用呼出快速搜索；方向键选择，`Enter` 复制，`Esc` 关闭。
5. 正文包含 `{{项目名}}` 等变量时，复制前会显示变量填写面板。
6. 最多置顶 5 条提示词；进入“便签模式”会隐藏完整主窗口，只显示固定五槽独立悬浮窗。
7. 点击便签标题栏的完整模式图标或页脚“管理置顶”可返回完整模式；主窗口出现后便签会隐藏，两个产品窗口不会同时显示。应用菜单也可用于打开主窗口或切换模式。
8. 使用顶部“导出”保存完整 JSON 备份；导入时先核对预览，默认选择“合并”。

## 数据与备份

默认数据库位置：

```text
~/Library/Application Support/com.promptdock.local/promptdock.sqlite3
```

数据库是应用的唯一业务数据源。前端状态只作显示缓存，不使用 `localStorage` 保存提示词。删除应用本体不会自动删除数据库；需要迁移数据时请优先使用应用内 JSON 导出。

## 本地开发

依赖 Node.js、pnpm、Rust、Xcode Command Line Tools：

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

完整质量检查：

```bash
pnpm format:check
pnpm typecheck
pnpm test:run
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
pnpm tauri build
```

## 架构

```text
Vue windows/components
        │ typed invoke/events
        ▼
Tauri commands ── window / clipboard / dialog plugins
        │
        ▼
Rust services + repositories
        │ transactions / bound SQL
        ▼
SQLite in app_data_dir
```

三个窗口共用一套前端产物：

- `main`：1360×860，最小 1024×700，管理提示词库
- `quick`：680×520，默认隐藏，用于全局快速搜索
- `sticky`：340×270，默认隐藏，固定五槽便签

## 验证资料

- `docs/testing/environment.md`：真实开发环境
- `docs/testing/test-report.md`：自动化、构建和安全检查结果
- `docs/testing/acceptance-report.md`：AT-01～AT-25 验收状态与证据
- `docs/testing/known-issues.md`：已知限制与未完成的真机人工测试
- `docs/product/`：原始产品需求、架构和 UI 基线

## 发布说明

- 版本：1.1.0
- Bundle ID：`com.promptdock.local`
- 最低系统版本：macOS 13.0
- 分支：`fix/edit-menu-exclusive-window-modes-implementation`
- 当前仓库未配置远程地址；没有 push 或 merge
