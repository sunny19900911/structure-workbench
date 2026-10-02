# 结构设计 AI 工作库约定

## 项目是什么

使用者昵称：**小香金猪**。

面向结构工程师的 AI 工作台：把建筑、地勘和规范资料整理成经人工确认的项目参数，复用于技术措施、扩初说明、PPT、计算书、施工图总说明，以及用钢量统计和项目管理。

**主对话：[结构设计提效｜参数数据库与文档自动生成](codex://threads/01a097f8-9266-7502-8f41-2134e5ebc8cf)**。负责整体方向、参数数据库、统一技术措施、扩初说明和各模块集成；分对话负责下表专项。

## 分对话分工

以下是职责索引，不代表全部功能已经完成或接入正式页面。任务编号有重复，以完整对话名称为准。

| 工作台专项对话 | 负责内容 |
|---|---|
| [任务二｜地震参数与地方规范可信查询](codex://threads/01a0d6f4-ddf7-77e1-b798-476d8f93a2b6) | 地点识别、抗震参数与地方规范检索、来源及有效性核查、人工确认。 |
| [任务三｜重难点判断模块](codex://threads/01a0d88a-e52c-7950-ad33-d3903a77634b) | 项目重难点识别与判断，接入现有工作台。 |
| [任务四｜用钢量统计与项目管理总览](codex://threads/01a0d6f5-04ef-7891-9116-16932bfbbe27) | 单体材料用量导入、统一口径汇总、项目比较和管理总览。 |
| [任务五｜604结构总说明完善与工作台接入](codex://threads/01a0d739-d92b-76b0-813a-a1b3a26e71b8) | 公共母版、参数联动、条款删减、人工审签及 Word 输出。 |
| [扩初汇报 PPT｜模板分析与自动生成](codex://threads/01a0dc04-c13f-7da1-a3ab-4d2aae844780) | 汇报模板、图片与内容编排，单向读取统一技术措施参数。 |
| [结构计算书｜内容编排与自动生成](codex://threads/01a0dcf1-bc9c-7c63-9a8b-27e7e11c06c9) | 封面、分级目录、Excel 计算内容联动及计算书输出。 |
| [结构资料清洗｜建筑说明与地勘参数确认](codex://threads/01a0aefc-9493-7801-9c38-e18a6d7978f4) | 提取候选参数、保留来源、识别冲突，提供人工确认数据。 |

已归档参考：[任务一｜工作台产品主线与假期迭代规划](codex://threads/01a0d6f4-c641-71a1-ba31-b169ea8ee7f6)；[任务三｜设计成果联动与总说明编制](codex://threads/01a0d6f4-f399-75f1-8879-9ad5ab2aabed)。后者是旧任务，不是当前“重难点判断模块”。

## 从哪里开始

- **打开工作台**：运行根目录 `启动Demo.cmd`；正式入口为 `web-demo/workbuddy-integrated-studio.html`。
- **接手开发**：先读 [工作台骨架与增量开发边界](web-demo/design/工作台骨架与增量开发边界.md)，复用现有项目、角色、阶段和统一参数；各专项原型的集成情况须单独核实。
- **查找成果**：工作台专项主要在 `web-demo/design/parallel-tasks/`，计算书在 `web-demo/design/task6-calculation-book/`，资料清洗在 `design/task2/`。
- **数据库**：`E:\600-工作台数据库`，由主对话统筹。

本索引核对于 2026-09-27；陈述类型为“原文事实（任务职责与文件说明）”。各对话链接中的 ID 即该项 `source_id`；入口与开发边界的 `source_id` 为 `启动Demo.cmd`、`web-demo/design/工作台骨架与增量开发边界.md`；昵称来自本次用户明确指定（`source_id: USER-20260927-NICKNAME`）。

## 范围

- `01_标准扩初项目样本`、`02_统一技术措施样本`、`03_盈建科参数导出样本`、`04_地勘资料`、`05_建筑专业输入资料` 为原始资料区。
- 原始输入文件永远只读。除本次一次性规范命名外，不修改、不覆盖、不移动其内容。
- `03_盈建科参数导出样本` 仅保留归档，不参与扫描、索引、引用或生成。
- 派生内容只写入 `web-demo`、`design` 或后续明确建立的 `raw/wiki/outputs/meta/dashboards` 目录。

## 知识结论

- 每一条可复用结论必须带 `source_id`；无法定位来源时标为“待核实”，不得写成已确认事实。
- 明确区分四种陈述：`原文事实`、`作者观点`、`我的观点`、`AI推断`。
- 多来源冲突时保留全部取值，建立问题项；未经负责人确认不得静默选择或覆盖。
- 外部项目的统一措施属于参考模板，不是当前项目的事实来源。

## 输出与校核

- 网页版说明和汇报均属于工作草案，定稿前必须由结构负责人复核。
- 历史报告中的计算参数和结果可作为复算对照，但必须明确标注为“历史评审结果”。
- 新增资料时同步更新来源登记和问题清单。

## 2026-09-30 项目集成增量

本段依据用户本轮指令（source_id: USER-INTEGRATION-20260930，原文事实）。当前入口暂停⑦施工总说明与⑧台账，保留源码及原始资料。任务路线和Token成本算法需后续讨论，不在本轮扩展。

- 先读 `web-demo/design/project-integration/成果集合与本轮边界.md`。稳定项目ID由 `project-workspace.js` 管理，`project-legacy-adapter.js` 适配原页面。
- 总集成必须从该文件“专项成果反向核对补充”逐项核对，区分有入口、参数已联动和完整接入。2026-10-01 已接入⑩重难点决定、⑪嵌入式PPT、⑤单体材料与⑥审核总览、③权威联网查询及①旧清洗包迁移；实际边界见验收记录。原型中的固定工程结论不是自动判断规则，不能随接入变成当前事实。
- 新项目为空白；示例必须显式载入副本。参数变更通过 `workbuddy:measures-changed` 发布 `project_id` 和 `parameter_version`，人工稿保留并重新复核。
- 统一保存接口 `/api/workbench-projects`，默认目录为 `E:/600-工作台数据库/603-进行项目/workbench-projects`。主页面及计算书存 `main`，扩初按单体分区，PPT及各代表单体的文稿/图片存 `ppt`；重难点、材料与联网查询存 `modules`。`project-store-client.js` 管理恢复缓存与修订冲突；禁止绕过 expectedRevision 静默覆盖。旧版扩初可按同名项目、编号及单体显式迁入。
- 测试存储设置 `WORKBENCH_PROJECT_STORE` 指向 `web-demo/qa/project-integration/store`，不要把测试项目写入正式603。
- 在 `web-demo` 运行：`node --test design/project-integration/project-store.test.mjs design/expansion-v2/expansion.test.mjs design/parallel-tasks/06-ppt-report/report-core.test.mjs`；构建检查 `npm run build`。正式使用仍由根目录 `启动Demo.cmd` 启动，本轮不作部署。

## 2026-09-30 建筑与地勘驱动流程

依据用户确认的资料接入方向（source_id: USER-INTAKE-20260930，原文事实）：建筑和地勘归①统一措施，模型总信息归②扩初。

- `intake-workbench.js` / `intake-core.js` 管理当前资料、候选事实、采用记录、单体及体系比选建议；使用同一项目ID的 `intake` 分区。不得另建基于项目名称的存储。
- ②按当前单体只读继承①已确认事实，修改须回①；签发稿保留快照，撤回后更新。公共参数人工更改后，旧采用事实不再作为当前确认依据。
- `/api/intake` 接入本地602方法及案例矩阵、108经验整理；历史来源仅作比选参考，不能进入当前事实。601原件尚未完成有效性登记，内置地点表只输出待核候选。
- 默认本地提取；AI识别和方案比选需用户在页面主动启用。提取须校验原文片段、引用和值；方案须有实际来源，禁止自动写入历史数值或计算通过结论。
- 回归追加 `node --test design/project-integration/intake.test.mjs design/project-integration/blank-project.test.mjs`。Vite忽略 `qa` 文件变动，避免隔离测试库保存引起页面重载。

## 2026-10-01 专项补漏集成

source_id: USER-MODULE-INTEGRATION-20261001（用户“把漏的模块也集成上”，原文事实）。

- `integrated-modules.js` 在 `expansion-workbench.js` 初始化后加载；复用角色、卡片状态、稳定项目ID与 `projectPart`，不直接加载专项原型的固定项目数据。
- ⑩已确认且输入签名仍匹配的决定，单向同步为②来源事实及⑪汇报内容；上游变更后待复核。①正文附采用记录。决定不能直接改写工程参数。
- ⑤复用旧解析器，按单体存材料、来源、统计范围及审核签名；⑥只展示仍有效审核版本的指标。旧版统计与快照工具以折叠入口保留。当前尚无单位统一跨项目分组比较规则。
- ⑪复用现有PPT编辑器，通过同源iframe读取公共/单体参数、已确认模型和重难点；手工文稿、图片按单体隔离。保存全部、切换项目等待PPT保存；导出时阻止切换。
- `/api/regulation-discovery` 复用专项的7省市查询器；结果只作为规范候选，不自动确认版本、适用范围或写入601。
- 清洗包由用户选文件并核对项目后导入，旧确认降为候选；无法无歧义映射的复合字段保留在迁移记录，不静默换算或套用。
- 新增回归：`node --test design/project-integration/modules.test.mjs`。浏览器验收使用5191和隔离测试库；正式入口仍为根目录启动脚本。本轮未修改Token算法或大任务路线。

## 2026-10-01 试用阶段权限简化

- 原文事实（用户要求，source_id: USER-20261001-SIMPLE-PERMISSIONS）：当前版本不对资料操作按钮细分角色权限。①统一技术措施允许设计人员导入建筑/地勘、编辑候选并确认参数，与专业负责人复用同一套操作入口；保留已签发锁定。后续正式协作权限另行讨论。

- 2026-10-01 原文事实（source_id: QA-20261001-LONG-DOC）：①建筑/地勘支持旧版DOC，通过 server/legacy-doc.mjs 调用本机Antiword（Windows默认Git附带路径，可用 WORKBENCH_ANTIWORD 指定）。只解析副本，不执行宏，不改原件。本地全文导入与单次AI识别长度限制独立；长文档先保留全文及本地候选，不自动扩大AI调用。

## 2026-10-01 默认措施与 Word 版式恢复

source_id: USER-20261001-RESTORE-TEMPLATE（小香金猪本轮明确要求，原文事实）。本段覆盖此前“空白正文”及“资料导入放①”的约定。

- 建筑、地勘和模型资料入口统一放②扩初说明；人工采用的参数计入①统一措施，仍使用原项目 ID 和保存接口。
- 通用措施以用户指定的 `E:/11-工作/001-workbuddy spaceV1/001-workbuddy space/101-统一措施/结构计算统一措施_V1.2_20250912改.docx` 为默认母版，恢复荷载表及材料条款。当前工程地点、等级、模型结果不能借用历史项目；地区专用条款保留适用条件。
- `measure-template.js`、`approved-template.js` 为来源派生默认内容；`default-expansion.js` 生成初稿。候选资料可显示带“待核”标识的概况；签发仍须确认。人工正文不自动覆盖；旧空白措施只补尚未编辑的空章节，保留恢复前正文。
- 正文仅保留左侧目录。`word-document-view.js` 调用本机 Word 生成 A3 横向双栏 DOCX/PDF，网页展示该 PDF 渲染页面，预览与导出共用内容及版式。依赖本机 Microsoft Word 与 Poppler；输出缓存位于 `web-demo/outputs/word-preview`，原始资料不修改。
- 回归追加：`node --test design/template-restoration/restoration.test.mjs`。本轮改前备份及来源登记见 `web-demo/design/template-restoration/`。

## 2026-10-02 按用户 Word 模板编排扩初

source_id: USER-REFERENCE-20261002（小香金猪指定汇总版扩初模板，原文事实）。

- `reference-report.js` 统一章节、联动表格与图位；`design/reference-expansion/` 保存原模板派生样式和表格几何。历史工程数值不带入当前项目，资料缺项留空；不增加候选确认、填写理由流程。
- `/api/intake/read-word` 只读提取 DOC/DOCX 正文、表格和内嵌图片；`geotech-document.js` 按章节边界组织 4.1～4.6。当前建筑/地勘原文及图片仍存同项目 `intake` 分区。
- 集中上传图片存当前扩初分区 `reportImages`，国家规范编辑存 `referenceNorms`；地方规范联动③，耐久性、材料、荷载和计算参数联动①。无当前依据的抗震等级、计算指标不补猜测值。
- 网页 Word 版式和导出共同使用 `server/reference-docx.py`，直接复用原表列宽、合并、边框和段落属性；Microsoft Word 渲染、Poppler 显示。Python 可用 `WORKBENCH_PYTHON` 指定，默认采用本机 Codex 文档运行环境。
- 回归：`node --test design/reference-expansion/reference.test.mjs`；原生格式验收：`python design/reference-expansion/verify-native.py <spec.json> <output.docx>`。参考文件和实际项目的验收副本仅在忽略的 `web-demo/qa/reference-expansion/`，不提交原始项目资料。

### 同日页面精简与多层规则性表

source_id: USER-SIMPLIFY-REGULARITY-20261002（用户本轮要求，原文事实）。②默认显示连续网页正文，Word 版式仅用于导出；移除额外识别、粘贴、候选说明、清洗导入、单体确认与规范确认卡片，保留图片上传及正文编辑。不要重新添加这些确认流程。

- 多层规则性表取自用户无锡组团三说明的表9.1-1，来源登记于 `design/reference-expansion/regularity-source.json`；只留一个单体，原项目判定清空，支持文字编辑和逐行删减。高层规则性表本轮明确不做。
- `regularity` 存当前扩初分区，导出不含删除按钮。重新提取模板时先运行 `distill.py`，再运行 `distill-regularity.py`。
- 抗倾覆比使用 OUT 解析器的 `over_wind_x/y`、`over_eq_x/y`；振型取 `periods`，剪重比取 `shear_x_r/y_r`。构件强度按统一措施的构件名称和地上/地下位置匹配，不能把地下强度套入地上。

## 2026-10-01 旧版地勘 DOC 兼容读取

- 原文事实（source_id: QA-JK-DOC-20261001）：存在扇区长度未对齐的可读 DOC，Antiword 拒绝原件，补齐后仍可能遗漏正文。`server/legacy-doc.mjs` 对此类 Windows 文件调用 `legacy-doc-word.ps1`，仅以临时副本在禁宏、关闭自动链接更新的 Word 中转换并读取；不得截断原件或把补齐后的 Antiword 结果视为完整提取。缺少 Word 时提示另存 DOCX，不返回可能不完整的结果。
- 在 `web-demo` 运行 `node --test design/project-integration/legacy-doc.test.mjs design/project-integration/intake.test.mjs`。本次原始资料、来源登记与人工提取只保存在忽略的 `web-demo/outputs/jingkai-intake/`，不随代码上传。

## 2026-10-01 资料直接编入扩初正文

原文事实（source_id: USER-20261001-DIRECT-DOCUMENT，小香金猪要求）：建筑、地勘上传后直接整理进扩初说明，不再展示实体候选表或要求逐项确认、填写冲突理由。

- `document-intake.js` 从当前项目原文与表格组织概况、单体面积/层数/分口径高度/功能、地质及基础建议；保留来源片段与版本说明，不把勘察建议写成已完成的设计验算。
- 自动稿随资料更新，人工正文及签发快照保留。来源状态留在数据中，工作流标记不进入 Word 正文；不同部位抗浮水位分别表述。
- 回归：`node --test design/project-integration/document-intake.test.mjs`。实测项目和改前备份留在忽略的 `web-demo/qa/direct-document/`，不提交原始项目资料。

## 2026-10-02 来源颜色与单体表编辑

依据用户要求（source_id: USER-20261002-SOURCE-COLORS，原文事实）：网页建筑资料墨绿色、地勘淡黄色、模型粉色。`report-provenance.js` 仅控制网页来源标色；人工改写段落、人工表格值取消来源色，Word不带这些底色。表1人工覆盖和删除列表保存于原扩初分区的 `unitTable`，不修改建筑原件；未编辑单元格继续采用上游数据。分类与荷载表去除末列规范辅助信息，规范依据清单保留。

派生模板重建顺序为 `distill.py`、`distill-regularity.py`、`distill-simple-tables.py`；最后一步生成21–24号双列表格，网页及Word共用。回归追加：`node --test design/reference-expansion/provenance.test.mjs`。

## 2026-10-02 六类不规则应对措施库

source_id: USER-20261002-IRREGULARITY-LIBRARY（用户要求，原文事实）。`irregularity-library-data.js`保存指定历史目录的分类摘录；`irregularity-library.js`管理六类选择、历史版本和人工措施。规则表删除列改为是/否，10.2只展开选是的措施；否隐藏但不丢失人工稿。初始未选择留空，不自动判断。不规则选择及各版本文字保存在原项目/单体扩初分区的`regularity.items`，Word复用同一结果。第六类楼层承载力突变暂缺历史措施，不编造填充。来源、适用边界、重建和测试命令见 `web-demo/design/irregularity-library/接入与验收.md`。
