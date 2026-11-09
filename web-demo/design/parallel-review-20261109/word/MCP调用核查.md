# 原生 Word 与计算书的 MCP 调用核查

source_id: USER-MCP-FIRST-20261109（主对话转达用户新方向，原文事实）；核查时间：2026-11-09。

本轮保留提交 `5d80b2e`，停止新增或深化网页 Word 编辑器。原生扩初 DOCX、模型指标修正、计算书封面清理和参数联动继续有效。新增内容仅为本组隔离服务、真实 MCP 验收脚本和交接，不改公共 MCP 路由或界面。

## 调用链与浏览器依赖

| 能力 | 当前工具 | 依赖及边界 |
|---|---|---|
| 导入模型 OUT 并提取指标 | `workbench_document_import`，`args.slot=yjk` | 通过主页面 `ExpansionWorkbench.importFiles` 和现有解析器；需要主页面，传当前单体与修订。新指标修正依赖本组共享 HTML 挂载补丁。 |
| 更新统一参数、生成扩初 | `workbench_measures_update` → `workbench_expansion_generate` | 需要主页面，沿用修订冲突和人工稿保护。 |
| 改扩初原生表格值 | `workbench_expansion_read` → `workbench_expansion_table` | 使用已有行键更新扩初数据，随后进入原生 DOCX；不打开 SuperDoc，也不新增页面交互。 |
| 导出扩初/统一措施 DOCX | `workbench_export_document` | 主页面生成同一文档规格，服务器 `reference-docx.py`/原导出路径生成真实文件；不需要网页 Word 编辑器。 |
| 计算书 DOCX | `workbench_calculation_export` | 主页面 `calculation.package` 提供目录、当前项目/单体和软件，再由服务器脚本生成。unit/software 接口白名单补丁仍须总控接入。 |
| 已保存 Office 文件列表、导入副本、下载版本 | `workbench_office_list/import/download/versions` | 直接调用服务器文档库，不依赖页面或在线编辑器；保留真实原生包。 |
| 整套成果生成 | `workbench_office_generate` | 源码核查：主页面编排且会加载旧 PPT iframe，才能生成三文件；不能因撤下编辑入口而删除这条生成依赖。本轮未重测整套 PPT/Excel。 |

上述“需要主页面”是当前业务实现限制，不代表用户必须进行逐步点击操作；MCP 可在页面保持打开时完成调用。此次用 MCP SDK 的真实 STDIO 协议连接本树服务验证，未操作 WorkBuddy/Kimi 的客户端设置或宣称两款客户端 UI 已接入。

## 总控待处理项

1. `server/mcp-tools.mjs` 的 `calculation_export` schema 只有 projectId/confirmed，缺少显式 unit；`mcp-browser-operations.js` 的 `calculation.package` 也未列入 requiresUnit。建议让导出工具要求 unit，并把 `calculation.package` 设为 requiresUnit。现有 `browserCall` 已传递 input.unit，桥接层会校验与页面单体一致。必须补多页面/多单体回归，单页面通过不能代表不会串单体。
2. 实测页面刷新后旧 browser client 未立即注销，`project.context` 请求可排到已离开的连接并等待超时。后续测试等待新 client ID 注册完成再发请求；此等待是测试同步，不是产品修复。公共桥接负责人需要处理旧连接注销/代际与未开始任务，不可自动重试已开始的写操作。
3. 去掉 Word/PPT 编辑 UI 时，保留主页面的编排逻辑以及原生服务入口。`office.read/command/save` 目前仍走编辑 iframe，不能包装成服务器原生编辑能力。旧 `office_list` 工具描述和 engineering/office 工作流中的“生成后直接编辑”推荐需由总控按新范围更新。
4. 本树本轮没有修改主共享源码，原生链路的 HTML 与 vite payload 补丁仍见 `总控共享补丁.patch`；其中 office-editor focus 补丁已降为历史备查，不是新方向必需项。

## 复跑与证据

真实 STDIO 六项检查全部通过，0 个 pageerror；`verify-mcp-native.py` 对本轮扩初、计算书和下载副本三份实际 DOCX 的 XML、表格值、周期与层号、A3 页面、当前单体/软件及历史身份残留检查全部通过。扩初原件与保存后下载副本哈希相同。最后一项在关闭主页面后执行，不经过编辑器。

本轮隔离项目 ID：`3d0e746f39c2499b96804c081d2e6a8d`。模型输入为合成 QA 工况，没有真实工程验算含义。直接回归命令 `node --test design/parallel-review-20261109/word/results.test.mjs design/mcp/mcp-service.test.mjs design/mcp/office-mcp.test.mjs` 共 36 项通过；其中旧 Office 命令检查只是兼容性回归，不是继续开发在线编辑器。

刷新旧连接的首次实测确实以 `TASK_EXPIRED` / HTTP 504 失败，失败项目为 `e227c0f7dec44f758932afbcaae58966`；等待新 client 注册后的最终完整链路成功。两者分别记录，未将公共桥接问题标成修复。

在 `web-demo` 中启动 `node design/parallel-review-20261109/word/qa-server.mjs`（5441），运行 `node design/parallel-review-20261109/word/mcp-native.mjs`，再用带 python-docx/lxml 的 Python 运行 `design/parallel-review-20261109/word/verify-mcp-native.py`。

测试拒绝非本树 QA 数据目录；每轮创建新项目，合成 OUT 只写入 `qa/parallel-review-20261109/word`。fixture.py 用于首次准备 QA 服务的历史 Word 样本。工程输入在调用前后比对哈希；没有使用正式项目、禁用归档模型或外部密钥。

详细结果写入忽略目录的 `mcp-native-result.json`、`mcp-native-verification.json`；MCP 真实产物在同目录 `exports/MCP/`，不提交。测试覆盖协议握手/资源、缺浏览器明确拒绝、模型工况/层号、参数更新与旧修订拒绝、表格保存重开、原生导出、关闭主页面后的副本登记与下载。最终成功状态以这些结果文件为准。

已知排除项：不重做网页 Word 编辑器，不处理 SuperDoc 排版保真；不声称无浏览器生成；不声称真实模型盲测；不声称“3D3S 准 A3”独立入口已找到；不声称完成 WorkBuddy/Kimi 客户端配置。
