# 任务三｜设计成果联动与总说明编制交互

## 结论

本目录是**隔离验证包**，不是新的独立工作台。正式运行与交付入口始终是：

`C:\Users\mj528\Documents\004 工作\web-demo\workbuddy-integrated-studio.html`

最终能力接入现有模块：

- ① 统一技术措施：荷载条目连续编号、参数唯一真源、影响提示入口；
- ② 结构扩初说明：继承①参数、展示影响、网页与 Word 同一可见集；
- ④ 反校核：参数变化后标记需重跑，只报差异，不静默改值；
- ⑦ 施工图总说明：读取 604 条款与确定性规则，人工复核决定写入 603，模块级审签后导出。

## Demo

原型入口：[`prototype/index.html`](./prototype/index.html)

由于使用 ES Module，请从 `web-demo` 目录启动本地服务：

```powershell
npx vite design/parallel-tasks/03-linkage/prototype --host 127.0.0.1 --port 4174
```

然后打开 `http://127.0.0.1:4174/`。

可操作路径：

1. 将任一“保留”条款改为“删除”，观察同章节草案编号连续重排；
2. 点击“新增条款”，观察新增项取得稳定 uid 与连续显示号；
3. 在“全部”筛选下拖拽行，观察编号随顺序重算；
4. 点击“撤销 / 重做”，验证顺序、决定、编号一起恢复；
5. 运行依赖检查，处理“需复核”和人工覆盖缺少理由；
6. 确认重排编号，切换到“审签”完成模块级锁定；
7. 查看差异对比、版本回退和网页 / Word 同源预览。

## 文件

- `concept-total-notes-linkage.png`：视觉概念图；
- `prototype/`：交互验证原型，不作为正式入口；
- `integration-plan.md`：接入现有主工作台的模块、函数与增量顺序；
- `api-contract.md`：提供给主任务的字段/API消费清单；
- `acceptance-tests.md`：正式接入时的验收用例；
- `tests/numbering.test.mjs`：编号、拖拽、可见集快照的纯函数测试。

## 约束声明

- 未修改 `workbuddy-integrated-studio.html` 或任何 601/602/603/604 核心数据；
- 604 是总说明公共条款与规则的只读真源；
- 项目级保留/删除、人工覆盖、理由、审签和输出版本进入 603；
- AI 仅辅助解释、搜索和起草理由，不能替代确定性规则或人工确认；
- 页面预览与 Word 必须消费同一 `visible_set_snapshot`。

