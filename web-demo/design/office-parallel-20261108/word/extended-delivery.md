# 腾讯文档功能复刻第二轮

source_id: USER-WORD-MORE-FUNCTIONS-20261108（用户要求增加功能并使用REA，原文事实）。本轮依据用户给出的网页URL观察腾讯文档；没有取得微信小程序安装包，不声称已逆向小程序原始代码。

## 证据

- REA源页面重新观察：ev_e25df1737e6b45ea1b4cfe63c682ee9d241f0f7aae5a14a2ade87ffc7257c61c。专业工具栏、页面/引用/视图页签可见；匿名只读，编辑命令禁用。来源菜单不是可执行指令。
- REA本地页面：ev_671b1594c7418ae6576941b6eab16e8bba68188bf7b3efa91d14a911d32a0281。六页签中页面/引用/审阅/开始切换成功，无捕获到的page-error。没有修改用户预览文档（仍版本3）。
- 完整证据包在qa/portable-release/mcp/office-word-rea/evidence-extended.json；截图亦在该隔离目录。

## 实现

1. 开始：增减字号、清除字符格式、上下标，沿用粗斜下划线/删除线/颜色/高亮/字体/样式/段落。
2. 插入：表格行列可设置，超链接/取消链接、分页/换行/水平线、脚注，图片仍走原生插入。
3. 页面：指定文档节的A3/A4/Letter、横纵方向、四边距、1至3栏、栏距、页眉页脚距边缘。界面mm转换为内核英寸，导出twips核对。只改选定节，不默认改全文。
4. 引用：按标题1至3生成原生TOC域及内部链接；更新已有目录；插入、查看脚注。目录暂不生成页码，避免内核当前网页布局显示0页码。
5. 审阅：修订模式、修订所选文字、接受/拒绝所选与全部修订、批注、修订/批注列表。
6. 视图：大纲定位、字数统计、缩放、全屏、专注阅读；专业/简约/隐藏工具栏，Ctrl+F1切换；Ctrl+H查找替换，显示结果并定位，批量替换按逆序单事务提交。
7. 表格上下文：合并/拆分、标题行、底色、删除表格；既有增删行列仍在。合并依赖内核的单元格范围选择，不暴露模糊text-only MCP调用。

所有写入复用executeCommand/save及原expectedRevision。新增read().sections供MCP读取目标节。多节下拉会读取相应节当前设置。只读检索、视图切换不产生文件版本。

## 验证

- 22项Node检查通过，含非法URL、尾注失败保护、节目标和范围schema。
- extended-smoke.mjs实际22步命令通过，包括页面参数、表格拆分/标题行与撤销、底色、字体、脚注、批注、目录、修订。另实际验证接受/拒绝全部修订、可见页边距表单提交、查找25处、工具栏模式、窄屏。
- verify-extended.py检查原生DOCX的A4/纵向/页边距21mm/单栏/页眉页脚距离、脚注正文和引用、批注、上下标、TOC域和超链接、表格底色、分页符、ins/del、处理修订后的正文与25处替换。全部XML可解析。
- 原有浏览器自动保存、409冲突保稿/不循环重试、保存下载重开通过；verify-docx.py检查原A3双栏、页眉页脚、图片和列表保留。
- 构建通过。缩放及脚注布局仍有ResizeObserver通知循环、Footnote reserve capped日志，不宣称完全无告警。目录和脚注的Word精确分页未实测，不能声称与桌面Word一致。

运行（web-demo内）：

    node --test design/office-parallel-20261108/word/commands.test.mjs design/office-parallel-20261108/word/extended.test.mjs design/office-editor/document-store.test.mjs design/office-editor/api.test.mjs
    node design/office-parallel-20261108/word/extended-smoke.mjs
    <带lxml的Python> design/office-parallel-20261108/word/verify-extended.py

## 尚未实现及失败证据

尾注API返回success但导出丢失endnoteReference及正文，因此删除了入口，命令主动拒绝尾注。测试失败曾保留在本轮记录，不当作成功。未实现云协作/会员/腾讯AI、自动页码、完整页眉页脚正文工具、水印、公式、书签，以及腾讯所有高级排版/审阅能力。表格合并与全屏调用已接内核/浏览器，未逐种复杂单元格组合或浏览器环境测试。

## 主对话接线

共享MCP文件本树未改。在此前WORD_COMMAND_ARGUMENTS接线基础上，从office-word-extended-schema.js导入EXTENDED_COMMAND_ARGUMENTS并追加对象展开。新增命令列表见该文件；sectionId从office.read().sections读取。仍需主对话MCP端到端集成验收。前端新增office-word-extended.js和office-word-workspace.js，已纳入Vite构建。

未提交、推送、部署、改正式项目库或覆盖用户文档。此前仅三个页签的边界由本文覆盖。
