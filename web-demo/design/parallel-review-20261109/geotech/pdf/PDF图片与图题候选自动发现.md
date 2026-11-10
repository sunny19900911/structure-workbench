# PDF图片与图题候选自动发现

source_id: QA-PDF-FIGURE-DISCOVERY-20261110-R108。

新增discover-pdf-figures.py，从原PDF的栅格图像框和已有原生图题发现候选，不读取人工裁框答案。对竖向相邻且横向重叠充分的图片区域提出组合，解决地图和图例分成两个图像对象的情况。只在图题与图片组一一对应时生成candidate；缺少图题、多重对应、越界、旋转页和接近整页的扫描图保留待处理或排除原因。不改图片，不据图片猜参数。

## 实测

- 曲靖27页原PDF自动发现2组、共3个栅格区域。构造分区图为单区域，活动断裂图为地图＋图例两区域。与第106轮已目视核验的裁框比对，差异小于0.001 PDF点，图题也逐一一致。脚本输入没有人工裁框。
- 启东11页当前PDF无栅格图像对象，输出0候选。这不能证明没有矢量图。
- 海南12页包含61个栅格图像区域，没有满足本规则的唯一原生图题对应，全部保留为unassigned，未擅自作为地质图加入正文。未逐一目视判定其内容，不能将它们称为61幅遗漏工程图。
- 5项测试通过，覆盖地图与图例组合、左右两图不合并、多图题歧义、整页扫描、旋转/越界、远距图题及正文“参见图”不匹配。

CLI对原PDF重算SHA256并校验页数/顺序。证据在goal-round108：figures.json、checks.json、qidong.json、hainan.json和cross-report-inventory.json。未更改三份原件或正式项目。

## 使用与限制

`python discover-pdf-figures.py <native-report.json> <output.json>`，需项目已使用的pdfplumber运行环境。输出visuallyReviewed=false、automaticAdoption=false，不能直接冒充第105轮要求的已核验补充；它只减少找图、定位和组合的手工工作。仍未自动生成裁图、处理矢量图、OCR图题、旋转坐标或接入正式上传按钮。图题距图像、区域相邻和重叠阈值仅是保守候选规则，不是语义识别证明。
