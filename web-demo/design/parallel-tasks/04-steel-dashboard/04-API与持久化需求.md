# 给主任务的 API 与持久化需求

本文件只提出契约，不创建数据库、不指定主任务必须使用的表结构。

## 1. 领域对象

主任务需要持久化或提供等价能力：

| 对象 | 关键字段/关系 |
|---|---|
| `Project` | `project_id`、名称、地区、权限范围 |
| `Building` | `building_id`、`project_id`、功能、体系、层数、高度、设防字段 |
| `QuantitySubmission` | `submission_id`、单体、阶段、材料范围、面积、质量、规则版本、状态、来源、版本链 |
| `QuantityBreakdown` | `submission_id`、空间范围、构件一/二级、质量、方法、来源 |
| `SourceReference` | `source_id`、文件/记录定位、哈希、只读地址、有效状态 |
| `ValidationIssue` | 规则、级别、字段/行号、检测值、期望值、状态、责任人、处置意见 |
| `ReviewRecord` | 提交版本、动作、意见、复核人、时间、签名/身份信息 |
| `CohortSnapshot` | 过滤条件、规则版本、样本 ID、排除原因、统计量、生成时间 |
| `BenchmarkCase` | 单体版本、适用边界、可复用要点、有效期、复审状态 |
| `AuditEvent` | 谁在何时对哪个版本执行何动作，含前后摘要 |

### 1.1 不可变与唯一性

- 审批后的 `QuantitySubmission` 不可原地修改；新版本通过 `supersedes_submission_id` 关联。
- 建议唯一键：`tenant_id + source_system + submission_external_id`。
- 每个“单体 + 阶段 + 材料范围”仅允许一个 `approved && effective` 版本。
- `source_id` 不应只保存文件名，需可定位到文件版本或数据行。
- 删除采用受控作废状态，保留审计链；统计查询默认排除作废版本。

## 2. 建议 API

### 2.1 模板与导入

```http
GET  /api/steel-usage/import-template?type=summary&ruleVersion=v1
GET  /api/steel-usage/import-template?type=breakdown&ruleVersion=v1
POST /api/steel-usage/import-jobs/validate
POST /api/steel-usage/import-jobs/{jobId}/commit
GET  /api/steel-usage/import-jobs/{jobId}
```

预检响应至少包含：`row_number`、`field`、`severity`、`rule_code`、`message`、`suggested_action`，以及整批 `insert_count/update_count/error_count/warning_count`。

### 2.2 提交与版本

```http
POST /api/projects/{projectId}/buildings/{buildingId}/steel-usage/submissions
GET  /api/steel-usage/submissions/{submissionId}
GET  /api/steel-usage/submissions/{submissionId}/diff?base={previousId}
POST /api/steel-usage/submissions/{submissionId}/submit-review
POST /api/steel-usage/submissions/{submissionId}/review
POST /api/steel-usage/submissions/{submissionId}/supersede
```

写操作要求 `Idempotency-Key`、当前用户、租户/项目权限和乐观锁版本。`review` 的动作仅允许 `approve` / `return`，并要求意见。

### 2.3 汇总与比较

```http
GET /api/steel-usage/dashboard/summary
GET /api/steel-usage/buildings?filters=...
POST /api/steel-usage/cohorts/preview
POST /api/steel-usage/cohorts/snapshots
GET /api/steel-usage/cohorts/{snapshotId}
GET /api/steel-usage/submissions/{submissionId}/comparison?snapshotId=...
```

比较响应必须返回：

```json
{
  "comparability": "A|B|C|D",
  "reasons": ["..."],
  "sampleCount": 12,
  "statistics": {"p25": 51.2, "median": 57.6, "p75": 64.8},
  "selectedValue": 62.5,
  "unit": "kg/m2",
  "cohortSnapshotId": "cohort_...",
  "calculationRuleVersion": "steel-usage-v1",
  "sourceIds": ["SRC-..."],
  "claimType": "AI推断"
}
```

前端不自行拼装正式统计区间；服务端或受控统计服务负责规则与快照。

### 2.4 异常与基准

```http
GET  /api/steel-usage/issues?owner=&severity=&status=
POST /api/steel-usage/issues/{issueId}/resolve
POST /api/steel-usage/benchmark-cases
POST /api/steel-usage/benchmark-cases/{caseId}/review
GET  /api/steel-usage/benchmark-cases?validOn=...
```

## 3. 权限需求

| 能力 | 设计人员 | 专业负责人 | 管理者 |
|---|---:|---:|---:|
| 编辑本人负责的草稿 | 是 | 按项目授权 | 否 |
| 提交复核 | 是 | 是 | 否 |
| 通过/退回 | 否 | 是 | 否 |
| 查看跨项目脱敏统计 | 受限 | 按专业范围 | 是 |
| 查看个人明细 | 本人/本项目 | 按项目授权 | 默认否，需审计授权 |
| 设为优秀参考案例 | 提名 | 审核 | 查看 |
| 修改比较规则 | 否 | 提案 | 经治理流程发布 |

## 4. 查询与性能

- 管理总览摘要目标响应时间：常用筛选 P95 < 2 s；
- 大批量导入异步处理，提供进度与错误文件；
- `CohortSnapshot` 与统计结果可缓存，但缓存键必须包含租户、权限、规则版本和数据版本；
- 导出结果需带生成时间、过滤条件、快照 ID、规则版本和“非绩效排名”声明。

## 5. 审计与数据治理

- 保存原始上传文件的只读引用、哈希和解析日志；
- 原始资料不被本模块覆盖或移动；
- 所有字段变更记录旧值、新值、操作者、理由和来源；
- 冲突值并存为问题项，负责人确认前不得静默选值；
- 统计/AI 结论明确区分 `原文事实`、`作者观点`、`我的观点`、`AI推断`；
- 管理者导出和查看跨项目明细应进入访问审计；
- 备份、保留期限和个人信息脱敏沿用主任务统一策略。

## 6. 接入前置决策

主任务需要与结构负责人确认后再实施：

1. 面积口径代码和阶段优先级；
2. 基础是否全部计入地下，以及多塔大底盘分摊规则；
3. 结构体系、建筑功能、地区组受控字典；
4. 层数/高度分箱；
5. 样本量门槛和比较等级；
6. 优秀案例评审人与有效期；
7. 哪些角色可查看跨项目与个人明细。

