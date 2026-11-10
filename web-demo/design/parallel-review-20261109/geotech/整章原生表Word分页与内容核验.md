# 整章原生表 Word 分页与内容核验

source_id: QA-GEOTECH-SECTION-DOCX-20261110。本轮使用海南 Word 来源 CURRENT-geo-431793fb56d1aac69699 与同项目终稿 REFERENCE-57a7f4fad2e26a6017bb，均只读。

## 实际发现与修复

独立 `render-section-document.py` 将章节块和原生表输出为 A3 横向双栏 DOCX。第一次 Microsoft Word 渲染发现表格覆盖另一栏正文：python-docx 创建单元格时采用整页宽度，仅更新列网格不能同步原有单元格宽度。

`render-native-table.py` 现在在合并前同步每个物理单元格与表格首选宽度，合并后宽度自然累加；纵向合并标签所在行组设置尽量同页，防止土层名称拆至两页。没有改变来源表文字、数值或几何合并关系，也没有修改共享正式导出器。

## 验证

- 实际 DOCX：8 张来源表、420 个展开单元格与章节契约一致（仅忽略空白差异）；57 段正文保持顺序。
- 桩基参数来源表9与同项目终稿表5共40个展开单元格一致，包含两种桩型及桩长条件；不能外推为全部终稿内容均正确。
- 新增 A3 宽表保存后重新读取的宽度回归；连同已有表注检查共3项 Python 测试通过。
- Microsoft Word 生成4页PDF，四页全部目视检查。修正后表格不再覆盖相邻栏，压缩试验表在土层行组之间分页，续页重复表头，土层名称完整。
- documents 技能的 `render_docx.py` 因缺少 LibreOffice 未成功；采用项目已有 Word COM 渲染脚本及 PDFium 逐页 PNG 复核。没有把失败路径记为成功。

私有证据目录：`web-demo/qa/parallel-review-20261109/geotech/goal-round57/`，包括 `hainan-sections.json`、`verification.json`、`海南地勘原生表样稿-复核.docx/.pdf` 和 `render/verified-1.png` 至 `verified-4.png`。早期失败版保留供比较。

## 尚未完成

这是独立内容保真样稿，不是正式工作台成果。地质年代及公式上下标尚为平面文本；原报告的表号复用、重复结论与抗浮水位措辞矛盾仍保留，尚未形成终稿级精简。源图片存在时生成器明确拒绝，尚未实现图片编排。正式 PDF 上传与原生表导出接入仍待主流程集成。
