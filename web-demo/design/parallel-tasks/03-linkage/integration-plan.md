# 接入主工作台方案

## 1. 接入边界

正式入口固定为 `web-demo/workbuddy-integrated-studio.html`。本目录原型只验证交互与算法；不得新增第二套首页、导航、角色、阶段、模块状态或参数编辑入口。

现有主工作台必须继续作为以下状态的唯一前端容器：

- 角色：`ROLE`、`ROLES`、`permOf()`；
- 阶段：`PSTAGE`、`PSTAGES`、`stageOk()`、`cardVisible()`；
- 模块状态：`CST`、`STN`、`cardActs()`、`cardAct()`、`setSt()`；
- 模块锁定：`syncLock()`，锁定粒度为整张模块卡；
- 参数唯一真源：①里的 `[data-k]` 控件，②、④、⑦只读引用。

## 2. 能力—模块—函数映射

| 能力 | 正式落点 | 复用现有函数/数据 | 最小增量接入点 |
|---|---|---|---|
| 荷载条目新增、删除、撤销后的连续编号 | ① `stage1` 的荷载表 | `addRow(btn)`、`delRow(btn)`、`restoreRows()` | 每个荷载行增加稳定 `data-row-id` 和 `data-section-key`；三函数完成 DOM 变更后统一调用 `renumberLoadRows(table)`；新增拖拽完成后也调用同一函数 |
| 荷载拖拽排序 | ① 荷载小节子卡 | 既有 `.itbl` / `tbody` | 新增 `moveLoadRow(rowId,beforeRowId)`；不以显示号作为身份，交叉引用只存 `row_id` |
| 参数变更影响提示 | 全局能力，入口仍在①参数面板 | `onParamChange(k)`、`deriveAll()`、`applyParams()` | `onParamChange(k)` 完成现有刷新后调用 `collectParamImpact(k, before, after)`；只生成影响记录，不直接改②/④/⑦业务决定 |
| ②扩初说明联动 | ② `stage2` | `applyParams()`、`generateExpand()`、`cleanClone()`、`exportDocx()` | 影响条显示“已同步/需复核”；导出前固化 `visible_set_snapshot`，页面与 Word 都从该快照渲染 |
| ④反校核重新评估 | ④ `stage4` | `rcStart()`、`rcBuildDiff()`、`rcAdopt()` | 受影响参数变化后把最近一次 `RCLAST` 标为过期并提示重跑；继续保持 `rcAdopt()` 人工确认，不自动采纳模型值 |
| ⑦载入604条款与规则建议 | ⑦ `stage7` | `CARDS` 中 `c7`、`goStage(7)` | 去掉 `todo:true`；新增 604 只读加载器和确定性规则评估器；AI只解释，不参与最终 `decision` |
| ⑦人工复核与删减 | ⑦ 条款树/子卡 | 复用章卡/子卡心智；后续迁入的 `SECMETA/SUBRULES/FEATKEYS` | 人工决定、覆盖理由、排序、依赖处理写入603；604内容不改不删 |
| ⑦依赖检查与编号 | ⑦条款审核工具条 | 新增纯函数 `resolveVisibleSet()`、`renumberVisibleSet()` | 先检查引用/适用规则/未决项，再按同父节点连续编号；交叉引用由稳定 `clause_uid` 在导出时解析 |
| 负责人锁定与签发 | ⑦整张模块卡 | `cardAct('c7','submit/approve/revoke')`、`setSt()`、`syncLock()` | 不另建第二套状态机；锁定前加门禁：人工复核完成、无阻断依赖、编号快照完成、来源版本存在 |
| 差异对比与版本回退 | ⑦右侧抽屉/工具条 | `CST.c7` 状态 + 603版本 | 业务差异按 `clause_uid` 比较新增/删除/修改/顺序；回退以旧版本为基线创建新草稿，不覆盖历史 |
| ⑦网页/Word同源导出 | ⑦ `stage7` | `cleanClone()`、`exportDocx()`、`DOCMETA[7]` | `cleanClone()` 只接收已解析的同一可见集；`exportDocx()` 的 stage 7 分支消费与页面相同的 `visible_set_snapshot_id` |

## 3. 自动编号设计

### 3.1 身份与显示号分离

- `row_id / clause_uid`：稳定身份，新增后不变；用于依赖、差异、审计和回退；
- `original_no`：604 或母版原编号，仅用于对照；
- `display_no`：当前项目可见集的显示编号，可重算；
- 任何交叉引用不得保存 `display_no`，必须保存目标 uid。

### 3.2 算法

1. 按 `parent_uid + order_key` 排序；
2. 排除 603 决定为 `delete` 的条款，但不物理删除数据；
3. 对每个父节点的可见子项从 1 到 N 连续分配 `display_no`；
4. 将 `ref_target_uid` 在预览/导出阶段解析为最终 `display_no`；
5. 新增、删除、恢复、拖拽、撤销、回退均调用同一纯函数；
6. 专业负责人签发时固化编号映射和可见集快照。

### 3.3 与“章卡不重排”的边界

主工作台既有章卡编号仍按母版保留，隐藏章不自动改章号。本任务的连续编号只处理：

- ①荷载明细行/项目自定义条目；
- ⑦经人工删减后的条款同级序号。

这样避免破坏院级范本章号和表格交叉引用，同时满足用户对荷载条目、总说明条款的连续编号要求。

## 4. 参数影响提示

`onParamChange(k)` 只产生 `impact_event`，不静默修改其他模块的人工决定：

1. 保存参数版本到603；
2. 由“参数—章节矩阵”计算受影响目标；
3. ①标记当前小节已更新；
4. ②更新纯参数引用，涉及条件可见性或人工固化单元格时标“需复核”；
5. ④将旧反校核结果标“过期，需重跑”；
6. ⑦重新运行604确定性适用规则，但只更新“规则建议”，不覆盖人工决定；
7. PPT沿用②的同源快照，标记需要重新生成的页。

## 5. ⑦总说明流程

`载入603项目条件 + 604条款版本 → 确定性规则建议 → 设计人逐条复核 → 专业负责人复核覆盖 → 依赖检查 → 自动重排 → 固化 visible_set_snapshot → cardAct(c7,'submit') → cardAct(c7,'approve') → exportDocx()`

规则建议只能来自604发布的确定性规则。AI可用于：解释规则、搜索条款、起草“修改理由”；AI不得写入最终决定或直接推进 `CST.c7`。

## 6. 增量迁入顺序

1. 先把 WorkBuddy 的 `SECMETA/SUBRULES/FEATKEYS` 和可见集机制迁入当前运行分支；
2. 在①给荷载行补稳定 id，并接入纯函数编号，不改章卡编号；
3. 在 `onParamChange()` 加影响事件，不改现有派生链算法；
4. ②、④增加“受影响/已过期”提示；
5. 启用 `CARDS.c7`，接入604只读加载与603决定保存；
6. 复用 `cardAct/setSt/syncLock` 完成⑦审签；
7. 修改 `cleanClone/exportDocx` 的 stage 7 分支，强制使用同一可见集快照；
8. 跑现有基线测试和本目录新增验收用例。

