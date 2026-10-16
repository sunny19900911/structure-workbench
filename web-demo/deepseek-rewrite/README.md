# DeepSeek 段落改写

2026-10-15（USER-20261015-REWRITE-SPEED）：用户反馈分条改写耗时约250秒，要求减少等待。本段覆盖此前默认深度思考的约定。每次打开新选段均关闭联网及深度思考，需分析时仍可主动开启；发送中锁定开关。普通简洁、分条、润色要求仅附单体/章节，明确要求结合资料或分析时保留完整有界上下文。沿用现有服务端模型配置，不擅自切换模型。收到模型完整结束标记或前端最终结果后立即取消余流，不等待远端关连接。失败、停止显示独立的“未完成”回复，不再只有重复的用户气泡。完成显示实际总用时。

真实API边界：本机官方接口实测发生HTTP 503及非思考模式无正文超时，尚未取得可证明提速的成功耗时；浏览器流式、开关重置和采用测试为隔离模拟响应，不能当作模型速度。见 `../design/deployment-fixes/20261015-rewrite-speed.md`。回归运行 `node --test deepseek-rewrite/rewrite.test.mjs deepseek-rewrite/stream.test.mjs deepseek-rewrite/deployment.test.mjs`。

2026-10-15（USER-20261015-INTERACTION-RETEST）：普通改写默认不检索网页，直接将选中文字、当前稿和要求发给 DeepSeek。联网仅在主动勾选“联网补查依据”时执行；深度思考仍默认开启。选段回填使用原有安全检查，采用才替换，前后正文不变。浏览器内测和联网跳过回归见 `../design/deployment-fixes/20261015.md`。

来源：USER-20261003-DEEPSEEK-REWRITE（用户要求；原文事实）。扩初正文选中文字或放置光标，点击“一键 DeepSeek 改写”；侧栏可联网、追问、编辑结果、替换原段落。采用前不修改正文。

| 文件 | 职责 |
| --- | --- |
| `panel.js` / `panel.css` | 对话侧栏、停止、继续追问、采用；无工作台全局依赖 |
| `core.js` | 选段替换、联动引用校验、有界上下文 |
| `writing.js` | 独立简短写作提示、多轮编辑对象 |
| `service.mjs` | `/api/deepseek-rewrite`、DeepSeek 思考模式、多轮对话、结果校验 |
| `search.mjs` | 可替换的检索提供器；复用现有官方网页提取能力 |
| `expansion-adapter.js` | 编辑器选区、项目/单体/版本检查、回填回调 |

工作台仅在 `expansion-workbench.js` 引入适配器、设置按钮、提供读写回调；服务仅在 `vite.config.js` 注册。要停用时恢复原 `rewrite` 按钮动作，移除适配器 import / mount 调用和 `rewriteApi` 注册即可，项目正文无需迁移。可单独替换 UI、检索或模型调用。

复用服务端 `localDeepSeekConfig`，不在此模块复制配置文件或密钥。可用 `DEEPSEEK_REWRITE_MODEL` 覆盖模型，默认沿用 `DEEPSEEK_MODEL`。新面板普通改写发送 `thinking: {type: 'disabled'}`，主动勾选后才启用；不向客户端返回推理内容。正文增量与处理进度通过 NDJSON 实时显示，允许停止。每次最多8轮追问、8000字选段，最多两轮检索，每轮最多2次搜索；API与联网服务可能计费。

联网调用兼容 Messages 的搜索工具，要求实际 `web_search_tool_result`；只接受现有检索适配器允许的官方域名。来源区区分官方网页摘录和未取得全文的搜索摘要，不自动认定有效版本。搜索不支持或失败时明确显示降级，仅按项目资料改写。自定义网关需要显式配置 `DEEPSEEK_SEARCH_BASE_URL`，不会把网关凭据隐式发往其他提供商。

采用使用原项目分区和 `recordSection`，保留上一稿，清除被改写文字的来源底色。项目、单体、依据版本或原文变化、签发只读时禁止采用旧结果。图表及动态措施有独立编辑逻辑，本轮只支持普通正文段落，不跨这些区域改写。只自动保护联动引用，不以数字是否变化阻止采用；采用不修改统一措施参数。

验证：在 `web-demo` 运行 `node --test deepseek-rewrite/rewrite.test.mjs design/reference-expansion/provenance.test.mjs design/project-integration/main-expansion-merge.test.mjs` 和 `npm run build`。虚构段落浏览器验收位于忽略目录 `qa/deepseek-rewrite`，不写入正式项目库。

2026-10-03 调整（source_id: USER-20261003-REWRITE-FREE，用户要求自由发挥）：保持简短提示，直接按用户要求改写，不设压缩比例、改动幅度或数字次数限制。追问发送侧栏当前稿（包括用户手改），初始原文仍作为联动引用校验基准。检索优先官方正文并要求带摘录，抓取空正文时回退到真实搜索引用；查到资料但未采用与实际引用分别显示。保持原检索次数上限，未增加按钮；联网补查按下述2026-10-06约定。

2026-10-06（source_id: USER-20261006-REWRITE-SEARCH）：用户要求优先联网成功，可延长等待。单轮搜索最多120秒，网页并行读取各20秒；未取得可用内容或短暂故障时最多补查一轮，鉴权/接口配置错误不重试。检索总预算290秒，改写120秒，前端420秒兜底，可随时停止。实时区分搜索、读取、补查、改写；保留真实检索摘录，普通模型回答不冒充规范原文。测试覆盖补查、鉴权失败、取消和网页超时摘要保留。

2026-10-06 对话体验（source_id: USER-20261006-DEEPSEEK-CHAT）：打开面板先输入要求，不自动调用API。新版客户端使用纯文本流式回答，服务端转发正文增量，不暴露思考内容；旧JSON客户端兼容保留。深度思考可选，按用户习惯默认开启，联网开关保留。对话消息使用自然语言，取消强制JSON正文包装；未完成结果仅显示，不进入待采用稿，仍由用户点击替换才回填。回归追加 `node --test deepseek-rewrite/stream.test.mjs`。
