# PromptDock

[![Release](https://img.shields.io/github/v/release/liwei333/PromptDock?display_name=tag)](https://github.com/liwei333/PromptDock/releases/latest)
[![Desktop release](https://github.com/liwei333/PromptDock/actions/workflows/release.yml/badge.svg)](https://github.com/liwei333/PromptDock/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

PromptDock 是一款完全离线、单机使用的桌面提示词工作台，支持 macOS 和
Windows。它使用 Vue 3 + TypeScript 构建界面，Tauri 2 提供原生窗口、系统剪贴板、
全局快捷键与单实例生命周期，Rust + SQLx + SQLite 负责持久化、校验和事务。

应用不需要账号，不连接远程服务，不包含遥测，不会自动粘贴或发送提示词。

## 下载

请从 [GitHub Releases](https://github.com/liwei333/PromptDock/releases/latest)
下载与你的平台匹配的文件：

| 平台                | 推荐下载                                             | 说明                  |
| ------------------- | ---------------------------------------------------- | --------------------- |
| macOS Apple Silicon | `PromptDock_1.1.2_aarch64.dmg`                       | M1、M2、M3、M4 等芯片 |
| macOS Intel         | `PromptDock_1.1.2_x64.dmg`                           | Intel Mac             |
| Windows x64         | `PromptDock_1.1.2_x64-setup.exe` 或 `_x64_en-US.msi` | Windows 10/11 64 位   |
| 源代码              | Release 页面自动提供的 `.zip` / `.tar.gz`            | 用于审计或自行构建    |

当前公开安装包未使用商业代码签名证书：

- macOS 包使用 ad-hoc 签名，但未经过 Apple 公证。首次运行可能需要在 Finder 中
  右键 PromptDock 并选择“打开”。
- Windows 包尚未使用 EV/OV 证书签名，Microsoft Defender SmartScreen 可能显示
  “未知发布者”。只有在确认下载地址来自本仓库后再选择继续运行。

## 功能

- 提示词新建、编辑、删除、分类、标签、收藏和本地全文检索
- 使用系统原生编辑菜单和复制、粘贴、撤销、重做快捷键
- 点击复制完整正文；剪贴板写入成功后才更新使用次数
- 全局快捷键呼出快速搜索窗口
  - macOS：`Option + Space`
  - Windows：`Ctrl + Alt + Space`
- 主窗口内使用 `⌘K`（macOS）或 `Ctrl+K`（Windows）打开快速面板
- 支持 `{{变量名}}` 模板，变量必须完整填写后才能复制
- 独立五槽便签窗口：默认舒适模式 420×695，精简模式 340×270；一次点击可双向切换，不允许任意调整大小，并支持固定手工排序、空槽、始终置顶和位置记忆
- 便签模式与完整模式互斥显示，不会同时打开两个产品窗口
- JSON 导出、导入预览、合并或替换；替换前自动创建安全备份
- 首次启动只创建 6 个默认分类，不写入示例提示词

## 系统要求与安装

### macOS

- macOS 13.0 或更高版本
- 支持 Apple Silicon 和 Intel

打开 DMG 后，将 `PromptDock.app` 拖到 `Applications`。如果 Gatekeeper 阻止首次
打开，请在 Finder 中右键应用并选择“打开”。不建议关闭系统安全保护。

### Windows

- Windows 10 或 Windows 11，64 位
- 需要 Microsoft Edge WebView2 Runtime；现代 Windows 10/11 通常已预装，安装器也会
  使用 Tauri 的默认 WebView2 安装策略

下载并运行 `-setup.exe`（NSIS）或 `.msi`（WiX）安装包。二者安装的是同一版本，
普通用户优先选择 `-setup.exe`。

## 使用

1. 点击“新建提示词”，填写标题、正文和分类。
2. 在提示词列表选择一行后，右侧常驻详情面板会显示完整正文；可从列表行或详情面板复制。
3. 使用工作台筛选器组合“仅看最近使用”“仅看收藏”“仅看置顶”“仅看变量模板”、分类和标签；图标栏的“收藏”是快捷入口。
4. 使用平台全局快捷键从其他应用呼出快速搜索；方向键选择，`Enter` 复制，`Esc` 关闭。
5. 正文包含 `{{项目名}}` 等变量时，复制前会显示变量填写面板。
6. 最多置顶 5 条提示词；进入“便签模式”会隐藏完整主窗口，只显示独立便签。
7. 标题栏“切换到完整模式”用于返回主窗口；页脚“排序”则返回主窗口并直接打开既有“管理置顶”对话框，若主窗口正有其他模态操作则安全排队后打开。
8. 使用详情面板的“导出”或底部状态操作的“JSON 备份”保存完整备份；底部“导入”会先显示预览，默认选择“合并”。

## 数据与隐私

数据库是应用的唯一业务数据源。前端状态只作显示缓存，不使用 `localStorage` 保存
提示词。提示词以明文 SQLite 保存在当前用户的应用数据目录：

- macOS：`~/Library/Application Support/com.promptdock.local/promptdock.sqlite3`
- Windows：`%APPDATA%\com.promptdock.local\promptdock.sqlite3`

删除应用本体不会自动删除数据库。迁移或重装前请优先使用应用内 JSON 导出。

PromptDock 不包含账号、云同步、模型 API、遥测、崩溃上传、自动更新或自动粘贴。

## 本地开发

需要 Node.js 22、pnpm 10、Rust stable，以及对应平台的 Tauri 2 系统依赖：

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
cargo test --manifest-path src-tauri/Cargo.toml --locked
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

- `main`：提示词库管理主窗口
- `quick`：默认隐藏的全局快速搜索窗口
- `sticky`：默认隐藏的固定五槽便签窗口

macOS 专用 AppKit 代码使用 `#[cfg(target_os = "macos")]` 隔离；共享业务逻辑由
macOS 与 Windows 的 GitHub Actions runner 分别编译和测试。

## 发布

推送 `v*` 标签会触发 `.github/workflows/release.yml`：

1. 在 macOS Apple Silicon、macOS Intel 和 Windows x64 环境运行测试。
2. 构建平台原生安装包和压缩包。
3. 将文件上传到同一个 GitHub Release 草稿。
4. 所有平台成功并完成附件检查后，再公开发行版。

## 项目文档

- `docs/product/PRD.md`：产品范围和验收基线
- `docs/product/UI_DESIGN_SPEC.md`：视觉和交互规范
- `docs/product/TECH_ARCHITECTURE.md`：架构与安全约束
- `docs/testing/`：测试报告、验收记录和已知限制
- `CHANGELOG.md`：版本更新记录

## 贡献与许可证

欢迎通过 Issue 或 Pull Request 报告问题和改进实现。提交代码前请运行完整质量检查。

PromptDock 使用 [MIT License](LICENSE) 开源。
