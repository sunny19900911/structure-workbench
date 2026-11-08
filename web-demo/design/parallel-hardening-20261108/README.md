# 三个工作树并行改进

source_id: USER-PARALLEL-HARDENING-20261108（小香金猪授权保存当前源码到 GitHub，建立三个工作树和专项对话；原文事实）。

本次先保存离线版、Office 基础编辑与 MCP 的现有源码，再从同一 main 基线并行开发。以下是任务分配，不表示修复已经完成。主对话负责最终合并、集成测试、版本号与重新打包。

| 对话 / 建议分支 | 合并后的任务 | 独占修改范围 |
|---|---|---|
| 01 保存可靠性 / `codex/storage-reliability-20261108` | Kimi：原子保存、损坏版本恢复、恢复后的修订一致性 | `server/project-store.mjs`、`project-store-client.js`、`design/project-integration/project-store.test.mjs`；新增存储辅助文件用 `project-store-` 前缀 |
| 02 MCP 稳定性 / `codex/mcp-stability-20261108` | Kimi：同一数据目录单服务；后台页面连接与任务恢复；状态查询不隐式启动 | `server/mcp-local-client.mjs`、`server/mcp-browser-bridge.mjs`、`server/mcp-tools.mjs`、`server/mcp-server.mjs`、`mcp-browser-bridge.js`、`deploy/portable/start.mjs`、`deploy/portable/launch.ps1`、`design/mcp/`、`design/portable/mcp-browser*.test.mjs`；新增服务锁文件用 `portable-service-` 前缀 |
| 03 资料提取准确度 / `codex/intake-quality-20261108` | WorkBuddy：章节语境筛选、表格结构保真、按单体映射与正文去重 | `intake-core.js`、`document-intake.js`、`geotech-document.js`、`intake-workbench.js`、`server/intake-api.mjs`、`server/word-source.mjs`、`server/word-source.py`、相关 intake/document-intake 测试；新增提取辅助文件用 `intake-` 前缀 |

以上路径相对 `web-demo/`。需要修改非本组文件时，先在本组交付说明写清接口建议，留主对话集成，不能顺手修改别组文件。

## 各组必须验证的结果

1. 保存组：临时文件不被读作正式版本；中断、损坏或磁盘写入失败后上一份完整数据可读；全部损坏不能伪装空项目；版本校验、已删除项目和人工稿行为保留。不要仅按上一份好文件的 revision 重用损坏版本号。保留故障证据，不自动清理历史。
2. MCP 组：双击启动、两个 MCP 客户端并发启动共用同一数据目录的一份服务；锁可恢复且核验进程身份；不同数据目录互不影响。后台/休眠恢复后重新连通，隐藏页面不能当作关闭页面注销；区分未连接、暂未响应、执行中。已开始的写入遇到超时先核对结果，不盲目重放。不要杀正式服务。
3. 提取组：任务书、目录、空表头不充当场地结论；有效表注和适用条件保留；表头、单位和数值正确对应；项目名不能取其他字段标签。一个片段可有多个不同事实，去重不能丢信息。建筑字段按单体归属，地勘建议保留建议性质，来源类型与信息类别分开。人工正文不覆盖，不增加逐条确认、理由、置信度操作卡片。

## 开发与交付

- 每组只在自己的新工作树写文件；不要在 `C:/Users/mj528/Documents/004 工作` 或旧工作树开发。先核对分支和 `git status`，再创建上述 `codex/` 分支；已有分支不重置。
- 允许提交本组完成并验证的修改；不得自行推送 main、合并其他工作树、改远程仓库设置、发布软件或覆盖运行中的离线包。公共 `AGENTS.md`、`package.json`、锁文件、发行版本与打包脚本由主对话统筹。
- 不新增依赖优先；需要依赖时记录交给主对话决定。依赖安装使用当前仓库锁文件。环境缺依赖与代码失败分别记录。
- 测试库设置在各自工作树 `web-demo/qa/parallel-hardening/<组名>`，不操作 `%LOCALAPPDATA%` 的真实项目或正式 603 库。测试源码允许合成例子，原建筑/地勘文件、用户资料与完整报告不提交 GitHub。
- 交付说明分别写入本目录 `storage/`、`mcp/`、`intake/`，包含改动、命令、结果、局限、提交 SHA。技能沉淀也先写各自目录，由主对话汇总到公共索引。
- 主对话验收后按保存组 → MCP 组 → 提取组顺序合并；再次检查差异、相关回归和生产构建后推送 main，重新生成离线包与 MCP 配置。失败的验收不得标成完成。

## 反馈依据

- Kimi 反馈由用户在主对话提供：上述三项经当前代码复核。跨进程同修订写入不能只靠现有进程内队列与 409；损坏恢复不能只加一行 rename。
- WorkBuddy 的问题清单及 124 条 CSV 为本机测试资料。54 条是规则标记，不等同真实错误率；全部标为 candidate 不足以证明所有正文生成路径都未受影响。需沿实际编排链验收。
- Codex 工作树机制参考：[OpenAI 官方说明](https://learn.chatgpt.com/docs/environments/git-worktrees)。独立目录以提交为共同基线；文件分工降低冲突，最终仍需集成验证。
