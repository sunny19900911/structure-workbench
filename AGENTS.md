# 结构设计 AI 工作库约定

## 2026-10-06 天津重难点示例

原文事实，source_id: USER-20261006-TIANJIN-EXAMPLE。主页面“重难点”新增“查看天津重难点示例”，嵌入 `design/key-decisions/key-decisions-integrated-prototype.html`。保留抗震、绿色与装配式、性能化三组示例；内嵌模式隐藏重复导航，确认按钮仅演示，不保存。iframe 仅允许脚本、不开放同源访问，不把天津固定案例写入当前项目。Vite 构建包含该示例页面。验证：`node --test design/project-integration/modules.test.mjs`、`npm run build`。

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

## 2026-10-01 用钢量页面精简

原文事实，source_id: USER-20261001-STEEL-SIMPLIFY。本段覆盖⑤旧版工具折叠保留的显示约定。

- ⑤删去冗余说明、统计范围、审核提示及旧版工具入口；保留导入、单体切换与当前 CSV 导出，不删除已保存数据。
- 显示：楼层钢筋总用量（t）、钢筋单方量（kg/m²）、上部混凝土单方量（m³/m²）、基础混凝土量（m³）及其单方量（m³/m²）。上部混凝土总量不展示；表格和 CSV 单位一致。
- 基础单方＝基础混凝土量÷首层面积；优先采用用户补填的面积，否则读取明确的首层资料。缺失或冲突不猜值，不能用总楼面面积替代。内部钢筋原始量仍为 kg。
- 回归：在 `web-demo` 运行 `node --test design/project-integration/steel-view.test.mjs design/project-integration/modules.test.mjs`。⑥仍只读取有效的已审核版本，本次不自动生成审核记录。

## 2026-10-02 计算书完整目录与 PDF 路径

原文事实，source_id: USER-20261002-CALCBOOK-PDF。计算书默认保留 Word 母件全部 27 个条目及分组，旧两条占位目录迁移为完整目录，人工调整保留；可主动恢复 Word 完整目录。

- 用户提供模型输出根路径后，仅读取 `荷载校核`（兼容 `荷载校核图形`）及 `计算书/上部`、`计算书/基础`、`计算书/施工图` 内的 PDF，旁侧分组列出并按页预览。示例路径为 `E:/600-工作台数据库/610-待处理/模拟yjk路径`；不执行 CAD/YJK，不读取 DWG，不修改原件。
- `calculation-book-catalog.js` 保留目录母件快照；`calculation-pdfs.js`、`server/calculation-pdf-api.mjs` 管理本地扫描和 Poppler 预览。路径和清单随当前项目 `main.calculation.pdfSources` 保存，预览授权不持久化；切换项目丢弃旧请求，恢复后主动重读。
- 测试：`node --test design/project-integration/calculation-pdfs.test.mjs`。来源和边界见 `web-demo/design/task6-calculation-book/PDF路径与完整目录.md`。原始 PDF 不自动合并进 A3 Word，也不作为参数确认或计算通过结论。

## 2026-10-01 地方规范正文目录

原文事实，source_id: USER-20261001-LOCAL-REG-DOCX。③移除重复权威抓取面板，保留地方规范查询。已选目录支持逐条删除、恢复、正文编辑和 Word 版式，使用②同一单体的 regulations 与 regulationDocument.localNote；更改名称或编号撤回旧确认，签发稿锁定。版式与来源见 web-demo/design/regulation-document/README.md；回归运行 node --test design/project-integration/regulation-document.test.mjs。

## 2026-10-02 地方规范查询操作合并

原文事实，source_id: USER-20261002-REGULATION-QUERY-ACTIONS。③选择操作统一放在查询结果的独立操作列，取消单独“已选规范”目录及工具栏；保留 Word 正文与版式。添加/移除复用同一项目、单体的 regulations，取消选用不删记录，再次添加保留人工编辑。


- 查询结果支持“一键全部添加”，跳过已选条目，复用取消选用的原记录；完成后显示“已全部添加”。source_id: USER-20261002-REGULATION-ADD-ALL（原文事实）。

## 2026-10-01 昆明重难点联动

原文事实，source_id: USER-20261001-KUNMING-DECISIONS。⑩通过 `regional-decision-guide.js` 读取①参数及当前单体已确认事实；补充条件写入原 `intake` 分区。国家与省级触发条件独立判断，缺项不猜；参数、规则版本或项目规范状态变化使旧确认待复核。来源和边界见 `web-demo/design/key-decisions/昆明联动规则与验收.md`；回归：`node --test design/project-integration/regional-decisions.test.mjs`。规则匹配不替代模型分析或专项审查。

## 2026-10-02 DeepSeek地区研判

原文事实，source_id: USER-20261002-DEEPSEEK-RESEARCH。⑩和DeepSeek助理均可主动启动地区研判；方法内嵌于 `decision-research-method.js`，服务为 `/api/decision-research`。只用可追溯的官方网页或注明限制的摘要，校验摘录；研判保持AI草稿，变更输入后不得直接采用。复用 `modules` 分区，来源进程缓存24小时，支持主动刷新。配置、来源和验收边界见 `web-demo/design/key-decisions/DeepSeek地区研判.md`；测试 `design/project-integration/decision-research.test.mjs`。禁止把QA模拟响应接入正式入口。

用户指定外部密钥目录 `E:/00-key`（source_id: USER-20261002-DEEPSEEK-KEY-PATH，原文事实）。`server/local-deepseek-config.mjs` 在服务端读取其中 `deep seek key.txt`，已有环境配置优先，可用 `DEEPSEEK_API_KEY_FILE` 改路径；不得复制密钥到仓库、浏览器或日志。回归 `design/project-integration/local-deepseek-config.test.mjs`。

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

## 2026-10-02 回到主工作区

source_id: USER-20261002-RETURN-MAIN（用户明确要求，原文事实）。本轮将 `codex/geotech-doc-read` 的资料提取、模板扩初、来源配色、单体表编辑和不规则措施库合入 `main`，保留主工作区已有计算书、地方规范、用钢量和地区研判功能。

- 后续本对话开发与页面操作以 `C:/Users/mj528/Documents/004 工作` 为主工作区，正式入口为 `http://127.0.0.1:5190/workbuddy-integrated-studio.html`，使用根目录 `启动Demo.cmd`。不再把5297试用入口作为日常工作入口。
- 当前经开项目 `4756c13dad2b43aaafe52237452c6b1c` 的 main/intake/expansion/modules/ppt 已使用 expectedRevision=0 迁入主入口项目库；保留稳定ID及主库其他项目，未迁入QA演示项目。迁移备份仅在忽略目录 `web-demo/qa/main-integration`。
- 合并冲突保留③规范选择/编辑/附注及专用Word版式；②原生表采用同一规范分类与附注。检查84项通过，新增跨模块联动回归通过，构建通过；主入口浏览器验证六类下拉、单体表编辑、地方规范正文、地区研判入口及27条计算书目录。
- 补充回归：`node --test design/project-integration/main-expansion-merge.test.mjs`。

## 2026-10-02 主框架精简

依据用户要求（source_id: USER-20261002-SIMPLIFY-SHELL，原文事实）：默认进入统一措施，取消首页卡片墙及全院总览入口；导航依次为统一措施、整理地方规范、扩充说明、汇报的 PPT、用钢量、计算书、重难点、反校核。内部模块 ID 保持不变。当前只显示设计人员和阶段选择，八个入口不随阶段隐藏；地方规范允许设计人员编辑，保留已签发锁定。移除措施中的项目类型与专项特征卡片，已有参数仍保留。已签发内容可从模块顶部撤回，不再依赖卡片墙。

## 2026-10-03 楼面活荷载清单

source_id: USER-LIVE-LOADS-20261003（用户要求，原文事实）。`floor-live-loads.js` 按用户提供清单生成17行楼面活荷载，只保留序号、类别、标准值；支持直接编辑、删除及一键重排序号。沿用 `main.paper` 和扩初表格联动，迁移标记防止删除后重新补回；人工取值及已签发稿保留。来源差异及回归见 `web-demo/design/template-restoration/楼面活荷载清单.md`。

## 2026-10-03 独立 DeepSeek 段落改写模块

source_id: USER-20261003-DEEPSEEK-REWRITE（用户要求，原文事实）。`web-demo/deepseek-rewrite/` 独立维护对话面板、思考模式调用、联网检索和扩初适配层；扩初通过选段／光标段落接入，不合并进既有全局助理。采用才回填，复用原分区保存和上一稿撤回；项目、单体、来源版本或原文改变时拒绝旧结果。联网失败明确提示，不声称已核查；配置仅在服务端复用。拆卸接口、边界与验证命令见该目录 README.md。

source_id: USER-20261003-REWRITE-FREE（用户要求，原文事实）。`writing.js` 仅保留简短提示，让 DeepSeek 按要求自由改写，不限压缩比例、改动幅度或数字次数；多轮追问以侧栏当前稿为对象，初始原文仅用于联动引用保护。结果由用户采用，不写回统一措施参数。联网检索到资料不等于本稿采用，侧栏据实际来源采用状态显示；不增加额外确认或写作按钮。

## 2026-10-03 PPT 页面与扩展信息

原文事实，source_id: USER-20261003-PPT-SIMPLIFY。汇报页直接展示“工作台 PPT 模板”，移除重复编辑器入口、复核重难点和核对扩初模型链接。DeepSeek“扩展信息”按已有事实扩写，前后端共用 `report-core.js` 的写作约束；保留数值、单位及未确认状态，最长600字。新版原生表格没有参数标记时，仍传入当前单体的统一措施参数。回归：在 `web-demo` 运行 `node --test design/parallel-tasks/06-ppt-report/report-core.test.mjs design/parallel-tasks/06-ppt-report/cafeteria.test.mjs design/project-integration/modules.test.mjs`。

## 2026-10-02 资料生成闭环试用版

source_id: USER-20261002-WORKFLOW（用户本轮要求，原文事实）。本轮在当前工作树验证第1～3项：顶部项目管理菜单、统一资料窗口、按章更新与人工稿比较、保存去重和导出快照；保留八模块、原ID、expectedRevision及签发锁定。入口新增`workflow-ui.js`，纯逻辑`workflow-core.js`。不得恢复全局点击自动保存或隐藏确认门槛。第4项AI任务统一上下文、Token任务记录尚未扩展；聊天已加项目切换隔离。操作说明、旧入口依赖清单、测试及恢复边界见`web-demo/design/workflow-simplification/操作说明与验收.md`。5302试用端口采用`web-demo/qa/workflow/store`，不写正式603。

## 2026-10-03 闭环与性能改动合入主工作区

source_id: USER-20261003-MAIN-WORKFLOW（用户要求，原文事实）。流程简化和卡顿修复已同步主工作区5190入口，保留楼面荷载、独立段落改写、抗震等级和PPT增量。主入口沿用正式603库，不迁入5302试用数据。性能回归：`node --test design/project-integration/navigation-performance.test.mjs`。

## 2026-10-03 单体抗震等级自动查表

source_id: USER-SEISMIC-GRADE-20261003（小香金猪要求，原文事实）。①新增单体高度/结构形式查表，联动公共烈度、类别、场地；②表3.3.4按单体读取结果。输入存原 intake.seismicGrades，变更留历史，仍用 expectedRevision。旧隔震层与特殊构件等级预设入口及生成正文行移除，历史数据及签发稿保留。

- 规则在 `web-demo/seismic-grade-core.js`，界面在 `seismic-grade-workbench.js`；依据本地抗规2016完整正文配合2024局部修订、JGJ3表3.9.3。来源、页码、规则和边界见 `web-demo/design/seismic-grade/抗震等级查表逻辑.md`。
- 普通现浇混凝土体系支持查表；甲/丁类、B级、减隔震及超适用范围留专项处理。住宅和其他民用建筑分别判断高规范围，不以所有建筑>24m一概套高规；不把消防/规划高度当作房屋高度。
- 回归：`node --test design/seismic-grade/seismic-grade.test.mjs design/project-integration/intake.test.mjs design/reference-expansion/reference.test.mjs`。浏览器隔离库为 `web-demo/qa/seismic-grade/store`，正式入口仍5190。

## 2026-10-04 Linux宝塔个人试用包

source_id: USER-20261004-BAOTA-LINUX（用户要求，原文事实）。`web-demo/deploy/baota/` 提供独立Node服务、账号保护、安装说明和按依赖白名单打包脚本，静态服务仅开放dist。运行 `npm run build` 后执行 `python deploy/baota/package.py`，包生成于忽略目录 `web-demo/outputs/baota`，不包含密钥、正式项目库、node_modules或QA数据，不自动部署。Linux文档转换使用LibreOffice及Python，保留Windows Word路径；Linux字体和分页须上机核对。回归 `node --test deploy/baota/http-app.test.mjs design/project-integration/legacy-doc.test.mjs design/project-integration/project-store.test.mjs design/reference-expansion/reference.test.mjs`。当前包为个人试用，无多人项目权限隔离，本机E盘、ima桥接与外部方法库未迁移。

## 2026-10-06 新建冲突修复与删除项目

source_id: USER-20261006-PROJECT-MANAGEMENT（用户要求，原文事实）。项目管理新增“删除当前项目”和“恢复刚删除项目”。新建时旧项目409冲突不再阻断：保存其他分区、下载含浏览器恢复稿的备份，再建立独立项目；非冲突错误仍中止。删除先备份，以 lifecycle 分区标记隐藏，不移除原件或历史；服务端拒绝已删除项目的旧窗口写入，恢复保留分区和修订。回归：`node --test design/project-integration/new-project.test.mjs design/project-integration/project-store.test.mjs`。浏览器验证使用5192及`web-demo/qa/new-project-fix/store`隔离库，不删除正式项目。

## 2026-10-06 改写等待状态与超时

source_id: USER-20261006-REWRITE-HANG（用户反馈，原文事实）。段落改写返回 NDJSON 阶段进度，页面显示检索、思考改写及等待秒数。联网阶段限制30秒，失败如实提示后按已有项目资料改写；模型请求连同响应正文限制120秒，前端160秒停止并恢复操作。保留主动请求、预览采用及原文不自动覆盖。回归：`node --test deepseek-rewrite/rewrite.test.mjs`。

### 2026-10-06 删除后启动恢复

source_id: USER-20261006-STARTUP-HANG（用户反馈，原文事实）。`project-startup.js` 在记住的项目已删除或不存在时改为载入保留项目，无保留项目才新建；网络错误不自动新建。专项模块在主项目尚未就绪时不自行发起空编号加载。回归追加 `design/project-integration/project-startup.test.mjs`；主页面实测恢复“云南项目测试1”，正文解除 inert 锁定。

## 2026-10-06 段落改写联网补查

原文事实，source_id: USER-20261006-REWRITE-SEARCH。用户要求优先联网成功、允许延长等待。独立段落改写每轮搜索120秒、官方网页各20秒，无可用内容时换来源补查一次；搜索总预算290秒、前端420秒，停止仍有效。不把模型自述当作检索证据，不改项目参数。实现与回归见 `web-demo/deepseek-rewrite/README.md`。

## 2026-10-06 段落对话体验

原文事实，source_id: USER-20261006-DEEPSEEK-CHAT。用户希望接近普通DeepSeek对话。面板打开不自动发送，先输入要求；新客户端纯文本流式显示回复、深度思考可选且按用户习惯默认开启，保留联网补查及采用后回填。服务端仍保留旧JSON调用兼容；未完成回复不作为最终稿。测试为 `deepseek-rewrite/rewrite.test.mjs` 与 `deepseek-rewrite/stream.test.mjs`，QA页面不保存正式项目。

## 2026-10-14 宝塔 /work/ 更新包

原文事实，source_id: USER-20261014-BAOTA-UPDATE。用户要求移除工作台返回主站的入口，并打包最新功能供手动上传，不自动部署。实际部署依据对话“短视频课程｜结构化 Word 学习笔记”（`01a0aa34-d73c-7032-a6f1-8ca1c9cfcb31`）2026-10-05记录：程序在 `/www/wwwroot/structure-workbench`，由 `structure-workbench.service` 运行，端口5190；现有 Nginx 转发时去掉 `/work/` 前缀，保留该配置。旧整合包注入的 `portal-return` 返回按钮随新 dist 替换而移除。

- 在 `web-demo` 构建后执行 `python deploy/baota/package.py --base-path /work/ --proxy-strips-prefix --name structure-workbench-work-update-20261014.zip`；交付在忽略的 `outputs/baota`。只重写交付副本中的 API 地址，不修改本地5190入口。
- 包内 `UPDATE.py` 默认预览；显式 `--apply` 才校验清单、备份并更新程序，保留 `.env`、依赖及项目数据。上传到独立临时目录解压，更新与重启步骤见 `web-demo/deploy/baota/更新说明.md`。不要覆盖主站、健康页和日记页。
- 服务端启动复用 `localDeepSeekConfig`，支持既有环境或外部密钥文件配置；不得把密钥打入包或日志。补齐计算书封面模板依赖。
- 验证：`node --test deploy/baota/http-app.test.mjs deepseek-rewrite/rewrite.test.mjs deepseek-rewrite/stream.test.mjs design/project-integration/local-deepseek-config.test.mjs`、`python deploy/baota/update.test.py`、`npm run build`；解压包隔离验收使用 `qa/baota-release-20261014`。未在真实服务器验证 Linux Office 版式或真实 DeepSeek 调用。

## 2026-10-14 部署交互修复

原文事实，source_id: USER-20261014-DEPLOYMENT-FIXES。用户要求修复线上抗震等级卡顿、DeepSeek 改写入口无反应、扩初表格不可编辑及联动缺漏，并交付宝塔更新包，不自动部署。

- 抗震等级只读取单体小份条件，本地即时查表，900ms 合并保存；不锁住输入等待网络，不在每次输入时复制或重绘建筑地勘原文。项目切换仍等待分区保存并保存最新主参数版本。
- 顶部助理不拦截正文点击；改写保留选段，无选段时打开本章首段正文。侧栏互斥，等待期间发送心跳，鉴权失败和代理超时明确显示。真实密钥只沿用服务器配置，不读取、复制或打包用户密钥。
- 原生扩初表格单元格人工值存于原扩初分区 `tableEdits`，使用原行身份，未改格继续联动；规范正文仍编辑共用规范记录。蓝色加粗表示统一措施联动，人工编辑后取消蓝色；Word 保留模板几何及人工内容。桩基结构安全等级依用户本轮指定与 `pile` 同源，未新增规范判断规则。
- 验收、命令及边界见 `web-demo/design/deployment-fixes/20261014.md`。交付包 `web-demo/outputs/baota/structure-workbench-work-fix-20261014.zip`；上传后用 Python 解压，避免中文文件名校验问题。`workbench-version.json` 用于核对更新版本。

## 2026-10-15 选段改写与项目操作内测

原文事实，source_id: USER-20261015-INTERACTION-RETEST。用户要求改写直接发送选中文字和要求，修复高度回车联动，并内测新建、删除和示例副本操作。

- 段落改写默认关闭联网检索，保留可选补查和默认深度思考；选区预览、流式响应、采用回填保持原流程。真实 API 凭据仅沿用服务器配置。
- 抗震高度 input/change/focusout/Enter 均刷新本地结果；相同值回车仍重算显示，焦点在面板内时更新结果，不依赖重选结构形式。查表规则不变。
- 新项目分区使用 `fresh` 跳过空读；空 intake/modules 建立初始比较值，未编辑时不在离开页面时写入空分区。普通载入和修订冲突保护不变。保存可请求 `?ack=1` 仅返回修订确认；专项只查询 `?prefix=expansion-`，备份仍读取全部分区。
- 项目操作立即显示进度和耗时，期间锁住编辑，启动资料模块就绪前不开放管理按钮；新建不反复扫描项目列表，删除先备份且可恢复。测试仅用 `qa/interaction-fixes-20261015` 隔离库，不操作正式项目。
- 验收记录与部署步骤见 `web-demo/design/deployment-fixes/20261015.md`、`web-demo/deploy/baota/更新说明.md`。本轮不自动部署、提交或推送。

## 2026-10-15 项目管理大资料提速

原文事实，source_id: USER-20261015-PROJECT-SPEED。用户反馈删除下载备份、打开旧项目变慢。本段覆盖此前“删除先自动下载备份”的约定。

- 删除先保存修改，再写 lifecycle 标记；不自动下载全量归档。原分区与历史不删除，保留恢复按钮及主动下载备份。保存断线或409冲突中止删除，不跳过失败而丢失当前稿。
- 切换已在下拉框中的项目不重复扫描清单。专项启动不下载所有扩初正文图片；已有判断通过 `?prefix=expansion-&view=context` 读取 identity/parameters/model/regulations，PPT 打开时才读完整文稿。不能遗漏跨单体判断所用参数和规范。
- 导入来源正文保持不可变；替换/重新归类生成新来源。`createDocumentComposer` 按来源引用、分类、hash、fragments/blocks 复用派生文档，项目切换或资料变化重新编排。折叠原文在展开时渲染。
- 回归见 `design/project-integration/management-performance.test.mjs`；浏览器大资料对照仅用 `web-demo/qa/management-speed-20261015` 隔离库。记录在 `web-demo/design/deployment-fixes/20261015-performance.md`；交付 `structure-workbench-work-performance-20261015.zip`，不自动部署。

## 2026-10-15 段落改写等待调整

source_id: USER-20261015-REWRITE-SPEED（用户要求；原文事实）。分条改写约250秒，希望减少等待。本段覆盖此前默认开启深度思考的约定。

- 新选段每次默认关闭联网、深度思考，主动勾选仍可使用。普通润色/分条精简无关上下文，明确要求结合资料、分析或补充时仍附原有资料；模型配置沿用。
- 模型完整结束标记及前端最终结果均立即结束接收，不等待远端断开。失败和停止有独立未完成回复，采用才回填，保留原有项目/单体/版本检查。
- 112项相关回归及5项更新器测试通过，隔离浏览器验证默认开关重置、失败恢复、流式预览及采用。真实官方API发生503和无正文超时，尚未通过真实速度验收，不能承诺已降到某一秒数。详见 `web-demo/design/deployment-fixes/20261015-rewrite-speed.md`。
- 交付 `structure-workbench-work-rewrite-20261015.zip`；安装使用用户已确认存在的 `/www/workbench-fix-20261015`，不自动部署或提交。

## 2026-10-15 计算书 PDF 上传及合并

source_id: USER-20261015-CALCULATION-PDF（用户要求，原文事实）。计算书新增本机文件夹选择，只上传荷载校核、上部、基础、施工图PDF至 `WORKBENCH_DATABASE_ROOT/calculation-uploads/<projectId>/<batch>`，main仍存路径清单。按分组与文件名自然排序合并原页，保留原始尺寸；Linux用pdfunite，Windows用文档Python的pypdf。单份64MB、200份/512MB总量限制，授权过期重新扫描，文件变化先更新清单，不能串项目下载。此目录须随projects备份。

- A3 Word不再依赖未迁移的外部母件目录，采用包内封面与当前目录；外部Excel仍须配置。保留人工确认，按钮显示错误而非静默禁用。生成副本清除历史签章及封面图片，母件不变。
- 详见 `web-demo/design/deployment-fixes/20261015-calculation.md`；回归为 `calculation-pdfs.test.mjs`、`calculation-deployment.test.mjs`、文档Python运行 `calculation-builder.test.py`。隔离服务5198，不写正式603。
- 打包指定 `--guide 计算书更新说明.md`，交付 `structure-workbench-work-calculation-20261015.zip`，不自动部署或提交。服务器实际Linux合并需更新后验收。
