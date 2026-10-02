# 来源登记

| source_id | 文件 | 用途与边界 |
|---|---|---|
| `SRC-01-2FOOD-REVIEW` | `01_标准扩初项目样本/01-2#食堂设计说明-抗震评审分册-260228-复审.docx` | 2号学生食堂专项结构与计算参数；原始文件存在单体名称误标 |
| `SRC-01-OVERALL-REVIEW` | `01_标准扩初项目样本/旅游学校抗震评审报告-总体部分-2026-02-12.docx` | 项目总体及单体汇总信息 |
| `SRC-01-STRUCT-DESIGN` | `01_标准扩初项目样本/！结构初步设计说明-汇总版本.docx` | 结构扩初说明、材料与抗渗信息 |
| `SRC-01-PPT-SEISMIC` | `01_标准扩初项目样本/！！！云南旅游职业学院龙泉路校区提升改造项目（一期）抗震设防专项审查报告-2#学生食堂.pptx` | 专项汇报版式与历史计算结果；派生输出统一名称和高度 |
| `SRC-01-PPT-OVERVIEW` | `01_标准扩初项目样本`中的76页多单体初步设计内部评审汇报 | 项目总体汇报版式参考；原文件保持只读 |
| `SRC-02-YUNNAN-LOADS` | `02_统一技术措施样本/云南旅游学院结构荷载取值-初步设计20251113.docx` | 当前项目地震、风、雪等参数 |
| `SRC-02-UNIFIED-MEASURES` | `02_统一技术措施样本/人大-结构计算统一措施_V1.2_20250912改.docx` | 外部项目参考模板，不作为当前项目直接事实 |
| `SRC-04-GEO` | `04_地勘资料/云南旅游职业学院龙泉路校区提升改造项目（一期）_岩土工程详细勘察报告_文字部分.docx` | 场地、地下水、基础与抗浮建议 |
| `SRC-05-ARCH` | `05_建筑专业输入资料/云南旅游职业学院龙泉路校区提升改造项目（一期）_建筑专业输入_初步设计说明总体_V01.docx` | 建筑专业输入；原文件名日期与正文日期存在冲突 |
| `SRC-USER-DECISION-20260916` | 用户确认记录（2026-09-16） | 派生输出统一采用“2号学生食堂”和17.35m高度；不改写原始资料 |
| `SRC-TASK-20260923` | 用户任务说明（2026-09-23） | 自然语言采集、校验、二次确认与盈建科初始模型联动需求 |
| `SRC-YJK-INSTALL-REGISTRY` | 本机 Windows 注册表与开始菜单只读核查 | 已安装盈建科建筑结构设计系列软件2026 V8.1.0；不等同于确认公开 API |
| `SRC-YJK-GAMA-DOCS` | `D:/YJKS/YJKS_8_1_0/documentation/common` 随装官方文档 | “模型”“标准层参数”“生成YJK模型”等 GAMA 能力；具体子来源见 `design/yjk-nl-model-init/SOURCES.md` |

## 文件完整性

本次一次性规范命名未改变文件内容：

- `SRC-04-GEO` SHA-256：`BD80B28CCE5DC08F2785D72E6A604456924B6EBB9B1AAE5CDA9F909517FF2EA5`
- `SRC-05-ARCH` SHA-256：`5AB416257450F93E5F7E75EC6A3058BBC8BC800CDA151D27C9D68BFAF4358404`


## 2026-10-01 默认措施恢复

`USER-20261001-RESTORE-TEMPLATE`、`MEASURES-V1.2-20250912`、`EXPANSION-WORD-BASELINE`、`EXPANSION-OUTLINE`：原文事实及路径登记见 [来源说明](web-demo/design/template-restoration/README.md)。原件只读，历史工程数值不作为当前事实。

`USER-20261002-CALCBOOK-PDF`、`CALCBOOK-WORD-CATALOG`、`QA-CALCBOOK-PDF-20261002`：计算书 Word 完整目录、模型输出路径结构和四份 PDF 实测记录，见 [目录与 PDF 来源](web-demo/design/task6-calculation-book/PDF路径与完整目录.md)。原件只读，扫描结果不代表工程校核通过。

`USER-20261001-LOCAL-REG-DOCX`：地方规范目录版式取自用户指定《！结构初步设计说明-汇总版本.docx》第 2.2 节、表 2.2；原文事实及使用边界见 [版式来源](web-demo/design/regulation-document/README.md)。

`USER-20261002-REGULATION-QUERY-ACTIONS`、`USER-20261002-REGULATION-ADD-ALL`：用户要求查询结果独立操作列和一键全部添加，取消单独已选目录；原文事实，见地方规范模块说明。
