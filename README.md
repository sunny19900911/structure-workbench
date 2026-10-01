# 结构设计 AI 工作台

**小香金猪**的结构设计工作台：一套项目参数，联动统一技术措施、扩初说明、规范查询、重难点判断、用钢量统计、计算书和汇报 PPT。

- **资料入口**：在②扩初说明导入建筑、地勘和模型资料；确认参数后计入①统一技术措施。
- **文稿生成**：保留默认措施与荷载表，结合当前项目生成扩初初稿；支持人工编辑和 DeepSeek 改写。历史示例须显式载入，不能代替当前项目事实。
- **版式与输出**：左侧目录导航，正文按 Word 的 A3 横向双栏版式预览和导出；定稿须由结构负责人复核。

## 启动

Windows 安装 Node.js 和 pnpm 后，运行根目录 `启动Demo.cmd`。正式入口为 `http://127.0.0.1:5190/workbuddy-integrated-studio.html`，首次启动会安装依赖。

Word 精确预览需本机 Microsoft Word 和 Poppler；旧版 DOC 提取需 Antiword。DeepSeek 配置放在本地 `web-demo/.env.local`。腾讯 ima 接入依赖本机桥接模块，仓库不包含密钥或外部数据库。

项目数据默认保存在 `E:/600-工作台数据库`；可用 `WORKBENCH_DATABASE_ROOT`、`WORKBENCH_PROJECT_STORE` 改目录。克隆代码不会复制已有项目数据；上传 GitHub 也不等于部署网站。

## 开发

先读 [AGENTS.md](AGENTS.md)，其中列有主对话、专项分工、参数联动规则及测试命令。正式页面为 `web-demo/workbuddy-integrated-studio.html`；专项实现位于 `web-demo/design/`，服务位于 `web-demo/server/`。

在 `web-demo` 中运行 `pnpm install --frozen-lockfile`、`pnpm run build`。分支及工作树应从审核后的首次提交建立；工作树测试使用独立的 `WORKBENCH_PROJECT_STORE`。

本仓库保留运行所需的默认母版、历史演示数据及来源说明；原始资料、实际项目库、凭据、缓存与导出结果留在本机。建议使用私有仓库。
