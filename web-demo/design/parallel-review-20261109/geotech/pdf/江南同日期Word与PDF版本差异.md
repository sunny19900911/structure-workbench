# 江南Word与PDF同日期内容版本差异

source_id: QA-JIANGNAN-CROSS-FORMAT-VERSIONS-R130（实测事实）。

从用户提供的初勘RAR只读提取正式DOC成员，未读取临时Word、DWG内容，原RAR哈希不变。Word通过既有禁宏临时副本读取器取得250段、7表。Word与PDF封面均为江南大学（江阴校区）二期建设工程、K2026113、2026年4月9日，但不能认定为同一内容版本。

Word桩表为13行9列，PDF为15行11列。按相同土层和明确桩长条件映射90格，其中88格相同、2格不同：第（10）层预制桩16m<l≤30m及灌注桩15m≤l<30m，Word均为/，PDF分别为1200、300。PDF另有（12）、（13）层和两种桩的长桩区间。直接将原DOC副本用Word渲染为14页，目视物理第11页（原页码10），确认这些差异确实在原稿，不是读取器截断。

Word对设计特征周期仍写待波速成果出具后详勘提供；PDF已有0.65s、0.57s及0.45s分组建议。当前各自生成内容保留各自状态，没有合并、替换或推断文件先后。承载力表42槽位在两格式相同。

90格对应数量是版本比较，不是88/90识别准确率；该对照不进入同版本格式识别评分。来源表完整保留，归档RAR及DOC副本哈希复验通过。尚无该项目已核实扩初终稿。

私有证据：web-demo/qa/parallel-review-20261109/geotech/goal-round130/ 的archive-source.json、source.json、checks.json、source-render.json、word-source-page-11.png、audit.mjs。此次无生产代码修改、无新导出成果验收；重点是阻止把版本差异误算成识别错误。
