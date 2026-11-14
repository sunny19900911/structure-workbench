# PPT语义匹配静态更新交接

source_id 为 PPT-SEMANTIC-IMAGES-20261114。2026-11-14按UI专项源码清单完成独立编译、隔离库验收及原58727静态原子更新。

生产源码改动为office-ppt-assets.js和single-image-layout.js两项，编译闭包共13项静态文件。共享图片匹配模块使Office PPT编辑器等依赖入口的资源哈希一并更新。源码冻结清单位于相邻ppt-semantic-images目录。原文件和前端发布标记已备份，74个旧哈希资源保留。

运行服务仍为PID144980，instanceId为c1728dcc-6225-492e-a0c0-ddf0aea2173f，App及数据根与此前相同。325个用户项目文件发布前后SHA-256一致，52个server/scripts/assets文件一致，包含计算书Python、母件与PDF后端。本次发布标记为ppt-semantic-20261114-100800。

## 独立编译验证

使用001江南已保存的真实17图、14张待放置、3张已绑定记录的隔离副本。新编译页面读取后，一层、二层、三层、四层和屋顶建筑图恢复到第14至18页，原模型第19页、二层结构第23页和四层结构第25页保持，总8张绑定、9张待放置。五层无图位、CAD分析无楼层、效果图及桩位基础合图保留待放置。来源登记中的组团组合建筑图边界沿用。

隔离浏览器首次读取前后PPT修订均为1。随后正常保存、全新浏览器重开、真实17图重复批量上传、新增单体三层图保存重开均通过，所有图像字节保持，既有图位保持。另一空白QA单体首次整批上传17张真实文件，也得到8已放置、9新增待放置、0重复；原单图单体仍只保留1张，单体隔离通过。

从正常网页生成入口下载jiangnan-semantic-ui.pptx，按presentation关系顺序核对27页。8张已绑定图片在正确页码的嵌入图片SHA-256与实际输入逐一一致。这项属于原生PPTX内容检查，未执行PowerPoint原生渲染。编译网页第16页完整截图为compiled-page16-slide.png，另有完整页面compiled-page16.png，均已查看。

5项语义专项测试通过，覆盖建筑/结构及楼层隔离、空缺/合并/歧义图意、占用不覆盖、新版待放置恢复、多单体及幂等。

## 证据和入口

QA及发布证据位于qa/portable-release/launcher-20261114/ppt-static-20261114-100800，包含plan.json、publication.json、original-app-backup、compiled-semantic.json、fresh-17-verification.json、native-pptx-verification.json、live-publication-verification.json、jiangnan-semantic-ui.pptx及两张第16页截图。隔离编译测试服务已关闭。

最终新页入口为http://127.0.0.1:58727/workbuddy-integrated-studio.html?project=88b5e1bfa98a446f92849ab358d4898d&ui=ppt-semantic-20261114-100800。主对话已完成新标签页最终确认并交付三层建筑图第16页效果，确认8张对应、9张待放置。既有用户调试页面继续保留。

本次复用windows-portable-webapp的同实例静态更新、数据隔离、实际导出重新打开方法，以及non-paper-delivery的正常入口及旧数据恢复验收规则。launcher脚本仅在明确的QA隔离库进行浏览器写入，实际用户库仅只读核对。
