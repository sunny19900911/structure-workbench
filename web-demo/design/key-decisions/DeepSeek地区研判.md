# DeepSeek 地区研判

小香金猪要求把地区检索方法内嵌到工作台（原文事实，`USER-20261002-DEEPSEEK-RESEARCH`）。

**使用**：①填写省市区县和项目条件 → ⑩点击“DeepSeek 地区研判”；DeepSeek 助理也有同名快捷入口。一次形成三个方面、七个专题的AI草稿。点击“按AI草稿编制”进入原有编辑、负责人确认流程。

**内嵌方法**：省市园区消歧 → 国家基础要求 → 省级规定 → 市县补充 → 修订、废止、过渡期 → 对照项目条件。抗震分类及等级、绿色星级及装配比例、性能目标及隔减震分别核查；不跨地区套历史数值。方法文件 `decision-research-method.js`，版本 `REGION-RESEARCH-20261002-1`。

**实现**：复用31省规范目录和官方入口；DeepSeek原生联网检索最多3组×2次搜索，再读取最多15个官方页面，最后调用一次结构化研判。来源缓存24小时（进程内，重启清空），可主动刷新；展示抓取时间、缓存命中和失败记录。结果与最近4次历史存当前项目 `modules` 分区，保留修订冲突保护；不写601、不改工程参数。输入变化后旧AI草稿禁用采用，人工决定仍保留。

**证据边界**：只接受真实 `web_search_tool_result`，不从普通模型回答中提取虚构链接。引用ID和摘录必须与取得的文本匹配；摘要、PDF未提取全文、缺项和规范版本待核均明确标记。查到了页面不等于已确认现行及适用，更不等于工程验算完成。网页中的命令不作为模型指令。

**配置**：沿用服务端 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`。官方API默认采用原生搜索；自定义聊天网关须明确配置其支持的 `DEEPSEEK_SEARCH_BASE_URL`（Anthropic兼容根路径，程序追加 `/messages`），可选 `DEEPSEEK_SEARCH_MODEL`。不把第三方网关凭据自动发往官方服务；浏览器不持有密钥。联网和研判都会产生模型调用费用，仅点击开始时调用。

2026-10-02：按用户指定目录接入外部 `E:/00-key/deep seek key.txt`。环境密钥优先，否则在服务器启动时读取外部文件；只在内存使用，不复制进项目。路径可通过 `DEEPSEEK_API_KEY_FILE` 调整。配置与真实联网联调均已通过；加载器3项回归通过。来源：`USER-20261002-DEEPSEEK-KEY-PATH`。

**依据**（接口事实，2026-10-02核对）：

- `DS-NATIVE-SEARCH-DOC`：[DeepSeek官方联网说明](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/#using-web-search-in-claude-code)。
- `DS-NATIVE-SEARCH-WIRE`：[官方Harness搜索接口实现](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/web-search-deepseek/src/provider.ts)，用于核对请求协议及结果结构，本项目独立实现。
- `SRC-T2-PILOT-31PROVINCES-M9-20260928`：既有 `main-workbench-pilot-tj-bj.json` 与省级权威源注册表，仅作为发现入口，不代表目录完整或当前有效性自动确认。
- `KM-*`：已核对的昆明来源入口，见《昆明联动规则与验收》，只在云南作为优先线索。

**验收**（`QA-DS-RESEARCH-20261002`，原文事实）：相关回归合计38项通过，构建通过。浏览器采用5198隔离库及明确标注的合成响应，验证新地区入口、结果保存恢复、编制草稿和参数变化失效；合成结果不是工程事实。

**真实联调**（`QA-DS-LIVE-20261002`，原文事实）：5197服务从外部文件加载配置；南京合成参数经 `deepseek-v4-pro` 真实联网，三个方向均返回搜索候选，生成七专题。收集13条来源，其中5条取得网页摘录、8条为摘要或正文待核。原始响应仅保留在忽略的 `qa/decision-research/live-result.json`，未写正式项目库。首轮引用校验失败后，改为模型选择原文片段编号、服务器回填摘录，第二轮通过；另增加缺项时不允许“无强制要求／场地已确认”的确定性保护。工程适用性和PDF全文仍待人工核对。

运行：`node --test design/project-integration/decision-research.test.mjs design/project-integration/regional-decisions.test.mjs design/project-integration/modules.test.mjs`；构建 `pnpm run build`。
