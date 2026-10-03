# DeepSeek 段落改写

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

复用服务端 `localDeepSeekConfig`，不在此模块复制配置文件或密钥。可用 `DEEPSEEK_REWRITE_MODEL` 覆盖模型，默认沿用 `DEEPSEEK_MODEL`。开启 `thinking: {type: 'enabled'}`；不向客户端返回推理内容。当前非流式返回，界面显示处理状态，允许停止。每次最多8轮追问、8000字选段，搜索最多2次；API与联网服务可能计费。

联网调用兼容 Messages 的搜索工具，要求实际 `web_search_tool_result`；只接受现有检索适配器允许的官方域名。来源区区分官方网页摘录和未取得全文的搜索摘要，不自动认定有效版本。搜索不支持或失败时明确显示降级，仅按项目资料改写。自定义网关需要显式配置 `DEEPSEEK_SEARCH_BASE_URL`，不会把网关凭据隐式发往其他提供商。

采用使用原项目分区和 `recordSection`，保留上一稿，清除被改写文字的来源底色。项目、单体、依据版本或原文变化、签发只读时禁止采用旧结果。图表及动态措施有独立编辑逻辑，本轮只支持普通正文段落，不跨这些区域改写。只自动保护联动引用，不以数字是否变化阻止采用；采用不修改统一措施参数。

验证：在 `web-demo` 运行 `node --test deepseek-rewrite/rewrite.test.mjs design/reference-expansion/provenance.test.mjs design/project-integration/main-expansion-merge.test.mjs` 和 `npm run build`。虚构段落浏览器验收位于忽略目录 `qa/deepseek-rewrite`，不写入正式项目库。

2026-10-03 调整（source_id: USER-20261003-REWRITE-FREE，用户要求自由发挥）：保持简短提示，直接按用户要求改写，不设压缩比例、改动幅度或数字次数限制。追问发送侧栏当前稿（包括用户手改），初始原文仍作为联动引用校验基准。检索优先官方正文并要求带摘录，抓取空正文时回退到真实搜索引用；查到资料但未采用与实际引用分别显示。保持原检索次数上限，未增加按钮或自动重试调用。
