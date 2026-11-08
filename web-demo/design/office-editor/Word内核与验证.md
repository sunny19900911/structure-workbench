# Word 本机编辑

source_id: QA-OFFICE-WORD-20261108（实际测试）；用途：工作台生成的 DOCX 直接打开、编辑、保存和再次打开。

- 内核锁定 `superdoc@1.47.2`，其 npm 包附 AGPL-3.0；不使用含专有 DOCX Engine 的 v2。来源：包内 `package.json`、`LICENSE`、公开类型声明和 [官方源码](https://github.com/superdoc/docx-editor)。分发须保留许可证及对应源码要求。
- `office-editor.html/js/css` 是同源编辑容器；实际 DOCX 经项目文档接口保存，不把 HTML 改后缀。遥测关闭，资源由本机提供。
- UI 与 MCP 使用同一个 `executeCommand({name,args,expectedRevision})`。文字替换要求同段唯一原文；MCP 的格式、表格和图片操作通过唯一 `targetText` 定位。保存版本冲突时编辑内容留在当前窗口；正文保存期间暂时禁用输入。
- 操作：文字替换，粗体/斜体/下划线、字体字号、左/居中/两端对齐，插表/增删行、插入 PNG/JPEG、撤销/重做。读取、保存、下载共用当前文档。A3 页面通过内核缩放适应窗口，不做 CSS 变形。

## 已验证

在 Edge 无头浏览器阻断外网请求，真实 DOCX 打开→修改→保存→重开，拒绝旧版本。A3 双栏合成文档与现有扩初生成器的 16 表格文档均通过；实际 XML 复查 A3 页面、双栏、表格数量、横纵合并、可见正文、页眉页脚、图片哈希。额外 14 个工具命令执行后重新打开保存文件，核实字体、字号、格式、增表、删行和新增图片。

真实扩初母件有一份隐藏在纵向合并续格中的重复“同建筑设计说明”，编辑器导出会去掉该隐藏重复；可见首格与独立行均保留。验收记录明确保留这个规范化差异，不声称 ZIP/原始 XML 无损，也未证明所有历史 Word 文件或 Microsoft Word 像素分页一致。字体显示依赖同事本机字体。

测试脚本：`word-fixture.py`、`word-browser-smoke.mjs [--real|--commands]`、`verify-word-roundtrip.py <QA目录>`、`verify-word-commands.py`。测试 API 是隔离夹具；整站真实存储与 MCP 验收由根任务执行。

证据均在忽略目录 `qa/portable-release/mcp/office/`：`browser-verification.json`、`real-template/roundtrip-verification.json`、`commands/command-file-verification.json` 及截图/原件/保存副本。未写入真实项目。
