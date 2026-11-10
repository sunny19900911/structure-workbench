# PDF零宽标记字体杂字隔离

source_id: QA-JIANGNAN-ZERO-WIDTH-MARKERS-R129（实测事实）。

江南自动稿出现2B2B。检查原PDF全部对应位置：0B0B在第3页、1B1B在第6页、2B2B及3B3B在第8页；四处原页裁图目视只显示章节标题，不显示这些字串。字符均使用FPJMGL+ZWAdobeF字体、约1.02pt、advance为0、x0=x1，四字符各叠在同一点。PDF字体资源也登记零宽。没有按字符串重复或英数字形式直接删除。

extract-native-report.py只排除已识别ZWAdobeF（允许六位子集前缀）且字号0～2pt、advance=0、边界宽度0的字符。普通字体、非零宽度、正常字号及缺失几何的字符保留。排除字符的原文、字体、字号、原页坐标与原因保存在excludedNonprintingGlyphs，经来源适配器进入pdfReadReport，原PDF未改。

49页重读后仅少4个标记段、共16字符，其余1207段与去掉明确标记后的旧来源逐项一致，41个来源表完全一致。自动稿除了这些标记外完全一致。11项Python读取测试及14项Node来源/上传/图片测试通过。fontTools检查尝试因本机缺少模块未执行；未新增依赖，结果依据原页渲染、PDF资源及字符几何，不声称完成任意字体的轮廓识别。

5444实验包实际导入、保存、回读、Word下载通过，原件哈希不变。DOCX17表209文本块与导出包一致，0单元格差异、0缺失文本。Word渲染10页，所有页文本不含上述四组标记，第6页目视确认水文标题后的2B2B已消失。其他短尾断行、长表文字化和扫描内容仍未完成。

证据：web-demo/qa/parallel-review-20261109/geotech/goal-round129/ 下source-7.png、source-108.png、source-154.png、source-165.png、checks.json、python-tests.log、node-tests.log、source.json、ui、verify、render-checks.json、export-page-6.png。没有重新评分正确终稿，不把本轮清除杂字称为参数准确率提高；未接入正式PDF上传。
