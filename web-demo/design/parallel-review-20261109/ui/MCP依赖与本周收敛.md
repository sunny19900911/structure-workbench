# 本周转向 WorkBuddy / Kimi MCP 工作流

source_id：USER-MCP-PRIORITY-20261109（总控转达用户本轮指令，原文事实）。本文件覆盖本目录《交接.md》中“生成后进入 Word/PPT 编辑器”和编辑器扩展目标。前一提交及其历史验收证据保留。

## 当前已完成

网页顶部复用“成果”入口。打开时只列当前单体已保存成果；“生成 Word · PPT · Excel”仍调用原生成器并保存原生文件，完成后展示 Word **内容预览**。Word/PPT 文件列表打开的是只读预览，不加载编辑器；下载仍来自保存的真实文件。预览绑定 `fileRevision`，不从最新工程正文重新生成来冒充已保存文件；Word 表格保留已提取的横向/纵向合并。完整分页、母版/图表与所有 Office 外观仍以下载文件为准。

PPT 独立导航入口退出主流程。原 `prototype.html` iframe 保留在隐藏组件中，现阶段继续承担生成和旧 MCP 调用；这仍是浏览器依赖。Excel 保留原编辑能力，文件打开入口仅接受 XLSX，没有增加功能。没有物理删除编辑器源码、历史文件或数据。

本轮修改 `office-workbench.js/css`、`integrated-modules.js`、主 HTML、新增本目录 `office-preview.js`，并更新专项 QA。未修改公共 MCP 服务、工具 schema、Python 生成器或其他专项文件。

旧 `WorkbenchOffice.open/read/command/save` 为兼容现有 MCP 暂保留，Word/PPT 命令调用仍可能打开旧编辑器；网页不再提供它们的主入口。没有宣称 Word 的原生排版命令已经迁往后端。

## 核查到的真实依赖

下表是源码事实，不是未来能力承诺。路径相对 `web-demo`。

| 操作 | 当前执行位置和依赖 | 无工作台页面时 |
|---|---|---|
| `workbench_project_list/read`、项目备份/导入、文件格式/Word读取、计算书源清单/母件读取 | `server/mcp-tools.mjs` 直接请求本机 HTTP 服务 | 可处理已保存状态；不包含网页未保存草稿 |
| `workbench_engineering_check`、`workbench_seismic_lookup`、工程资源/提示词 | `server/mcp-server.mjs`、`server/mcp-engineering.mjs` 读取已存分区或纯规则 | 不依赖编辑器；不等于专业审签 |
| `project.context/create/open/save`、`measures.*`、`document.import`、`intake.*`、`seismic.update`、`expansion.*`、`regulations.*` | 全部在 `mcp-browser-operations.js`；`server/mcp-tools.mjs → /api/mcp-browser/execute → mcp-browser-bridge.js → W/I/E/L` | 需要匹配项目的已注册页面；部分纯读取也需要网页 |
| `workbench_export_document` | 服务工具先通过网页 `document.package` 组稿，再请求 `/api/expansion/document` | **混合链路**，工具列在 SERVICE_TOOLS 不等于不依赖网页 |
| `workbench_calculation_export` | 先网页 `calculation.package`，再 `/api/calculation-book/export` | 同样依赖网页组稿 |
| `office.generate` | `office-workbench.js`：W.flush → E.mcp.generate → E.documentPackage / L.params → M.mcp.openPpt → WordDocumentView.createBlob → PPT export → 文件登记 / generate-xlsx | 目前整套生成不可脱离网页 |
| `ppt.read/edit/image/export` | `integrated-modules.js` 组快照并打开同源 iframe；`prototype.js` 持有当前单体、人工稿、图片、保存队列 | 需要页面和隐藏 iframe |
| `office.list/import/download/versions` | 直接 `/api/office-documents/...`，版本与原件存储由 `office-document-store.mjs` 管理 | 不需要编辑器 |
| 原生 PPT/Excel `/view`、`/command` 与 `/generate-xlsx` | `office-document-api.mjs → office-package-router.mjs → office-ppt/excel-package.*` | HTTP 服务已有这些能力，但当前 MCP `office.read/command` 仍绕网页 |
| DOCX `office.open/read/command/save` | SuperDoc 控制器在 `office-editor.html/js`，MCP 仍由浏览器调用 | 没有对应的完整服务端 Word 命令能力；不能直接把 DOCX 指向现有通用 `/view`/`command` 来宣称支持 |

更具体的 DOM 依赖：

- `mcp-browser-bridge.js/context()` 从 `L.params()`、`I.units`、页面 dirty 状态和分区修订组合上下文。
- `document.package(measures)` 克隆 `#paper1` 清理工具节点；扩初用 `E.documentPackage()`，规范用 `E.localRegulationHTML()`。
- `expansion-workbench.js` 的参数同步、人工稿保留和生成逻辑混在 UI 控制器；纯逻辑已分散在 `intake-core.js`、`document-intake.js`、`workflow-core.js`、`default-expansion.js`、`reference-report.js`。
- `integrated-modules.js/outputSnapshot()` 聚合 main/intake/当前扩初/其他扩初/modules，iframe 的 `prototype.js` 再合并 `ppt.unitDrafts[unit]` 的人工文字、图片。
- `cafeteria-export.js` 直接使用 `DOMParser`、`XMLSerializer`、`window.JSZip`、`fetch` 模板，以及 `Image/canvas` 图片处理。`buildCafeteriaSlides` 的纯数据计算可以复用，最终打包还不是 Node 无浏览器代码。

## 最小脱离网页方案（建议，尚未实施）

按本周需求先实现“资料/参数 → 扩初草稿 → 原生文件”，不迁移 Word/PPT 网页排版编辑器。

1. **服务端已保存上下文**：复用同一项目库读取 main/intake/目标 expansion/modules/ppt/lifecycle/portable-assets 的修订。新增或改造 MCP context 明确返回 `stateOrigin: saved`、参数版本、目标单体、来源版本和 `expectedRevisions`。服务端不知道浏览器未保存草稿时必须返回未知，不能虚构 `hasUnsavedChanges:false`。网页存在时仍沿用原保存/冲突处理，不直接覆盖其未保存稿。
2. **统一参数与资料业务服务**：把 `I.readFiles/ingest`、`L.adoptParameters`、`E.syncParams/refreshDefaultSections` 的数据逻辑从 DOM 控制器抽出；复用既有读取器、提取器、`combinedParameters`、`reconcileSection`。输入显式 projectId/unit/来源版本/expectedRevisions，保留来源、人工覆盖、签发快照和冲突；网页与 MCP 调同一服务，不建立第二套参数逻辑。本周地勘准确度修复接入该服务，避免另写一个简化解析器。
3. **服务端组稿与 Word 生成**：从已存状态构建现有 `reference-report` 规格，继续调用 `/api/expansion/document` 和 `server/reference-docx.py`。统一措施正文已经在 main.paper，需复用现有清理规则生成规格，而不是让客户端传任意整篇 HTML 作为当前项目事实。优先完成扩初 DOCX；复杂旧原生 Word 编辑命令维持兼容或明确退役，不列入本周后台化范围。
4. **PPT 无浏览器适配器**：将 `outputSnapshot`、单体人工稿/图片合并提成纯函数，继续使用 `buildCafeteriaSlides` 和同一模板；用已有 Python OOXML 能力处理模板 ZIP/XML 和图片，或由总控决定 Node XML 适配。保留图位、母版、人工文字及来源参数版本。仅把 iframe 放隐藏浏览器属于过渡运行方式，不算脱离浏览器。
5. **成果编排接口**：由总控提供一个服务端生成业务入口，输入 projectId/unit/expectedRevisions，输出 batchId、sourceParameterVersion、来源修订和真实 documentIds。复用原文件存储；生成前后核对输入版本，变化时明确失败/已保存部分，不把旧内容标成新参数版本。现有存储是逐分区 CAS，不能把它说成已有跨分区事务；项目写入串行和中断恢复需在公共服务统一实现。
6. **MCP 最小迁移**：context、资料导入、参数修改、扩初生成、成果生成依次改走上述服务。`office.list/download/versions` 直接复用；如需读取现成 PPT/Excel，可将 MCP 读取改为服务 `/view`。原生 Word 排版修改不迁移。同步修改 `mcp-tools.mjs`、`mcp-browser-operations.js`、`mcp-engineering.mjs` 的描述，停止把新主流程写成“先打开编辑器”。这些均由总控负责，本树只交接依赖。

验收最低要求：没有浏览器进程时完成三项目资料导入→参数读回→自动稿生成→原生下载；核对来源、单位、单体、版本、人工稿和重启读回。并发409/超时恢复另测。前述要求未通过前，继续对外声明哪些操作需要页面，不能统称“后台 MCP 已完成”。

## 本轮验证

相关回归28项通过，生产构建通过（保留既有静态script和大包警告）。本轮三份下载原生文件的ZIP CRC及全部XML可解析性通过，DOCX含输入资料文字，XLSX含保存后的人工文字。

- 新网页完整回归：`qa/parallel-review-20261109/ui/browser-1794223429495/results.json`。实际上传建筑文本，主动生成三份文件，Word/PPT只读预览和下载，隐藏PPT生成组件，Excel输入、公式、筛选/清除、保存重开下载；无 pageerror。预览后 Word fileRevision 仍为1。
- 原人工文件预览：旧项目已保存版本3的 DOCX 真实显示此前“侧栏下载同步”“界面验收保留文字”，没有回退到新生成的参数稿。
- 真实网页 MCP 桥：`qa/parallel-review-20261109/ui/mcp-page-generation.json`，`project.context` 与 `office.generate` HTTP 200，返回 docx/pptx/xlsx 三个已保存文档，Office 编辑器 iframe 数为0，PPT生成 iframe 隐藏。
- 无匹配网页的真实服务测试：`mcp-dependencies.test.mjs` 使用新建隔离项目，调用真实 MCP 分派函数和 HTTP 服务；项目读取、Excel服务生成、`office.list/download` 成功，`project.context` 与 `office.generate` 均为 `BROWSER_REQUIRED`。证据 `qa/parallel-review-20261109/ui/mcp-audit-1794223558489/results.json`。
- 没有测试 WorkBuddy/Kimi 的外部账户、配置或 STDIO 客户端连接，不把 HTTP 桥验收写成客户端接入成功。

运行：先在 `web-demo` 执行 `node design/parallel-review-20261109/ui/qa-server.mjs`，再执行 `node design/parallel-review-20261109/ui/browser-acceptance.mjs`、`node --test design/parallel-review-20261109/ui/mcp-dependencies.test.mjs`。仍用5446及本树隔离数据，不触碰正式库。
