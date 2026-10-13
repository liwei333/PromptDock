# PromptDock — macOS 单机版技术架构与实施方案 V1.1

> 日期：2026-10-13 ｜ 适用范围：**仅 macOS 本地版** ｜ 对应 `PRD.md`、`UI_DESIGN_SPEC.md`、`UI_PROTOTYPE.html`
>
> **开发目标不是把 HTML 页面打包成窗口**，而是以已认可的原型为前端基线，交付真实的桌面剪贴板、数据库、跨进程快捷键和本地备份能力。

## 1. 架构决策（ADR-001）

| 层级 | 方案 | 为什么 |
|---|---|---|
| 客户端运行时 | **Tauri 2** | 小型 macOS 桌面程序，Rust 原生能力，独立主窗与快捷窗 |
| 前端 | **Vue 3 + TypeScript + Vite** | 复用 HTML 视觉和前端技术能力，便于拆分组件 |
| 状态管理 | **Pinia** | 页面筛选、选中条目、弹窗状态、请求状态；不充当数据库 |
| 样式 | 现有原型 CSS Token + scoped CSS | 保留已确认 UI；首版不引入重型 UI 框架 |
| 后端桥接 | **Tauri `invoke` + Rust `#[tauri::command]`** | 暴露受控、可测试、经过参数校验的业务 API |
| 业务数据库 | **SQLite + Rust `sqlx`** | 无需服务器、离线持久化、数据库迁移和事务 |
| 剪贴板 | `@tauri-apps/plugin-clipboard-manager` | 使用系统剪贴板 API，而非 WebView 兼容兜底 |
| 全局快捷键 | `tauri-plugin-global-shortcut`（Rust 端注册） | 其他应用在前台时也能打开快捷面板 |
| 单实例 | `tauri-plugin-single-instance` | 防止重复运行导致的热键冲突和误操作 |
| 本地对话框 | `tauri-plugin-dialog` | 选择 JSON 备份的输入/输出位置；文件处理在 Rust |
| 系统托盘 | Tauri tray API（**P1**） | 首版非必需，避免先增加 OS 生命周期复杂度 |
| 开发包管理 | pnpm + Cargo | 显式 lockfile，简化可复现构建 |
| 测试 | Vitest + Vue Test Utils + cargo test + macOS 实机手工验收 | UI/数据/原生能力分层验证 |

**为什么不直接使用 Tauri SQL JS 插件？** 官方插件支持 SQLite 及 migration，适合快速构建；本项目考虑数据校验、导入事务、重复 ID 策略和能力边界，首版选择 Rust Repository 包装 sqlx。这样前端无法直接拼接任意 SQL，导入校验集中处理。两条路线都可行，但**不能同时保留两套数据访问路径**。

**为什么不需要 Node/Python 服务端？** 所有数据在一台 Mac 上。Tauri 的 Rust 主进程既是本地业务层，也是 SQLite 访问层；Vue 与 Rust 通过进程内 IPC 通信，不占用本机 HTTP 端口，不提供 `localhost` API。

## 2. 系统结构

```text
┌────────────────────────────────── macOS ───────────────────────────────────┐
│                                                                          │
│  ┌────────────────────┐        ┌────────────────────┐                     │
│  │ main（主工作台）    │        │ quick（悬浮面板）    │                     │
│  │ Vue3 + Pinia       │        │ Vue3 + 快速搜索    │                     │
│  │ 搜索/列表/编辑/复制 │        │ Option+Space 唤起  │                     │
│  └─────────┬──────────┘        └─────────┬──────────┘                     │
│            │ typed Tauri invoke          │                              │
│            └─────────────┬───────────────┘                              │
│                          ▼                                              │
│             ┌──────────────────────────────┐                             │
│             │ Rust Commands / Services     │                             │
│             │ 输入校验/搜索/事务/导入导出  │                             │
│             ├──────────────────────────────┤                             │
│             │ SQLite Repository (sqlx)     │                             │
│             └───────────────┬──────────────┘                             │
│                             ▼                                            │
│                 app_data_dir/promptdock.sqlite3                          │
│                                                                          │
│  OS Clipboard ◄── writeText   Global Shortcut ──► show/focus quick       │
│  本地 JSON   ◄── 文件保存/读取 ──► 导入/导出业务服务                    │
└──────────────────────────────────────────────────────────────────────────┘

                  不包含 HTTP / 云端 / 远程遥测 / AI 模型接口
```

主窗口、快捷窗口和新增便签窗口共享**一个 Rust 应用进程内 SqlitePool**，但各自维护 Vue 界面状态。每次主窗口和快捷窗口切换/显示均重新读取查询结果或收到 `prompts-changed` 内部事件，以保证编辑后数据一致。不要让不同窗口都维护持久化快照，避免陈旧覆盖。

## 3. 工程目录约定

```text
promptdock/
├── AGENTS.md                         # Codex 协作规则（随交付包提供）
├── README.md                         # 项目启动、构建、测试及本地数据库位置
├── package.json
├── pnpm-lock.yaml
├── index.html
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.ts                       # Vue 初始化，识别主窗/快捷窗入口
│   ├── App.vue
│   ├── styles/tokens.css             # 与 UI_DESIGN_SPEC 一致
│   ├── types/prompt.ts               # 前端领域类型、严格映射
│   ├── api/commands.ts               # invoke 统一封装 / 错误归一化
│   ├── services/clipboard.ts         # Tauri 系统剪贴板
│   ├── services/shortcuts.ts         # 主窗局部 ⌘K / ⌘N
│   ├── stores/promptStore.ts
│   ├── stores/uiStore.ts
│   ├── composables/usePromptSearch.ts
│   ├── composables/useTemplateVariables.ts
│   ├── components/
│   │   ├── AppSidebar.vue
│   │   ├── AppToolbar.vue
│   │   ├── PromptSearchBar.vue
│   │   ├── PinnedQuickPanel.vue
│   │   ├── PromptCard.vue
│   │   ├── PromptDetailDrawer.vue
│   │   ├── PromptEditorDialog.vue
│   │   ├── CategoryCreateDialog.vue
│   │   ├── ConfirmDeleteDialog.vue
│   │   ├── ImportPreviewDialog.vue
│   │   ├── QuickPalette.vue
│   │   └── AppToast.vue
│   ├── windows/
│   │   ├── MainWindow.vue
│   │   └── QuickWindow.vue
│   └── tests/
│       ├── template-variables.test.ts
│       ├── prompt-store.test.ts
│       └── clipboard.test.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── migrations/0001_init.sql
│   └── src/
│       ├── lib.rs                     # 启动、注册插件与命令
│       ├── commands/
│       │   ├── prompts.rs
│       │   ├── categories.rs
│       │   ├── backup.rs
│       │   └── windows.rs
│       ├── db/mod.rs                  # 数据库路径、连接池、迁移
│       ├── repositories/
│       │   ├── prompt_repo.rs
│       │   └── category_repo.rs
│       ├── domain/
│       │   ├── models.rs
│       │   ├── validation.rs
│       │   ├── template.rs
│       │   └── errors.rs
│       ├── services/
│       │   ├── backup_service.rs
│       │   └── quick_window.rs
│       └── tests/                     # DB/迁移/导入等集成测试
└── docs/product/                      # 复制本套开发资料
```

## 4. 数据库：路径、初始化、迁移

### 4.1 本机路径

在 Rust 使用 Tauri `Manager` 的 `app.path().app_data_dir()` 解析真实用户目录，再创建：

```text
<app_data_dir>/promptdock.sqlite3
```

在 macOS 上通常对应 `~/Library/Application Support/<app-identifier>/`，**实际路径必须运行时取值**，不得在代码写死。App ID 可采用 `com.promptdock.local`。不要存放在 `Documents` 或 iCloud Drive，以免文件级同步造成损坏；不要存放在临时目录或 `.app` 包内。

### 4.2 SQL（提供独立 SQL 文件）

完整可执行建表见 `reference/schema.sql`，落地时复制为 `src-tauri/migrations/0001_init.sql` 并由 `sqlx::migrate!()` 统一执行。

| 表 | 关键字段 | 约束与含义 |
|---|---|---|
| `categories` | id, name, icon, color, sort_order, timestamps | 用户与默认分类；name 去重 |
| `prompts` | id, title, description, body, category_id, tags_json, is_favorite, is_pinned, copy_count, last_copied_at, timestamps | 单条提示词主体，FK 关联分类 |
| `app_settings` | key, value_json, updated_at | 默认快捷键、窗口设置（首版极少） |
| `_sqlx_migrations` | SQLx 内部维护 | 记录 Schema migration 版本，不手工修改 |

- 应用新建的提示词与分类主键统一由 Rust 生成 **UUID v4**；前端不生成业务主键。导入旧浏览器 JSON 遇到 `demo-*` 等非 UUID 旧 ID 时，应基于固定命名空间生成**确定性 UUID v5**（例如 `legacy:原始ID`），避免重复导入同一文件产生无意义副本；合法 UUID 的冲突按导入合并规则处理。
- 时间统一 UTC epoch **milliseconds**，UI 在本地时区格式化。
- `tags_json` 是 `JSON.stringify(string[])`；后端每次读写校验，避免伪造字段或乱码污染。
- 收藏与置顶是独立字段，不取代分类。
- 正文以 TEXT 原样存储，保留换行。UI 卡片可以摘要截断，数据库绝不能截断正文。
- SQL 注入防护：所有动态字符串都用 `.bind()` 参数化 SQL；搜索 `%`、`_` 要按明确规则作为普通文本处理。
- `foreign_keys = ON` 必须在**每个连接**启用；开启 WAL 和合理 busy timeout；单实例运行，连接池可保守设为 `max_connections=1`。
- migration 必须可检测且不会在每次运行时丢失现有数据；禁止 `DROP TABLE` 重建用户数据。

### 4.3 启动顺序（必须稳定）

1. Tauri 初始化、注册单实例插件（应最先注册）、剪贴板/快捷键/对话框插件。
2. 获取 `app_data_dir` 并 `create_dir_all`；连接 SQLite、设置 `PRAGMA`、执行 `sqlx` migrations。
3. 事务内检查是否存在分类；**当分类表为空时**插入 6 个默认分类；提示词表保持空。
4. 初始化 Repository/Service 并注入共享 State；仅数据库准备成功后才允许主窗口写操作。
5. 注册 `Option + Space` 全局热键；若被占用/注册失败，记录可读错误，应用仍可启动和从主窗口打开快捷面板。
6. 主窗口加载数据库结果；快速窗口预创建并隐藏，供系统热键调用。

数据库连接失败：保留错误和现有文件，提供「打开数据目录/导出诊断说明」等只读退路；**不可**静默重新生成空数据库覆盖用户内容。

## 5. 领域模型与入参校验

```ts
// 表层 DTO 示例；时间全部为 UTC epoch milliseconds。
export type Prompt = {
  id: string;
  title: string;
  description: string;
  body: string;
  categoryId: string;
  tags: string[];
  isFavorite: boolean;
  isPinned: boolean;
  copyCount: number;
  lastCopiedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type PromptInput = Pick<Prompt,
  'title' | 'description' | 'body' | 'categoryId' | 'tags' | 'isFavorite' | 'isPinned'
>;

export type PromptQuery = {
  search?: string;
  view?: 'all' | 'recent' | 'favorite' | 'pinned';
  tab?: 'all' | 'favorite' | 'template';
  categoryId?: string;
  sort?: 'recent' | 'popular' | 'name';
  limit?: number;
  offset?: number;
};
```

Rust 的 `PromptInput` 必须独立 validate：标题 1–80 字符，正文非空且 ≤100,000 字符，说明 ≤160，标签最多 10 个/30 字符，分类有效；前端只是体验校验，**不替代 Rust 校验**。禁止把模板字段当成 JS/HTML 执行。UI 渲染原始正文使用文本节点/`v-text`，不用 `v-html`。

> Unicode 长度须统一。建议用户可见字符限制按 JavaScript 的 code points / Rust `chars().count()` 计算（不严格等于字素簇），需要在测试中包含中文和 emoji；不得前端截断后端接受不同长度上限。

## 6. Rust IPC 契约（前后端唯一数据入口）

所有返回值须是 JSON 可序列化 DTO。错误统一 `{ code, message, detail? }`；`detail` 不回显隐私数据正文。

| Rust command | 输入 | 输出 | 事务 / 注意事项 |
|---|---|---|---|
| `list_prompts` | `PromptQuery` | `{items:Prompt[],total:number}` | 参数化、组合筛选/排序 |
| `get_prompt` | `{id}` | `Prompt` | 不存在返回 NOT_FOUND |
| `create_prompt` | `PromptInput` | `Prompt` | 校验 + INSERT 原子提交 |
| `update_prompt` | `{id,input}` | `Prompt` | 未找到返回 NOT_FOUND |
| `delete_prompt` | `{id}` | `{deleted:true}` | 二次确认放在前端，后端验证 ID |
| `set_favorite` | `{id,value:boolean}` | `Prompt` | 置顶无关 |
| `set_pinned` | `{id,value:boolean}` | `Prompt` | 收藏无关 |
| `record_successful_copy` | `{id}` | `{copyCount,lastCopiedAt}` | **仅在系统剪贴板成功后由客户端调用** |
| `list_categories` | 无 | `Category[]` | 同时提供每分类计数或单独 `get_stats` |
| `create_category` | `{name}` | `Category` | 去重、校验 |
| `get_dashboard_stats` | 无 | 数量/收藏/置顶/使用统计 | 查询实际 SQLite |
| `export_backup` | 无 | `{cancelled:boolean,path?:string,counts?:...}` | Rust 打开原生保存对话框，写 JSON |
| `preview_import_backup` | 无 | `{cancelled:boolean,token?,summary?...}` | Rust 选择文件，**不写库**；仅暂存安全校验后的导入对象/Token |
| `commit_import_backup` | `{token,mode:'merge'|'replace'}` | `{imported,skipped,duplicated,categoriesAdded}` | 安全备份 + 单事务导入 |
| `show_quick_window` | 无 | `{shown:true}` | 打开/聚焦独立快捷取用窗 |
| `hide_quick_window` | 无 | `{hidden:true}` | Esc/复制完成调用 |
| `get_runtime_info` | 无 | `{dbPath,shortcutStatus,version}` | 路径只展示给本机用户，不记录完整提示词 |

**注意**：Vue 的 `invoke` 参数一般使用 camelCase JS 属性，而 Rust 定义接收变量依 `#[tauri::command]` 规则绑定；不直接复制表字段 snake_case 到 IPC。使用同一处 `commands.ts` 封装映射并写测试。

**示例：仅演示 typed invoke 外壳，不是整套可运行代码**

```ts
import { invoke } from '@tauri-apps/api/core';
import type { Prompt, PromptInput } from '@/types/prompt';

export const promptApi = {
  list: (query: PromptQuery) => invoke<{items:Prompt[];total:number}>('list_prompts', { query }),
  create: (input: PromptInput) => invoke<Prompt>('create_prompt', { input }),
  update: (id: string, input: PromptInput) => invoke<Prompt>('update_prompt', { id, input }),
  copyRecorded: (id: string) => invoke<{copyCount:number;lastCopiedAt:number}>('record_successful_copy', { id }),
};
```

## 7. 一键复制服务及失败策略

推荐写成独立 TS 服务，所有入口（快捷区、卡片、详情、快捷窗口）**调用同一个流程**：

```ts
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

export async function copyPlainPrompt(prompt: Prompt): Promise<void> {
  // 真实项目还需加入界面 toast、loading、捕获错误、刷新状态等。
  await writeText(prompt.body);              // 系统剪贴板，失败将 reject
  try {
    await promptApi.copyRecorded(prompt.id);  // 成功后才记录次数
  } catch (err) {
    // 剪贴板已写成功：报告统计更新失败，不得误报复制失败。
    reportNonFatalCopyCountError(err);
  }
}
```

上述示例假定 `reportNonFatalCopyCountError` 是项目内 UI 通知函数，Codex 应在实际实现中提供，不得复制后留下未定义符号。**禁止**用 `navigator.clipboard.writeText()` + 浏览器 fallback 作为正式版唯一实现（HTML 原型保留是合理的）。

模板复制服务：

```text
Body → 提取 {{...}} → 去重、校验数量 → 变量输入 → 生成最终字符串
     → writeText(最终字符串) → 成功后 record_successful_copy(id)
```

替换规则：仅对原正文进行一次匹配替换；如果用户输入值含 `$&` 或 `{{新变量}}`，必须作为字面值插入，不进行二次替换。没有变量就直接复制，不弹表单。

## 8. 搜索实现（离线中文片段检索）

V1.0 数据规模目标在数千条以内，推荐**SQLite LIKE + 参数化**：

```sql
SELECT p.*
FROM prompts p
JOIN categories c ON c.id = p.category_id
WHERE (:search_empty = 1
  OR p.title LIKE :pattern ESCAPE '\'
  OR p.description LIKE :pattern ESCAPE '\'
  OR p.body LIKE :pattern ESCAPE '\'
  OR p.tags_json LIKE :pattern ESCAPE '\'
  OR c.name LIKE :pattern ESCAPE '\')
ORDER BY p.updated_at DESC
LIMIT :limit OFFSET :offset;
```

- 传入前先对用户字符串转义 `\`、`%`、`_`，再包装成 `%escaped%`；使用 `.bind`，不要直接拼接 SQL 条件。
- SQL 示例中 `:search_empty` 仅为语义展示；落地可用 SQLx 支持的 SQLite 占位符形式 `?`/绑定，多条件分支应有单元/集成测试。
- 组合收藏/置顶/最近使用/分类过滤，分别构建预定义 SQL 条件/QueryBuilder，只从安全的枚举选择 ORDER BY；别把用户传入的 `sort` 当原始 SQL。
- 列表分页默认 100 条，可在前端追加加载；顶部 3 条置顶、浮窗 12 条独立查询。
- 中国语料无法仅依赖 SQLite FTS5 unicode61 实现自然中文分词；**V1 采用子串匹配**，数据量大时再考虑分词或 FTS 索引。标签的 `tags_json` 搜索可能匹配 JSON 转义文本，首版可接受，但测试中必须覆盖中文。

## 9. 主窗口与快捷搜索窗口、快捷键和单实例

### 9.1 窗口划分

**`main`**：正常装饰桌面窗口，初始 1360×860，最小 1024×700，渲染主工作台。

**`quick`**：Tauri 预创建、初始隐藏、约 680×520 的轻量窗口，渲染 `QuickWindow.vue`。对主/快捷窗口采用明确路由（如 `/#/quick`）或 URL 查询参数标识，不复制一套应用与数据库。quick 只需查询、模板变量、复制与关闭能力。

快捷窗出场：Rust shortcut handler 收到 `Option+Space` → `quick.show()` → `quick.set_focus()` → 向 quick 发 `quick-opened` 事件 → Vue 清空搜索、重置候选、聚焦输入框。若平台要求前台激活，则依照 Tauri 当前 macOS API 实测并采用最少的原生调整；**不得未经验证假定失焦背景时 set_focus 必然成功**。

快捷窗离场：普通复制成功后 `quick.hide()`；模板编辑中 Esc 先退出编辑，再 Esc 隐藏面板；点击面板外是否隐藏留到 P1，避免焦点事件不稳定引发误关闭。

### 9.2 全局键位策略

- `Option + Space` 默认系统热键，**在 Rust 启动期仅注册一次**；选择该键是避免与 Spotlight 常见的 `⌘Space` 冲突。
- 注册失败不影响应用启动；使用主窗口内 `⌘K` 打开面板作为退路。
- `⌘K`/`⌘N` 仅主 WebView 前台有效，监听时应区分 textarea 以及避免覆盖系统编辑快捷键。
- `↑↓/Enter/Esc` 在面板内控制候选焦点，快捷栏候选如果是变量模板，回车先进入变量输入。
- 使用 `tauri-plugin-single-instance`，且根据官方要求将其排在其他插件之前注册；二次启动时聚焦已有主窗口。

### 9.3 macOS 实机核验

- 验证在 Safari、Chrome、VS Code、终端前台能呼起；多显示器、全屏应用/Spaces 下至少测试主屏场景。
- 检查应用获得焦点后输入框实际接收按键，而不是窗显示了却仍输入到原程序。
- 核验 `Option+Space` 已被其他应用占用时的可用退路和错误提示。
- 如果浮窗行为受 macOS 版本影响，记录操作系统版本、最小复现步骤和解决结果；不能仅凭浏览器 HTML 原型算通过。

## 10. JSON 备份、格式迁移与安全

### 10.1 正式 V1 备份 JSON

```json
{
  "format": "promptdock-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-10-13T09:00:00.000Z",
  "appVersion": "1.0.0",
  "categories": [
    {"id":"uuid-cat", "name":"技术研发", "icon":"code", "color":"#5776CF", "sortOrder":0}
  ],
  "prompts": [
    {
      "id":"uuid-prompt", "title":"代码审查", "description":"",
      "body":"请审查以下代码...", "categoryId":"uuid-cat", "tags":["Codex"],
      "isFavorite":true, "isPinned":true, "copyCount":3,
      "createdAt":1791870000000, "updatedAt":1791870000000, "lastCopiedAt":null
    }
  ]
}
```

以上 UUID 为**格式示意占位值**，真实导出必须是合法 UUID。日期/时间为格式示意；落地不应写死示例时间。

### 10.2 导出

- Rust 原生文件对话框选择目录和文件名，用户取消直接返回 `{cancelled:true}`。
- 同一个数据库事务/一致性只读快照获取全部 prompt + category 数据，构建 UTF-8 JSON。
- 写到用户选择目录下的 `.tmp` 文件，写入完成/同步后原子 rename（注意跨磁盘或覆盖已存在文件的差异）；遇错误清理临时文件，保留旧文件。
- **绝不**直接在 WAL 运行中 `cp promptdock.sqlite3` 当备份。如果未来需要 SQLite 文件级备份，使用 SQLite Online Backup API 或 `VACUUM INTO`，并经测试验证恢复。

### 10.3 导入安全链路

```text
native open dialog → 读取 max 10MiB → 判断正式格式/旧浏览器格式
  → schema/字段长度/数量校验 → 映射 categoryId & name → 冲突预览
  → 用户选择合并或替换 → 二次确认（替换） → 备份（替换必须）
  → BEGIN transaction → 写类别与 prompt → COMMIT → 刷新 UI
                      ↘ 失败 ROLLBACK，现有数据保持不变
```

- 旧浏览器格式示例参考 `reference/sample_import_v1.json`。
- 默认**合并**：同一 ID 同内容跳过，同 ID 不同内容新建 UUID v4、标题加「（导入副本）」；新增分类先按名称去重映射到已有分类 ID。旧浏览器导入时先将非 UUID 的旧 ID 规范为固定命名空间 UUID v5，然后再套用冲突规则，确保再次导入的判断可预测。
- **替换**前必须做一次可恢复备份，且要求用户确认「即将用导入文件替换当前 X 条提示词」。自动备份失败禁止继续替换。
- 导入预览返回 token，Rust 内存保存已校验结果并限制 token 过期（例如 10 分钟）；执行时再次检查 token 对应内容，避免导入预览与真正导入数据不一致。
- 不能在前端把未经验证的 JSON 直接逐行写入数据库；不能在失败时跳过非法条目仍报告成功。
- 文件属于用户私人信息，日志不记录正文/复制内容/明文备份。

### 10.4 为什么要保留「导出 JSON」

本轮没有任何跨设备同步。换 Mac、系统重装、数据库损坏时，唯一正常的数据迁移入口是 JSON 备份；因此导入导出 **P0 不可延期**。可在用户手动操作时导出，不开发自动上传或云同步。

## 11. 安全与权限最小化

- Tauri `capabilities` 仅授予主窗/快捷窗所需权限：剪贴板 `writeText`、窗口显示/隐藏/聚焦、主窗对话框、事件监听；不允许不必要的通配全部文件读写和 shell 执行。
- 业务 Rust commands 只暴露明确的 prompt/category/backup 入口，**禁止**通用 `execute_sql(sql)` 或 `read_file(any_path)` 命令。
- 数据、日志和异常信息默认仅在本机，不包含第三方分析、在线字体、CDN 图片、外部脚本、自动更新机制。
- 若集成可点击外部超链接，必须经过显式白名单或确认；V1 可直接不做外链。
- 防止 XSS：正文预览仅文本渲染；标签/标题作为纯文本，不解释 HTML/Markdown 中的脚本。
- 数据明文保存在 SQLite；macOS FileVault 提供设备层加密。剪贴板内容是系统剪贴板，可能被其他有权限的应用读取；不要声称“复制后只有自己能看到”。
- **可核查的离线性**：移除网络访问代码、Remote URL、自动更新和 telemetry 依赖；测试时关闭 Wi-Fi 验证全流程。

## 12. macOS 打包和开发环境

### 12.1 环境检查（在用户的 Mac 上执行，不猜版本）

```bash
uname -m                       # 预期 arm64，需按真实结果判断
sw_vers
node --version
pnpm --version
rustc --version
cargo --version
xcode-select -p
```

按 Tauri 官方要求安装 Xcode Command Line Tools（**桌面目标不强制安装完整 Xcode**），配置 Rust stable、Node LTS、pnpm。部分官方 Tauri v2 插件当前要求 Rust ≥1.90，版本要以锁定依赖的实际编译结果核对，不能强行使用旧 Rust。

### 12.2 推荐初始化方式

```bash
pnpm create tauri-app
# 交互选择：Vue + TypeScript + pnpm
cd <实际生成的项目目录>
pnpm install
pnpm tauri dev
```

安装插件和 SQLx 等依赖时，**以当日官方文档与实际 Cargo feature 解析结果为准**。不建议把示例版本号硬编码成旧版本；提交 `pnpm-lock.yaml` 和 `Cargo.lock` 以保证构建可复现。

### 12.3 编译交付

```bash
pnpm typecheck
pnpm test
pnpm build
(cd src-tauri && cargo test)
pnpm tauri build
```

产出 macOS `.app` 或安装包由本人在本机使用。开发者签名/公证是向他人分发时的另一个议题；**本人本机编译使用不需要 App Store 上架流程或企业营业执照**。真实安装时若出现 Gatekeeper 提示，应按当前 macOS 的安全设置和本机开发签名情况处理，不建议默认关闭系统防护。

## 13. 测试矩阵与验收证据

### 13.1 前端测试

- `useTemplateVariables`：多个变量、重复变量、空值、Unicode、花括号、`$&`、反斜杠、字面值替换。
- `PromptCard`：复制按钮 `stopPropagation`，主卡片点击详情、收藏独立状态。
- `QuickPalette`：中文搜索、12 条截断、上下箭头切换、Enter 和 Esc。
- `PromptEditorDialog`：空标题、超长正文、编辑未保存退出确认。
- `clipboard service`：writeText 成功/失败；成功才调用复制计数。

### 13.2 Rust / SQLite 测试

- 临时目录建库、迁移后再次启动、默认分类只写入一次。
- CRUD、删除 FK、排序、筛选/中文子串、SQL 注入字符测试。
- 复制成功计数原子递增、更新时间变化正确。
- 导出→清空临时库→导入→逐字段对比；正式格式和旧浏览器格式。
- 大文件、无效字段、重复 ID、替换备份失败、事务回滚。
- 文件权限受限、数据迁移失败时不覆盖原 SQLite。

### 13.3 macOS 手工实测

- **在其他 App 前台**按 `Option+Space` 能唤起，并获得输入焦点；不仅仅是菜单项出现。
- 主界面 `⌘K` 打开内部浮层；Esc 可关闭。
- 点击复制，在 VS Code/Notes/浏览器中粘贴的文本与 SQLite 原文一致（含多行）。
- Wi-Fi 关闭后，所有 P0 功能运行正常。
- 系统退出/重启后重新运行仍有保存提示词。
- 二次打开 App 聚焦现有实例，热键不会注册两次。
- 导入导出到用户选定文件路径，备份确实存在并能恢复。

测试证据：终端命令、exit code、测试输出、Tauri 原生运行截图/简短录屏、DB 实际记录截图/查询结果、未通过项的复现步骤。**静态 HTML 演示和 Toast 不能代替原生功能验收。**

## 14. 分阶段任务建议

| 阶段 | 交付内容 | 验收出口 |
|---|---|---|
| **0. 基础准备** | 新 repo/独立分支、环境核验、Tauri+Vue+TS 空壳、lint/test | macOS 原生窗口能启动 |
| **1. 数据真实落盘** | SQL migration、Rust Repository、CRUD、种子分类 | 重启/断网能保存，DB 真实可查 |
| **2. 高频工作流** | 系统剪贴板、UI 迁移、主窗搜索/筛选/收藏/置顶 | 一键复制跨应用粘贴、组件与原型一致 |
| **3. 快捷浮窗/模板** | Rust global shortcut、独立 quick window、模板变量、键盘导航 | 其他 App 前台真实唤起、Enter 复制 |
| **4. 恢复与稳定性** | JSON 备份导入导出、冲突策略、异常处理、测试、打包 | AT-01~AT-16 逐条实测，`.app` 可用 |

每阶段独立 commit（未经验收不 merge main）；不得先宣布功能完成，再在报告中说“尚未接入真实 SQLite”。

## 15. 特别防坑清单

1. 原型的 `localStorage` 和假数据不能带入正式 App。
2. **不要将 SQLite DB 放在安装目录 / 用户的 iCloud 同步目录**。
3. SQLite 有 WAL 时不能只复制 `.sqlite3` 文件当备份。
4. 主窗和快捷窗必须共享一套 SQLite 数据，而不是各存一份 Pinia/LocalStorage。
5. 不要把业务 SQL 暴露为通用 Rust IPC 命令。
6. 从导入 JSON 读取的正文/标题一律当纯文本显示，不用 `v-html`。
7. 检查 `Option+Space` 快捷键抢占失败时的降级，不让启动崩溃。
8. 区分「复制成功但计数失败」和「复制失败」。
9. 不要伪造自动粘贴、网络功能或 Apple 系统权限。
10. 每个 UI 元素要对应真实行为，不能只靠静态截图通过验收。

## 16. 官方资料与技术依据（2026-10-13 核验）

- [Tauri v2 — macOS 开发前置要求](https://v2.tauri.app/start/prerequisites/)
- [Tauri v2 — IPC / Commands](https://v2.tauri.app/concept/inter-process-communication/)
- [Tauri v2 — Global Shortcut](https://v2.tauri.app/plugin/global-shortcut/)
- [Tauri v2 — Clipboard Manager](https://v2.tauri.app/plugin/clipboard/)
- [Tauri v2 — Single Instance](https://v2.tauri.app/plugin/single-instance/)
- [Tauri v2 — Native Dialog](https://v2.tauri.app/plugin/dialog/)
- [Tauri v2 — Window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/)
- [Tauri v2 — Capabilities](https://v2.tauri.app/reference/acl/capability/)
- [Tauri v2 — SQL plugin（对比方案，可不采用）](https://v2.tauri.app/plugin/sql/)
- [SQLite — Online Backup API](https://www.sqlite.org/backup.html)

> 技术文档说明：API 结构是可执行设计约定，但不是已经编译通过的完整项目。Codex 必须以所安装 Tauri v2/SQLx 版本的实际 API 为准编写，运行本机编译和实测，不可直接宣称「技术文档有示例代码 = 功能已经完成」。


## 17. V1.1 新增「便签模式」的完整技术设计（P0）

### 17.1 第三个原生窗口

原先第 9 章规定 `main` + `quick` 两窗口。V1.1 增加 `sticky`，三者职责不同：

```text
main (普通管理窗口，1360×860) ──────────────┐
quick (全局快捷搜索，680×520，默认隐藏) ──┼── Rust IPC ── 单例 SqlitePool ── promptdock.sqlite3
sticky (五条便签，340×270，默认隐藏) ──────┘
                   │
                   └─ copy service ── macOS Clipboard
```

`sticky` 的 Tauri 配置要点（仅配置意图，实际字段须以项目锁定版本的 Tauri 2 API/Schema 校验）：`label='sticky'`、width=340、height=270、visible=false、resizable=false、decorations=false、background=#FFF3AC、alwaysOnTop=true；设置独立路由 `/#/sticky` 或同等清晰的 window label 分发。不要创建第二套数据库与临时前端演示数组。

应用生命周期：`sticky` 点击 × 只执行 `hide()`；应用菜单或 Dock 菜单提供「打开/隐藏便签」「打开主窗口」「退出」。主窗口关闭但便签还显示时，不能使进程终止。首次运行便签隐藏，后续恢复用户明确选择的可见状态；异常启动应有可靠的主窗口入口。

**按钮/拖动**：窗口顶部不含按钮的区域使用 Tauri 官方 `data-tauri-drag-region` 或 `getCurrentWindow().startDragging()`，依项目权限控制，不能用 HTML 模拟拖动当成 native。`getCurrentWindow().setAlwaysOnTop(boolean)` 控制真实系统窗口层级；建议通过 Rust IPC 验证调用来源窗口标签、统一处理错误。确保 `sticky` 仅拥有必要的 window/clipboard/IPC 权限，不开放文件系统或任意 SQL 权限。

**位置记忆**：监听窗口移动（Tauri `onMoved`）并节流持久化到 `app_settings`，存坐标及显示器/缩放信息；实际移动结束再写，避免高频落库。启动恢复基于当前 monitor/workArea 夹紧坐标，显示器移除后回到主显示器安全位置（不要盖住菜单栏）。也可以评估官方 Window State 插件，但需要按窗口区分状态，绝不能让它自动显示原本应隐藏的 `quick`。本方案优先复用 app_settings 简化依赖。

### 17.2 SQLite migration 002 — 顺序在库内，而不是使用次数

**维持现有 `reference/schema.sql` 作为 migration 001 的基线，再应用 `reference/002_sticky_mode.sql`**；不要将已经含 pin_order 的全新表同时执行 ALTER，避免重复列错误。

```sql
ALTER TABLE prompts ADD COLUMN pin_order INTEGER
  CHECK (pin_order IS NULL OR pin_order BETWEEN 1 AND 5);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_pin_order_unique
  ON prompts(pin_order) WHERE pin_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prompts_mini_list
  ON prompts(is_pinned, pin_order);
```

已有置顶（如果是 V1.0 数据库）第一次升级时按原逻辑 `copy_count DESC, updated_at DESC, id ASC` **只生成一次**初始顺序；前五条设 `pin_order = 1..5`，其他旧版置顶保持原记录与 `is_pinned`，但 `pin_order = NULL`，须可从主库「待整理旧置顶」清单手动处理；无论如何不得删除正文。

Rust 不允许从 UI 直接执行字符串形式 SQL；实现 transaction `BEGIN IMMEDIATE` 语义完成 `pin_order` 排序、置顶、取消置顶。因为有部分唯一索引，交换两条顺序必须先将受影响序号清空，再依次赋新序号，统一事务提交；任何一步失败整笔回滚。

### 17.3 Rust IPC 新增契约

| 命令 | 参数 | 返回 | 规则 |
|---|---|---|---|
| `list_sticky_prompts` | 无 | `PromptSummary[]` | SQL `WHERE is_pinned=1 AND pin_order BETWEEN 1 AND 5 ORDER BY pin_order ASC`，含 id/title/isTemplate；实际复制前根据 ID 重新取全文 |
| `pin_prompt_to_sticky` | `{id}` | `Prompt` | 单事务验证 <5 位空余，分配下一个有序位置；满五条返回 `PIN_LIMIT_REACHED`，不丢编辑态 |
| `unpin_prompt_from_sticky` | `{id}` | `Prompt` | 清空 pin_order/is_pinned，紧凑重新编号，正文不变 |
| `reorder_sticky_prompts` | `{orderedIds:string[]}` | `PromptSummary[]` | 验证与当前置顶 ID 集合完全一致，无重复且 0..5 个；单事务重编 1..N |
| `get_sticky_settings` | 无 | `{visible,alwaysOnTop,position?}` | 位置值按当前显示器校正 |
| `set_sticky_settings` | `{...}` | 设置 | 只允许白名单键和范围，不传任意 SQL |
| `show_sticky_window` | 无 | `{shown:true}` | 存在则显示并置于适当层级，不重复创建窗口 |
| `hide_sticky_window` | 无 | `{hidden:true}` | 仅收起，无退出进程 |

可以按既有 `set_pinned` 命令扩充其事务逻辑，但需保持向后兼容（以前无 `pin_order` 的调用不能出现两个不同真值源）。不要两边分别维护一套 pin 状态 API。管理排序、取消置顶、编辑删除后，Rust 发轻量 `prompts-changed` 事件通知 `sticky`/`main`/`quick` **重新查询 SQLite**；事件只传变更类型和 ID，不广播正文。

主界面顶部 3 条统一使用 `list_sticky_prompts().slice(0,3)`；便签窗口展示 `slice(0,5)`。不以 `copy_count` 对五条重新排序。

### 17.4 复制与模板复用

```text
sticky row click(id)
  ├─ retrieve full prompt(id) from SQLite
  ├─ no {{variables}} → Tauri clipboard.writeText(fullBody)
  │      ├─ success → record_successful_copy → toast/check; sticky stays open
  │      └─ fail → error banner; no count change; sticky stays open
  └─ has {{variables}} → open existing QuickWindow variable form
            ├─ incomplete → no write clipboard
            └─ completed → literal replacement → clipboard.writeText → count
```

点击便签会使 App 获得焦点，用户粘贴时通常仍需要点击目标 AI 输入框；不要为「恢复外部 App 焦点」「自动粘贴」引入 AppleScript、Accessibility 权限、键盘模拟或远程代理。

### 17.5 测试与发布门槛

- Rust：0/1/5 置顶、添加第 6 条、重复置顶、删除中间位置、重排并发、rollback、migration 001→002、旧版 >5 条迁移保留正文。
- Vue：5 行固定、少于 5 个空位、超长标题截断、模板入口、成功/失败 Toast、焦点按钮、读屏名称。
- macOS 原生：窗口独立于 main、关闭 main 不杀 sticky、置顶开关、拖动位置跨重启恢复、多屏断开、Safari/VS Code 粘贴验证。
- 录制/截图可遮挡个人提示词正文。HTML 原型只能证明视觉与 JS 模拟，不能代替上述系统级验收。

参考官方 API（访问/版本核验日期以实施当天为准）：
- https://v2.tauri.app/reference/javascript/api/namespacewindow/ （`setAlwaysOnTop`、`startDragging`、`onMoved`、`hide/show`）
- https://v2.tauri.app/learn/window-customization/ （自定义装饰与拖动权限）
- https://v2.tauri.app/plugin/window-state/ （可选的窗口状态恢复插件）

