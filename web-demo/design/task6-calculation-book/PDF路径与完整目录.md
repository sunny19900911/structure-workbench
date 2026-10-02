# 计算书目录与 PDF

## 来源

- **原文事实**，`USER-20261002-CALCBOOK-PDF`：小香金猪要求完整保留 Word 目录，输入盈建科输出路径后在旁侧列出相应 PDF。
- **原文事实**，`CALCBOOK-WORD-CATALOG`：`E:/600-工作台数据库/610-待处理/01-计算书/结构计算书内容-媒体楼.docx`。四组条目数量为 1、13、8、5，共 27 条。SHA-256：`4233f631b8dac38e30dfe03a2b19fe8a6edde793e3f078634b586cf2b3628d14`。
- **原文事实**，`QA-CALCBOOK-PDF-20261002`：在用户指定的 `E:/600-工作台数据库/610-待处理/模拟yjk路径` 实测如下；每条相对路径同时为该文件的 `source_id`。

| 相对路径 | 页数 |
|---|---:|
| 荷载校核图形/荷载校核.pdf | 2 |
| 计算书/上部/设计结果简图.pdf | 4 |
| 计算书/基础/基础计算及设计结果.pdf | 2 |
| 计算书/施工图/板计算简图.pdf | 9 |

## 使用与实现

计算书页面左侧编辑完整目录，右侧输入本机输出路径并点击“读取 PDF”，可切换文件、翻页、输入页码、下载原 PDF。原件只读；DWG 和其他目录不读取。支持直接选择荷载校核、计算书或其上部/基础/施工图目录。刷新后保留路径和文件清单，主动重读后恢复预览。

`calculation-book-catalog.js` 为母件目录快照，本地母件服务可用时优先读取其目录。旧占位目录仅在精确匹配旧默认值时迁移；人工编辑的目录保留，恢复按钮明确采用完整母件目录。Word 输出沿用同一条目清单。

`/api/calculation-pdfs/scan` 只接受同源页面的主动请求；页图和下载仅接受扫描返回的临时文件标识。跳过符号链接及禁止归档，校验 PDF 文件头；每次预览验证文件未变更。扫描上限 200 份、10000 个目录项、8 层，单份不超过 128 MB，超限及损坏文件显示提示。Poppler 不可用时仍列出文件并提示配置，不伪报预览成功。

项目 `main.calculation.pdfSources` 只保存路径和文件元数据，不保存 PDF 内容或临时访问标识。预览图缓存位于忽略目录 `web-demo/outputs/calculation-pdf/`，不上传原件、不调用 AI，也不自动把 PDF 合并进 Word 或确认工程结论。

## 验证

在 `web-demo` 运行 `node --test design/project-integration/calculation-pdfs.test.mjs design/project-integration/blank-project.test.mjs design/project-integration/project-store.test.mjs`；构建运行 `pnpm run build`。Word 源目录与输出段落逐条一致，母件 SHA-256 不变；真实四份 PDF 均读出页数并生成首屏预览。测试项目及截图放 `web-demo/qa/calculation-pdfs/`，使用隔离存储。
