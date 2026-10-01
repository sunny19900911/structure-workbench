# 任务一来源登记

更新时间：2026-09-25

本目录中的产品结论遵循项目 `AGENTS.md`：可复用结论必须关联 `source_id`，并区分“原文事实、作者观点、我的观点、AI推断”。这里的“我的观点”均为本任务的产品经理判断，不代表院内已批准决策。

| source_id | 类型 | 来源 | 本任务使用范围 |
|---|---|---|---|
| `SRC-P01-001` | 原文事实 | `C:\Users\mj528\Documents\004 工作\AGENTS.md` | 原始资料只读、来源追溯、冲突保留、结构负责人复核等边界 |
| `SRC-P01-002` | 原文事实 | `web-demo/README.md` | 当前 Demo 功能、数据量、输出能力、启动方式和人为确认原则 |
| `SRC-P01-003` | 原文事实 | `web-demo/src/App.jsx` | 独立 React 验证页的参数详情、来源卡、Word/PPT、问题清单等交互；不是正式交付入口 |
| `SRC-P01-004` | 原文事实 | `web-demo/src/ConfirmationWorkspace.jsx` | 候选值、证据、人为确认、本地覆盖层、导出 JSON 和清除本地新增等实现 |
| `SRC-P01-005` | 原文事实 | `web-demo/src/data/projectData.js`、`web-demo/src/data/task2/task2_bundle.json` | 黄金样板项目的参数、问题、来源和确认数据 |
| `SRC-P01-006` | 原文事实 | `web-demo/workbuddy-unified-measures.html` | 统一技术措施模板、地点查表、参数派生、正文和 Word 导出能力 |
| `SRC-P01-007` | 原文事实 | `web-demo/workbuddy-integrated-studio.html` | 唯一正式运行与交付入口；8 张业务卡、三角色、两阶段、卡片状态机、反校核、用钢量、全院总览、提资台账 |
| `SRC-P01-008` | 作者观点 | `web-demo/design/一体化工作台_全院推广成熟度评估.md` | “可演示 MVP、暂不宜全院上线”、受控试点建议、兼容性和验收指标 |
| `SRC-P01-009` | 作者观点 | `web-demo/design/一体化工作台_简要介绍.md` | 工作台定位、八模块、基本流程、主要价值和当前阶段 |
| `SRC-P01-010` | 原文事实 | `web-demo/design/DeepSeek_AI接入说明.md`、`web-demo/deepseek-assistant.js` | AI 助理能力、外部云模型数据边界和不自动回写原则 |
| `SRC-P01-011` | 原文事实 | 2026-09-25 本地浏览器走查：`http://127.0.0.1:5173/`、`/workbuddy-unified-measures.html`、`/workbuddy-integrated-studio.html` | 实际可见页面、入口、默认状态、跨页面连贯性和现场演示风险 |
| `SRC-P01-012` | 原文事实 | 2026-09-25 执行 `pnpm.cmd build` | Vite 生产构建成功；主 JS 包出现大于 500 kB 的体积警告 |
| `SRC-P01-013` | 原文事实 | `web-demo/outputs/`、`web-demo/qa/` | 已有 Word/PPT 成果和 Word/UI 视觉验收材料 |
| `SRC-P01-014` | 上位约束 | `web-demo/design/工作台骨架与增量开发边界.md` | 当前正式入口、①—⑧产品骨架、两级卡片、数据库边界、三个任务接入位置与验收口径 |
| `SRC-P01-015` | 原文事实 | `E:\11-工作\001-workbuddy spaceV1\001-workbuddy space\100-任务拆解\00-主任务总览.md` | WorkBuddy 原始任务框、参数联动铁律、角色阶段状态机、章节卡机制、测试基线 |
| `SRC-P01-016` | 原文事实 | `E:\11-工作\001-workbuddy spaceV1\001-workbuddy space\100-任务拆解\04-网站设计总纲（供外部AI审核）.md` | 两级卡片目标架构、`SECTIONS/SUBRULES/FEATKEYS`、显式开关、导出一致性及既有落地记录 |

## 约束优先级

自 2026-09-25 起，`SRC-P01-014` 是任务一新的上位约束。若本任务早期结论与其冲突，以该文件为准：正式交付必须增量接入 `workbuddy-integrated-studio.html`，不得另建首页、导航、参数体系或独立工作台；独立原型只保留为验证资产。`source_id: SRC-P01-014`【原文事实】

## 走查记录摘要

以下记录用于支撑本任务的现状判断，不改变任何项目数据。

1. `workbuddy-integrated-studio.html` 是当前唯一正式运行与交付入口，首页保留①—⑧模块卡，内部继续沿用三角色、两阶段和四态状态机。`source_id: SRC-P01-007, SRC-P01-014, SRC-P01-015`【原文事实】
2. WorkBuddy 功能基线已实现章卡、小节子卡、显式结构特征开关、隐藏不丢数据以及网页/Word 使用同一可见章节集；当前运行分支需要逐项迁入缺失机制，不能被旧文件整体覆盖。`source_id: SRC-P01-014, SRC-P01-016`【原文事实】
3. 独立 React 验证页可演示参数详情、来源和人工确认，但其中“未确认候选打开后表单默认显示已人工确认”等交互缺陷只能作为接入设计参考；该页面不是最终产品入口。`source_id: SRC-P01-003, SRC-P01-004, SRC-P01-011, SRC-P01-014`【原文事实】
4. ①是公共结构设计参数唯一可编辑真源；②单向继承①并补充建筑、地勘和模型结果；④只比较差异；⑤形成单体统计，⑥只读快照；⑦消费603/604；⑧目录即台账。`source_id: SRC-P01-014, SRC-P01-015, SRC-P01-016`【原文事实】
5. 当前角色/阶段/状态持久化主要使用 localStorage，但这些机制是必须保留的业务骨架；后续正式项目数据和人工决定应进入603，不能把状态机降格为装饰。`source_id: SRC-P01-007, SRC-P01-014, SRC-P01-016`【原文事实】
6. ⑦“施工图总说明”仍是既有占位卡，后续应在该卡内接入604，而不是新增第九张模块卡或独立页面。`source_id: SRC-P01-007, SRC-P01-014`【原文事实】
7. 生产构建成功，未发现浏览器控制台错误；构建仅提示主 JS 包体积较大。`source_id: SRC-P01-011, SRC-P01-012`【原文事实】
