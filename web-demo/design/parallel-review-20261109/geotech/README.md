# 04 地勘专项交接

最新：[第二轮修复与盲测](第二轮修复与盲测.md)。用户已授权继续修复三个明确漏项并复用现有报告选样；下文保留首轮记录。最新方向优先地勘准确度和 MCP，不再投入网页 Word/PPT 编辑器。

source_id：USER-PARALLEL-REVIEW-20261109（用户要求，原文事实）。

首轮已完成训练回归、新项目盲测及 PDF 独立测试；**跨项目完整性未通过，不应据本次自动测试通过发布“地勘完整提取”版本**。按任务要求停止扩展下一轮，等待抽检。

## 分支和文件

- 工作树：`C:/Users/mj528/.codex/worktrees/d4b8/004 工作`。
- 分支：`codex/review-geotech-20261109`；共同基线 `b51364de600376dadf9f7a48d1687ea9977ed3b6`，HEAD 已核实包含基线。
- 源码修改：`geotech-numbered-sections.js`、`geotech-document.js`。
- 新增源码：`geotech-tables.js`、`geotech-pdf.js`。
- 测试、验收脚本和技能副本仅在本 `geotech/` 目录。
- 未修改共享 HTML、`document-intake.js`、`intake-structure.js`、`reference-report.js`、Office 壳、依赖清单/锁、AGENTS 或公共技能索引。`server/word-source.py` 经读取核对，本轮未改。

## 已实现

以下为源码和测试事实，source_id：本目录 `regression.test.mjs`、`pdf/pdf.test.mjs`。

1. 补地貌/地形词序、地层结构/特征描述、物理参数及基础方案标题；按章节层级隔离气象、任务及附件目录。
2. 目录带页码和附件清单不再作为有效段落；目录后的 Word 自动编号标题可重新进入正文。最后一项来自历史样本回归中发现的本轮退化，已修正。
3. 横向土层参数表转置；分表采用明确层号关联，保留同名不同层，不任取冲突值。复杂桩型并列时保留原表条件，不随意选一种。
4. 地层表、物理参数、表注、地下水及抗浮表以原标签、单位和取值补入对应正文，底层保留原行、原表及来源位置。此方式目前较长，尚非最终精简编排。
5. 修正旧 `strength.rows[*][4]` 把黏聚力放进模板压缩模量栏的问题。仅明确 `Es0.1-0.2` 且单位匹配时映射；`Es1-2`、`Es/Eo`、不同试验或含糊单位留在原表文字，不猜换算。
6. 新 PDF 模块按坐标排列文字、保留列间隔与页码、识别无文本页；仅尝试明确等列简单表格。**模块未挂入共享入口，三份真实 PDF 均未恢复可用参数表，未执行 OCR。**

## 第一轮结果

原样文件在 `E:/!!!!!!!!TO WORK/20261109/地勘复核/第一轮-20261109-1409/`。没有覆盖上午盲测，也没有手改导出 Word。

|组别|项目|结果与未完成项|
|---|---|---|
|训练回归|信阳|4.2恢复，参数表7行；压缩模量/变形模量联合标题保留原文，固定栏不猜填。|
|训练回归|启东|逐层表进入4.2，参数表11行；附件清单和气候正文已排除。波速/场地类别分表仍未完整映射固定场地表。|
|训练回归|上海|4.1/4.2恢复，参数表3行；附件目录排除。两类桩参数保留分列原文；不挑一类填入合并表。|
|新项目盲测|上虞|4.2描述有内容但层名被当标题丢失；4.3固定表仍空。报告引用的附表参数不能等同此文字DOCX已经包含数据。|
|新项目盲测|云南旅游学校|首次盲测退回关键词法，存在混章。历史自动标题回归修正后，地形/地层/水文按章恢复；仍有图片标题残留、单位缺失、复杂桩表及抗浮水位表未映射，未判完整性通过。|
|新项目盲测|湖北影院DOC|读取/导出成功，但“地层概述”未匹配，4.2空；建议参数表仍未进入固定表。统计表虽保留统计类别，但长段文字不适合直接作为精简成稿。|
|PDF独立|信阳、上虞|两者是同项目不同格式对照，不算新项目盲测。文本层可读；复杂表格均未恢复，信阳图表/附件文字混排明显。|
|PDF独立|临港|91页中14页有文本，77页无可提取文本；目视第17页确认是扫描的地层特性表。其余无文本页可能为扫描/图纸/空白，未逐页分类，未OCR。|

来源：各组 `ui-results.json`（输入输出路径、哈希、项目ID、回读结果）；各 `*-capture.json`（实际网页源数据、状态和导出包）；本树隔离 QA 的 `pdf/evaluation.json`、`rendered/native-validation.json`。上表是本次观察事实；原因推断需与下一轮原文逐项复核，不能升级为规范结论。

首次盲测冻结后，历史六项目补回归发现自动标题退化。已保留 `新项目盲测/` 的首次结果；`历史回归修正后复验/` 是同三项目复验，不冒充第二批新盲测。上虞和湖北两份 DOCX 哈希与首次完全一致；云南旅游输出变化。首次解析器哈希在隔离 QA 的 `first-freeze-hashes.json`。

## 验证

- 43项相关自动测试通过（含11项本专项测试），历史六样本24个原有关键片段复查通过。
- 9份首次网页导入，以及3份历史回归修正后复验：上传→自动生成→保存→刷新→下载均完成，输入哈希不变。
- 首次9份及复验3份DOCX，共204张表逐单元格与浏览器导出包比较，无差异；文件均由 Microsoft Word 只读打开并导出PDF。云南复验件11页。全部输入和输出在渲染后的哈希复查不变，最终源码与最新9份网页capture的地勘结果一致。
- 已查看所有首次输出的分页缩略图和地勘关键页；表格值核对不等于全文或所有版式细节通过。PDF信阳明显混排、参数表空等缺陷原样保留。
- `npm run build` 通过，保留已有非module脚本与大chunk警告。没有提交依赖变化。
- 文档技能 `render_docx.py` 因本机缺少 bundled LibreOffice 不可用，改用仓库现有只读 Word 渲染脚本及 Poppler；未用用户桌面 LibreOffice。

在 `web-demo` 执行：

```powershell
node --test design/parallel-review-20261109/geotech/regression.test.mjs design/parallel-review-20261109/geotech/pdf/pdf.test.mjs design/project-integration/geotech-diversity.test.mjs design/project-integration/numbered-source-regression.test.mjs design/parallel-hardening-20261108/intake/quality.test.mjs design/reference-expansion/reference.test.mjs design/project-integration/document-intake.test.mjs
npm run build
```

实际页面：`http://127.0.0.1:5444/workbuddy-integrated-studio.html`，隔离库为本树 `web-demo/qa/parallel-review-20261109/geotech/store`。启动进程明确设置 `WORKBENCH_PROJECT_STORE`；`DEEPSEEK_API_KEY_FILE` 指向不存在的QA路径，未访问密钥。没有操作正式603、关闭他人服务或推送远端。

## 总控处理

- 可合并 DOC/DOCX 的有限修复及回归证据；保留“首轮未通过完整性”的限制。
- `detailedGeotech` 原契约不变，新增的 `source-N` 原表项可被现有消费者忽略；`strength`、`pile`、`site`键继续兼容。请勿把正文提取结果视为工程采用参数。
- PDF挂载建议见 `pdf/接入建议.md`，本轮未抢改共享入口。真实样本表格未通过，建议先保留为实验模块，不宣称PDF完整提取。
- 下一轮优先处理层名作为语义内容、其余地层/参数标题、分区和统计类别的表格语义、公式/单位以及PDF跨行/扫描表。先由用户抽检本轮原样输出，再选择新项目；不把现有九份复跑称作新盲测。
