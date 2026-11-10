# PDF原图与图题接入验证

source_id: QA-PDF-SOURCE-IMAGE-20261110-R105。原PDF：CURRENT-geo-92c6587bb732952e4e46。

曲靖①号地块第6页混合图文页的活动断裂图题已在第87轮恢复，但nativeReportSource仍始终生成空images。本轮增加可选imageSupplement接口，把明确核验的原页裁图接入来源图片契约，随后复用既有章节图片定位。

新增attach-native-images.mjs校验同PDF哈希、页码、原页坐标范围、唯一同页原生图题、人工核验标记、PNG标识/尺寸/字节哈希和唯一图片ID；整批校验后才写入。当前拒绝旋转归一页，避免混用两种坐标。保留PDF哈希、物理页码、裁框、图题及图片哈希；图片不是OCR参数，不清除原有OCR待复核状态。

## 实际验证

从只读原PDF第6页右侧两个图像区域（地图及图例）的联合范围裁取984×1158 PNG，原页框为[661.2,101.04,1152.84,679.56]，单位为PDF点，原点左上。原图及图例已目视检查；这幅图是原报告本就采用的地图截图，不是完整省域地图。没有重绘图内文字或线条。

图题“附图2：云南省活动断裂分布图（截图）”在当前原文唯一定位，来源段落193，成功进入章节4.4.5断裂带。接入前后正文段落、表格及OCR待复核状态完全一致。1幅图片已放置、0幅待定；未声称本页左侧构造分区图或整份报告图片全部完成。

9项相关Node测试通过，覆盖图题锚点、不变输入及原文字表、跨PDF/错页/越界/未核验拒绝、图片字节哈希、重复图题/ID拒绝以及既有图片章节定位。QA证据位于goal-round105：fault-map.png、image-supplement.json、source.json、document.json、checks.json。draft文件保留未核验版本；原件哈希在裁取前核验一致。

## 调用与边界

`nativeReportSource(report,{expectedHash,imageSupplement})`接受可选补充。imageSupplement.schemaVersion为1，sourcePDFSha256须匹配，images项含id/page/bbox/coordinateSpace/caption/data/imageSha256/visuallyReviewed。该接口是显式原图补充，不是自动图文版面识别。data仅支持内嵌PNG，单图上限16MiB。

仍未接入正式上传按钮、readNativePdfUpload自动调度或共享导出。此次验证到来源及章节数据，未生成新的DOCX或验证分页；不能声称实际Word已经带图。下一步应沿现有专项原生文档输出验证图片字节和实际版面，并扩展图像候选发现与旋转坐标处理。
