# 项目管理速度修复与验收

source_id: USER-20261015-PROJECT-SPEED（原文事实：用户反馈删除强制下载备份、打开旧项目变慢）。

## 改动

- 删除取消自动调用全量归档下载；保存当前修改后写 lifecycle 删除标记，服务器分区和全部历史仍保留。保存断线或409冲突时停止删除，保留当前编辑状态。手动下载备份及恢复按钮保留。
- 切换列表中已有项目只更新当前选项，不重新扫描全库。
- 专项不预读全部扩初图片和正文。有跨单体判断时读取参数、模型和规范的精简上下文；完整文稿在打开 PPT 时读取。PPT 编辑器未打开时不提前构造完整汇报快照。
- 同版本建筑、地勘复用派生文档；更换项目、资料替换/移除/重新归类时更新。原文折叠时不生成全部文字 DOM，展开后完整显示。

## 浏览器对照

AI测试观察，source_id: QA-MANAGEMENT-SPEED-20261015。

测试采用实际打包后的旧版与修复版，在独立本机端口及隔离项目库运行。模拟项目含1800段文字、4份单体扩初图片数据及PPT图片数据，归档约15MB；项目API模拟10Mbps下载、每请求150ms延迟。时间取项目管理锁定到解除的浏览器观测，删除不计确认弹窗停留时间。

| 操作 | 修复前 | 修复后 |
|---|---:|---:|
| 打开大资料项目 | 8.431秒 | 1.792秒 |
| 删除同一规格项目 | 13.352秒 | 1.603秒 |

这是一次受控对照，不代表真实服务器耗时。两版使用相同结构和体积的模拟数据，未访问正式项目库或线上账号。修复版删除无全量归档GET，打开项目无全部扩初GET；打开PPT后才出现完整扩初读取。

恢复后重新打开项目、扩初概况、PPT编辑器可用，浏览器无错误。原1800段来源及四份扩初图片与首次保存内容一致，历史版本仍在。PPT检查覆盖读取和编辑器显示，未新增导出内容或版式改动。测试中显式载入的示例也成功建立副本。

原始日志、计时及隔离库：忽略目录 `web-demo/qa/management-speed-20261015`。截图：`web-demo/outputs/baota/内测-项目恢复与提速-20261015.jpg`。

## 自动检查

109项相关 Node 测试、5项更新脚本测试、Vite构建通过。覆盖删除失败不丢稿、软删除恢复、缓存失效、跨单体上下文、版本冲突、参数联动及原有选段改写。

本次核心命令（在web-demo执行）：

```text
node --test design/project-integration/management-performance.test.mjs design/project-integration/new-project.test.mjs design/project-integration/project-store.test.mjs design/project-integration/document-intake.test.mjs design/project-integration/modules.test.mjs design/seismic-grade/interaction.test.mjs
python deploy/baota/update.test.py
npm run build
python deploy/baota/package.py --base-path /work/ --proxy-strips-prefix --name structure-workbench-work-performance-20261015.zip
```

新包保留此前交互修复，按清单校验、预览更新计划；不包含账号、密钥、正式项目库或QA数据。未自动部署或提交Git。真实网站带宽及实际大项目仍需更新后复测；本次未调用真实DeepSeek。
