# 主任务字段 / API 消费清单

> 这是工作台侧的**消费需求**，不是重新定义 604 数据库真源。最终表名、字段名和 URL 由主任务统一；只要能满足下列语义即可。

## 1. 604 只读输入

### 条款版本

| 语义字段 | 必需 | 用途 |
|---|---:|---|
| `library_version_id` | 是 | 锁定本次使用的604版本 |
| `template_id` / `template_version` | 是 | 选择施工图总说明母版 |
| `published_at` / `status` | 是 | 仅允许消费已发布版本 |
| `content_hash` | 建议 | 快照校验、防止版本漂移 |

### 条款

| 语义字段 | 必需 | 用途 |
|---|---:|---|
| `clause_uid` | 是 | 永久稳定身份，不随编号和排序变化 |
| `parent_uid` | 是 | 条款树和同级编号 |
| `order_key` | 是 | 母版默认顺序 |
| `original_no` | 是 | 与院级范本对照 |
| `title` / `content` | 是 | 网页与 Word 同源正文 |
| `source_id[]` | 是 | 可追溯来源；缺失时必须为“待核实” |
| `claim_type` | 是 | 原文事实 / 作者观点 / 我的观点 / AI推断 |
| `stage[]` / `role_scope[]` | 建议 | 适用阶段与可见权限 |
| `dependency_uids[]` | 是 | 删除前依赖检查 |
| `reference_target_uids[]` | 是 | 导出时解析交叉引用编号 |
| `rule_ids[]` | 是 | 关联确定性适用规则 |

### 确定性规则

| 语义字段 | 必需 | 用途 |
|---|---:|---|
| `rule_id` / `rule_version` | 是 | 规则追溯与差异 |
| `input_keys[]` | 是 | 读取603参数快照；禁止从页面复制第二套值 |
| `operator` / `expected_value` | 是 | 可复算的确定性判断 |
| `result` | 是 | `keep / delete / review` |
| `reason_template` | 是 | 展示建议原因 |
| `source_id[]` | 是 | 规则依据 |
| `priority` / `conflict_group` | 建议 | 多规则命中时保留冲突，不静默择一 |

## 2. 603 读取

- `project_id`、`building_id`、`stage`；
- 当前参数版本 `parameter_version_id`；
- 参数键值（直接对应①的 `data-k`，同一值不重复建编辑入口）；
- 结构特征开关 `FEATKEYS`；
- 既有人工确认、脱链固化单元格和资料版本；
- ②当前可见章节快照、④最近反校核版本和状态；
- ⑦上次草稿、复核、签发版本。

## 3. 603 写入

### 项目级条款决定 `total_note_decision`

| 字段 | 用途 |
|---|---|
| `project_id` / `stage` | 项目与施工图阶段 |
| `library_version_id` / `clause_uid` | 指向604只读版本和稳定条款 |
| `rule_suggestion` / `rule_version` | 当时的确定性建议 |
| `human_decision` | `keep / delete / review` |
| `is_override` | 是否覆盖规则建议 |
| `reason` | 覆盖或删除时必填 |
| `order_key_override` | 项目内人工排序，不回写604 |
| `actor_id` / `actor_role` / `decided_at` | 审计 |
| `revision` | 乐观锁，避免多人覆盖 |

### 可见集快照 `visible_set_snapshot`

- `snapshot_id`、`project_id`、`module_id='c7'`、`stage='施工图'`；
- `parameter_version_id`、`library_version_id`、`rule_version`；
- `visible_clause_uids[]`；
- `number_map[{clause_uid, display_no}]`；
- `dependency_check_id`；
- `created_by`、`created_at`、`content_hash`；
- `web_render_id` 与 `word_output_id` 都引用同一个 `snapshot_id`。

### 影响事件 `impact_event`

- `event_id`、`project_id`、`parameter_key`、`before`、`after`；
- `parameter_version_from/to`；
- `affected_modules[]`（只允许 c1/c2/c4/c7 及②派生PPT）；
- `affected_section_ids[]` / `affected_clause_uids[]`；
- `status`：`unread / acknowledged / reviewed / resolved`；
- `created_by`、`created_at`。

### 模块版本 / 审签

- `module_id='c7'`、`module_state`（0/1/2/3，与 `CST` 一致）；
- `version_id`、`parent_version_id`、`snapshot_id`；
- `submitter`、`reviewer`、`signer`、时间戳；
- `change_reason`、`review_note`；
- 回退采用“基于旧版本创建新草稿”，禁止覆盖历史。

## 4. 工作台所需接口语义

以下为建议的语义接口，路径由主任务决定：

1. `GET 604 published template`：按母版、阶段、版本读取条款树、来源、依赖和规则；
2. `POST evaluate rules`：输入 `parameter_version_id + library_version_id`，返回可复算的逐条规则建议；
3. `GET 603 project parameters`：读取①的唯一参数快照和结构特征；
4. `GET/PUT 603 total-note decisions`：按 `revision` 读写项目级人工决定；
5. `POST dependency check`：返回 blocker/warning、关联 uid 和处置建议；
6. `POST visible-set snapshots`：固化可见条款与编号映射；
7. `POST module versions`：提交、复核、签发或基于旧版本创建新草稿；
8. `GET version diff`：按 uid 返回新增/删除/修改/顺序/参数版本变化；
9. `POST impact events` / `PATCH impact status`：登记参数变化及各模块复核状态；
10. `POST export`：必须传 `snapshot_id`，网页和 Word 不允许各自重新算一遍。

## 5. 错误与并发要求

- 604版本不存在/未发布：阻断加载与导出；
- 603 `revision` 冲突：提示刷新并做差异合并，不静默覆盖；
- `source_id` 缺失：条款标“待核实”，签发门禁按主任务规则处理；
- 规则冲突：全部显示并形成问题项，不自动选一个；
- 依赖目标被删：blocker，必须恢复、改引用或负责人明确处理；
- 参数版本变化：旧依赖检查和旧可见集快照立即标记过期。

