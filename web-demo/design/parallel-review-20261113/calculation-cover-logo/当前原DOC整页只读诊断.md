# 当前原DOC与最新live完整封面对照

source_id为USER-CALCULATION-COVER-CURRENT-DOC-20261113。本轮仅重新读取、导出合成QA和诊断，没有修改生产Python、母件或运行包，也没有写用户项目库。

当前E:/!!!!!!!!TO HOME/QS-324 计算书封面（行政审定不用签字）.DOC长度71680字节，修改时间2026-11-12 21:08:15.848（Asia/Shanghai），SHA256仍为FAC7D691FCD6D7BD5447B4DCF46B710199D1E5893011D1296CA3E26EE98FF401，前后相同。内容没有替换。

本轮将当前DOC复制到隔离QA后以Word禁宏、禁自动更新链接、只读打开，直接ExportAsFixedFormat输出完整PDF，没有经过DOCX转换。原件本身一页A3横向，Word原生PageWidth1190.55pt、PageHeight841.90pt，TextColumns.Count=2，装订边28.35pt，五张原生表格。第五表一行两格，左格含一个内联图标图片，右格是可编辑的中英文机构文字。底部完整图文不是单独的一张整图。

最新live由58727实际导出，空company合成输入，输出Word渲染5页。底部原机构图文完整。当前文档三个节均单栏。原件的双栏与用户后来明确的单栏要求存在属性差异，已用封面右边距保留原左侧视觉区域，不能同时宣称与原DOC节设置逐字节一致。

完整封面图同尺寸并排，左为当前原DOC直接Word渲染，右为最新58727合成QA导出。路径为qa/portable-release/calculation-cover-logo-20261113/full-source-live-compare/原DOC直接渲染与最新live完整封面对照.png。单独完整图为original-full-cover.png与live-full-cover.png，原始PDF和完整测量在同目录。

标题bbox两者相同，为[262.58,80.336,407.09,116.336]pt。图标原DOC bbox为[135.60,713.65,182.90,760.90]pt，最新live为[135.95,713.75,182.90,760.70]pt。中文及英文机构文字水平位置相同，纵向上移0.24pt。标签字位最大差0.12pt。以上均为既有DOC转DOCX的亚点级差异，最大0.35pt约0.12mm，未见整块新增水平或垂直位移。

完整视觉差异主要是当前项目编号/名称/阶段/单体/软件值、签字空白、历史日期/版本值清空，以及用户已要求的单栏属性转换。此次不提出Logo位置代码修改，也不新增位置冻结。若用户指向的仍是其他Word或屏幕布局，需由根展示这张整页对照后精确核对目标，避免继续猜移。

后台Word读取的视图为打印版式（View.Type=3），Zoom60%，PageFit0，PageColumns/PageRows返回99。这是本轮后台Word窗口状态，不能据此判断用户自己窗口是否正在并排显示。PDF第一页是一个完整A3页，对照也按一张原件页和一张live封面页制作。

诊断脚本为current-source-audit.ps1和compare-full-pages.py。测量JSON为同QA目录full-page-comparison.json。此次没有核实新的产品偏差，因此不重复写Bug或技能成功日志。
