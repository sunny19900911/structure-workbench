# 任务一｜工作台产品主线与假期迭代规划

## 结论

结构设计 AI 工作台不是新建网站。正式交付入口固定为 `web-demo/workbuddy-integrated-studio.html`，产品主线必须在既有①—⑧模块卡、两级卡片、角色、阶段、状态机和①参数唯一真源上增量完善。`source_id: SRC-P01-014, SRC-P01-015, SRC-P01-016`【原文事实】

在这一既有骨架中，产品主线应收束为：

> 把分散的项目资料转成一套“有来源、经确认、可复用、能反校核”的项目参数基准，并用同一基准驱动技术措施、设计说明和管理抽查。

它不是“自动替工程师做设计”的工具，也不应把独立原型包装成另一套成品。下一阶段只证明一件事：①中的同一套已确认参数能贯穿②成果生成、④模型反校核和既有状态机中的负责人签发。`source_id: SRC-P01-001, SRC-P01-007, SRC-P01-014`【我的观点】

## 本目录交付

- [`08-increment-integration-review-demo.html`](./08-increment-integration-review-demo.html)：增量接入评审 Demo；复用既有工作台视觉骨架，交互展示①—⑧落位、后台能力和不可破坏项。仅用于评审，不是正式入口。

- [00-source-registry.md](./00-source-registry.md)：来源登记与现状走查证据。
- [01-product-mainline.md](./01-product-mainline.md)：产品定位、核心价值、用户与关键路径。
- [02-priority-and-mvp.md](./02-priority-and-mvp.md)：已有功能完善、新功能开发优先级、MVP 与暂不做清单。
- [03-holiday-iteration-plan.md](./03-holiday-iteration-plan.md)：中秋 3 天、国庆 7 天逐日计划与退出门槛。
- [04-role-flow-and-acceptance.md](./04-role-flow-and-acceptance.md)：三类角色流程、UAT 场景和验收指标。
- [05-leadership-roadshow.md](./05-leadership-roadshow.md)：产品路线、领导现场演示脚本、备选方案和试点申请。
- [06-core-change-proposals.md](./06-core-change-proposals.md)：建议修改的核心文件清单；仅提出建议，尚未实施。
- [07-integration-revision.md](./07-integration-revision.md)：接入现有工作台的修订说明与①—⑧落位矩阵。

## 这次任务没有做什么

- 未读取、修改或重建 `E:\600-工作台数据库`。
- 未修改 `web-demo` 的 React、HTML、CSS、脚本或数据文件。
- 未修改 601/602/603/604 数据库设计。
- 未承诺全院正式上线；当前建议仍是 2 个项目、3～5 人、2 周的受控试点。`source_id: SRC-P01-008`【作者观点】

## 建议主任务立即采用的三项决策

1. 下一次领导演示从既有首页卡片墙进入，只跑“首页 → ①统一技术措施 → ②扩初说明 → ④反校核 → ⑥项目快照”的 8～10 分钟黄金路径，不逐张展开八个模块。`source_id: SRC-P01-007, SRC-P01-014, SRC-P01-016`【我的观点】
2. 中秋 3 天只完成“演示可信度”；国庆 7 天再完成“可试点闭环”，两者不要混为一次大版本。`source_id: SRC-P01-008, SRC-P01-011`【我的观点】
3. React 等独立原型只保留作验证；经过验证的能力必须拆分接入既有模块或后台服务，不新建第二套首页、导航或参数真源。暂不修改数据库结构，先以黄金样板一致性、可恢复演示和实测试点指标作为准入条件。`source_id: SRC-P01-014, SRC-P01-015, SRC-P01-016`【我的观点】
