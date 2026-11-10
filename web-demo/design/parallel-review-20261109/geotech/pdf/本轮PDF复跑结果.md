# 本轮 PDF 复跑结果

source_id：USER-PDF-CURRENT-RECHECK（用户要求采用新方法提取 PDF 并比较，原文事实）。

使用现有坐标、网格及双栏读取方法重新读取海南、上虞原始 PDF，开启独立 PDFium 数字边界复核。原件只读，结果位于隔离 QA 的 `pdf-current-recheck/`。本轮没有修改正式入口或提取代码。

|样本|页数|恢复原生表|固定人工基准单元格|
|---|---:|---:|---:|
|海南|12|12|25/25 一致|
|上虞|21|7|36/36 一致|

两份文件 SHA-256 与此前同源比较一致。旧方法这两份报告均未恢复结构化来源表；新方法合计恢复 19 张，包含不用于扩初的前言等表。此处 61 格仅为既有固定抽查范围，不是整份报告准确率，也不是本轮新增 61 项改善。对应基准、偏移及逐格值见 QA `cell-checks.json`；全文、来源页码和表格保存在各报告的 `native-report.json`、`native-source.json`，编排文字见 `地勘自动整理.txt`。

本轮 13 项相关 Node 回归通过。真实 PDF 提取与编排成功；未重复浏览器导入或 Word 分页验收。正式 PDF 上传仍待集成。扫描件的层号、数值范围及图表 OCR 仍须专项核对，不能由这两份文字型 PDF 的结果推断扫描件同样可靠。

复跑命令：使用带 pdfplumber、pypdfium2 的 Python 执行 `extract-native-report.py <manifest.json> <输出目录> --verify-numeric`，再执行 `node compose-native-report.mjs <输出目录>`。私有 manifest 和原报告不提交。
