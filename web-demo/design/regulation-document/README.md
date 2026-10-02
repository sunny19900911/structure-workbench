# 地方规范正文目录

原文事实，source_id：`USER-20261001-LOCAL-REG-DOCX`。用户要求删去重复的权威抓取板块，并按指定 Word 的第 2.2 节制作可删减、可编辑的地方规范目录。

版式来源：`E:/11-工作/001-workbuddy spaceV1/001-workbuddy space/301-例子/05-云南旅游学院/输出/！结构初步设计说明-汇总版本.docx`，第 2.2 节及表 2.2。原件只读；不自动采用其中历史项目的规范清单。

- 原文事实：标题黑体 12 磅；表题宋体 10.5 磅、加粗居中；表格两列为 6046 / 3850 twips，表内宋体 10.5 磅。常规行首行缩进 420 twips、1.25 倍行距；外框 0.5 磅，内框 0.75 磅。附注正文 12 磅、1.5 倍行距。原稿少数图集条目有单独段落格式，新条目复用常规行版式。
- 实现：`regulation-document.js` 共用正文与排版规则，`expansion-workbench.js` 编辑同一单体的 `regulations`，新增 `regulationDocument.localNote` 保存人工附注。删除为取消选用，保留来源；在查询结果中再次添加可恢复原记录。
- 正文名称、编号可直接编辑；改动撤回原确认，国标与地标分表。②第 2.2 节、③正文和 Word 导出共用数据；签发后只读。查询本身不自动选用。
- `word-layout.ps1` 使用 UTF-8 BOM，避免 Windows PowerShell 5.1 将中文表头与字体名误读；本机 Word 应用表格尺寸后生成预览和导出。
- 验证：`node --test design/project-integration/regulation-document.test.mjs`；浏览器与本机 Word 验收使用 5194 和 `qa/regulation-document/store`，不写正式项目库。

原始 Word 只读；测试使用隔离项目库。

2026-10-02 用户修正（原文事实，source_id: USER-20261002-REGULATION-QUERY-ACTIONS）：查询结果新增独立操作列，使用“添加到规范／已添加 · 移除”。取消单独已选规范目录及工具栏，保留 Word 预览和正文编辑。保留目录有效状态，重复添加复用原记录及人工编辑。21 项相关测试与构建通过；浏览器验证添加、移除与正文同步。

一键全部添加（source_id: USER-20261002-REGULATION-ADD-ALL，原文事实）：按当前查询结果批量添加，自动跳过已选项；沿用逐条添加的状态和审核规则，不覆盖人工编辑。浏览器验收：云南 17 条结果全部进入正文。
