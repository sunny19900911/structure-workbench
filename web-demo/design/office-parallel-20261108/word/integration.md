# Word 专业工具栏与编辑增量

source_id: USER-OFFICE-PARALLEL-20261108、主对话补充产品要求（2026-11-08，原文事实）。

## 高频任务 → 保留按钮 → 收起功能

| 扩初说明任务 | 常驻操作 | 按情境显示或收起 |
|---|---|---|
| 改章节标题与正文 | 正文/标题样式、字体字号、加粗、撤销重做 | 斜体、下划线、删除线、高亮和颜色常驻 |
| 排正文和分条说明 | 段落菜单、项目符号/编号 | 四类对齐和间距在段落菜单，列表缩进常驻 |
| 修改参数表 | 插表；单元格直接编辑 | 进入表格后才显示增删行列 |
| 插入方案示意图 | 插入图片 | 复用内核选中图片的缩放控件，不造第二套图片工具 |
| 继续修改既有成果并交付 | 停笔自动保存、保存、下载、Ctrl+S | 无新增审批或确认卡片 |

设计判断（AI推断）：结构工程师频繁改正文、参数表与图注，因此以这些任务取舍按钮；后续已按用户要求用 REA 核查腾讯文档专业工具栏，证据及有意差异见 ribbon-design.md。


## 本工作树改动

- 分支 `codex/office-word-20261108`；基线 `9265f94`。仅改 `office-editor.js/css/html`，新增 `office-word-commands.js`、`office-word-export.js`、`office-word-ribbon.js` 和本目录测试/记录。未提交、合并、推送或覆盖运行包。
- 使用锁定的 SuperDoc 1.47.2 原生命令；样式下拉从当前 DOCX 已有的正文/标题样式读取，不凭空替换模板。`read().styles` 返回可用样式 ID。正文、表格、图片保持实际 DOCX；不回写工程参数。
- 停笔 1800ms 后自动保存；Ctrl+S 和保存按钮同用 `save()`，沿用 expectedRevision 和不可变文档版本。异步插图期间禁止保存，冲突/失败保留 dirty 和正文，不自动刷新版本覆盖、不循环重放。继续编辑或手动保存会重新尝试。
- 表格工具由内核 selectionUpdate / transaction 驱动显隐。段落格式放单层“段落”菜单。选择型工具执行后重置提示，允许在另一段重复选择相同值。
- 新增列表实测暴露内核导出的 `word/numbering.xml` 缺少 `xmlns:w15`；`office-word-export.js` 仅在使用 `w15:restartNumberingAfterBreak` 且缺少声明时补该声明。检查编号 XML 可解析后才保存；其他 ZIP 部件不主动重写。复用已有 vendor/JSZip，Vite `?url` 将脚本纳入构建 assets，不新增依赖，不依赖远程 CDN。

## 主对话接线（共享文件本树未改）

在 `web-demo/mcp-browser-operations.js` 顶部增加：

```js
import {WORD_COMMAND_ARGUMENTS} from './office-word-commands.js';
```

在 `OFFICE_COMMAND_ARGUMENTS` 对象末尾（必须在后面的 `officeCommandSchema` 构造之前）增加：

```js
...WORD_COMMAND_ARGUMENTS
```

该扩展新增 14 个命令：`paragraph.right`、`paragraph.style`、`paragraph.spacing`、`list.bullet`、`list.number`、`list.indent`、`list.outdent`、`table.addRowBefore`、`table.addColumn`、`table.addColumnBefore`、`table.deleteColumn`、`format.strike`、`format.color`、`format.highlight`。

- 以上都要求唯一 `args.targetText`。`paragraph.style` 还要求 `style`（读取 styles 返回的 ID）；spacing 的 before/after 是磅（0–72），line 是倍数（1–3），至少提供一项；未提供的间距不覆盖。
- `office.command` 原桥接已将这些类型默认为 docx，原有 `WorkbenchOffice.command → executeCommand → save` 可以直接复用，无需增加第二条服务编辑路径或修改 `office-document-api.mjs` / `office-package.py`。
- 命令实际修改、工具栏与保存已验证；新增 MCP 注册尚待主对话上述接线，不能声称已在当前正式 MCP 中可见。
- 打包时核对源码依赖图包含根级 `office-word-commands.js`（MCP schema 运行时需要）。前端 commands/export 和 JSZip 已由 Vite 打包。现有 baota/portable 的递归依赖收集应包含新增 import，最终离线包仍需主对话验收。
- MCP 调用仍需项目 expectedRevisions、明确 unit、documentId、文件 expectedRevision。自动保存可能推进文件版本，调用前重新 `office.read`；不自动重试旧版本命令。

示例（office.command 的 args，外层项目/单体/分区修订沿用已有工具）：

```json
{"documentId":"<当前文档ID>","expectedRevision":7,"name":"paragraph.spacing","args":{"targetText":"本项目结构体系采用","before":0,"after":6,"line":1.5}}
```

## 实际验证

source_id: 本目录 `commands.test.mjs`、`browser-smoke.mjs`、`verify-docx.py` 及 `qa/portable-release/mcp/office-word-tools*/`（实际测试，2026-11-08）。

在 `web-demo` 运行：

```powershell
node --test design/office-parallel-20261108/word/commands.test.mjs design/office-editor/document-store.test.mjs design/office-editor/api.test.mjs
& '<文档 Python 路径>/python.exe' design/office-editor/word-fixture.py qa/portable-release/mcp/office
node design/office-parallel-20261108/word/browser-smoke.mjs
& '<文档 Python 路径>/python.exe' design/office-parallel-20261108/word/verify-docx.py
$env:WORKBENCH_PORTABLE_BUILD='1'
npm run build
node design/office-parallel-20261108/word/browser-smoke.mjs --built
& '<文档 Python 路径>/python.exe' design/office-parallel-20261108/word/verify-docx.py qa/portable-release/mcp/office-word-tools-built
```

- Node 检查 20 项通过：4 项新增命令/schema/XML规则，16 项既有真实存储与 API 检查（项目/单体隔离、并发修订、人工稿、原生文件）。
- 浏览器使用 Edge headless，本树隔离端口 5392（原 58846 被 Windows 保留而拒绝绑定），只在测试期间启动并关闭自己的临时 Vite；未触碰用户原服务。阻断非本机请求，无 pageerror。
- 合成扩初任务包含标题、正文、参数表、A3 双栏、合并格、页眉页脚及示意图。真实 DOCX 打开→文字/格式/样式/列表/表格/图片操作→保存→重开；可见工具栏间距、表格情境显隐、行列操作及撤销、Ctrl+S、自动保存、409 后保留人工稿且不循环重放、手动重试、下载均验证。
- 原生 ZIP/XML 验证：未经编辑往返的正文/节几何/合并/图片/页眉页脚一致；编辑后的标题、字体字号、粗斜下划线、间距、右对齐、两类列表和编号级别正确；删除指定行列、插入表格图片生效；保存与下载可见内容一致；全部 XML 可解析。图片哈希、A3 双栏、页眉页脚保留。
- 构建成功；保留项目原有非 module script 与大 chunk 警告。浏览器源码模式保留 Vue feature flag 警告，未当作运行错误。
- 本树缺少安装用 package-lock，`npm ci` 无法执行；采用已有主工作区 node_modules 的目录联接，核实 superdoc 版本 1.47.2。未修改 package.json、锁文件或安装依赖；测试缓存放本树 QA。

## 验收边界

浏览器文件接口使用明确的隔离 API 夹具，实际保存字节写入 QA；真实存储/API 另由上述既有测试覆盖。未声称本轮已经完成整站 MCP 端到端接线、正式项目测试、Word/WPS 全版本兼容或像素分页一致。图片选中缩放沿用内核，没有新增 MCP 图片缩放命令。样式只展示当前文件已有的常用样式；缺失的样式不自动造模板。本轮技能沉淀在本目录 skills/，公共技能索引未改。

## 腾讯文档参考增量验收

source_id: REA evidence 与 ribbon-design.md（2026-11-08，实际观察）。新增删除线、字体颜色与高亮已检验实际 DOCX XML；视图缩放、选项卡键盘切换、390px 下插入菜单定位和 Escape 关闭通过。20 项 Node 检查、构建和真实浏览器保存重开通过。缩放时 Vite 日志有两条 ResizeObserver 通知循环警告，页面操作和保存正常；不把它说成完全无告警。匿名腾讯文档仅查看，未验证腾讯编辑/云保存；当前为开始/插入/视图三个可用选项卡，其余页面/引用/审阅及云端能力未复刻。

## 第二轮功能扩展

用户要求补齐功能后，已扩为六页签。最新功能、测试、REA证据及MCP注册增量见 [extended-delivery.md](extended-delivery.md)，覆盖前文三个页签的旧边界。
