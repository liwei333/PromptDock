# PromptDock V1.1 验收记录表

**环境**：macOS 版本 ______ ｜ 芯片架构 ______ ｜ Tauri 版本 ______ ｜ Git commit ______ ｜ 测试日期 ______

标识：`PASS` / `FAIL` / `BLOCKED` / `NOT_TESTED`。每项补充截图、终端日志或手工操作视频路径。

| ID | 用例 | 状态 | 证据/问题 |
|---|---|---|---|
| AT-01 | 首次离线启动默认 6 类，0 条提示词 | NOT_TESTED | |
| AT-02 | 新建多行提示词，重启后正文完全保留 | NOT_TESTED | |
| AT-03 | 单击复制，外部 App 粘贴逐字符一致 | NOT_TESTED | |
| AT-04 | 收藏与置顶独立保持，重启仍正确 | NOT_TESTED | |
| AT-05 | 中文正文片段检索、列表正确 | NOT_TESTED | |
| AT-06 | Safari/VSCode 前台 Option+Space 呼起并聚焦 | NOT_TESTED | |
| AT-07 | 快捷浮窗 ↑↓、Enter、Esc 生效 | NOT_TESTED | |
| AT-08 | 重复模板变量只出现一输入框，复制全部替换 | NOT_TESTED | |
| AT-09 | 编辑未保存按 Esc 需确认丢弃 | NOT_TESTED | |
| AT-10 | 导出后删除一条，合并导入恢复正确 | NOT_TESTED | |
| AT-11 | 非法 JSON / >10MiB 被拒且数据不变 | NOT_TESTED | |
| AT-12 | 断开网络后完整流程可用，无外发 | NOT_TESTED | |
| AT-13 | 重复运行只能有一个实例 | NOT_TESTED | |
| AT-14 | 模拟剪贴板失败不增使用次数 | NOT_TESTED | |
| AT-15 | 关闭/重开以及非正常终止后已提交记录保留 | NOT_TESTED | |
| AT-16 | 旧浏览器 JSON 格式导入正确 | NOT_TESTED | |

## V1.1 便签模式新增验收（macOS 真机）

| ID | 用例 | 状态 | 证据/问题 |
|---|---|---|---|
| AT-17 | 主窗打开/收起 340×270 的独立便签；主窗关闭后便签仍可用 | NOT_TESTED | |
| AT-18 | 0/1/4/5 条显示正确，超长标题截断，复制全文不截断 | NOT_TESTED | |
| AT-19 | 第六条置顶被拒绝，编辑正文不丢，移除旧条后可添加 | NOT_TESTED | |
| AT-20 | 置顶重排后重启顺序不变；复制次数变化不影响排序 | NOT_TESTED | |
| AT-21 | 便签一键复制后在 Notes/VS Code 粘贴逐字符一致，不自动收起 | NOT_TESTED | |
| AT-22 | 变量模板必须填写才能复制，未完成无原文直出 | NOT_TESTED | |
| AT-23 | 系统级始终置顶开关、拖动/位置记忆、多屏拔插恢复 | NOT_TESTED | |
| AT-24 | 编辑/删除/取消置顶多窗口同步，事务无重复/越界槽位 | NOT_TESTED | |
| AT-25 | 便签断网可用，无自动粘贴/自动发送/越权权限 | NOT_TESTED | |

## 额外非功能测试

- [ ] `pnpm typecheck` 通过；真实命令/日志：________
- [ ] `pnpm test` 通过；真实命令/日志：________
- [ ] `pnpm build` 通过；真实命令/日志：________
- [ ] `cargo test` 通过；真实命令/日志：________
- [ ] `pnpm tauri build` 通过；安装路径：________
- [ ] SQLite 实际路径：________
- [ ] 单机无账号、无自动同步、无远端依赖：________
- [ ] 原生 macOS 不是浏览器 HTML：________

**阻塞缺陷（P0）**：________

**验收结论**：未验收 / 不通过 / 有条件通过 / 通过
