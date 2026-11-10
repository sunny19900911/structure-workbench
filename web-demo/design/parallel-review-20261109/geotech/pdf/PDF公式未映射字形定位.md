# PDF公式未映射字形定位

source_id: QA-PDF-FORMULA-GLYPHS-R124（实测事实）。

本轮先检查经开Word原生表：12行7列、37物理格、2表头行，没有发现被误吞的数据，因此未改表头规则。转查已登记的右江公式乱码：目视原PDF第32页发现分式上下排列被提成线性错序，负号为私有区字符。原图数值代入式同样写作(4.25-1/7-1)，没有额外括号；不得依据预期结果擅自补括号或改算。

新增audit-text-glyphs.mjs，仅检查未映射的Unicode私有区、替换字符和(cid:数字)残留，不使用化学/工程词典猜值。nativeReportSource将检查结果保留在paragraphMeta.textReview及pdfReadReport.textReview，附段索引、物理页码与原坐标，并在已有warnings中提示。原文不删除、不替换，不新增用户确认流程。没有警告不等于公式正确：正常编码但分式错序、上下限错位仍可能漏检。

实际右江44页既有原生报告重新组装，442段中4段触发，位于31/32页；包括求和号、等号和负号的未映射字符。上虞21页627段无触发。两原PDF哈希核对一致，未重新进行整份OCR。第32页原图已目视，其余3段只定位到字形问题，未宣称逐式还原。

14项字形检查、来源适配、字节上传及原图补充测试通过。证据位于web-demo/qa/parallel-review-20261109/geotech/goal-round124/：checks.json、tests.log、formula-source.png、youjiang-source.json、check.mjs。本轮未重跑浏览器、导出Word或正确扩初终稿评分。该成果是提取异常可定位性改善，不是公式正确率提高；完整公式恢复及正式入口接入仍待完成。
