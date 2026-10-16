# 宝塔计算书与 PDF 修复

source_id: USER-20261015-CALCULATION-PDF（用户要求，原文事实）。主工作区增量，不操作正式项目数据或自动部署。

## 问题与改动

- 网站后端无法读取访问者电脑的 E 盘路径。新增“选择本机文件夹”，浏览器筛选四类目录中的 PDF 后逐份上传，DWG、无关文件和禁止归档不上传；仍支持服务器绝对路径扫描。允许从模型根目录寻找嵌套单体。
- “合并导出 PDF”按荷载校核、上部、基础、施工图分组，再按相对文件名自然排序，合并原始页，保留纸张尺寸。不是调用盈建科重新计算，也不把 PDF 自动塞进 A3 Word。单份上传64MB、一次200份、合并总量512MB；认证、同源和文件授权校验保留。
- PDF 上传副本在 `WORKBENCH_DATABASE_ROOT/calculation-uploads/<projectId>/<batch>`（可用 `CALCBOOK_UPLOAD_DIR` 调整）；main.calculation.pdfSources 仍存路径和清单，不将大文件写入 JSON。此目录需随数据一起备份。上传失败产生的未完成批次保留，不自动清理历史文件。跨电脑预览需重新读取，导出自动刷新临时授权；文件清单变化时要求重新查看后再导出。
- A3 Word 生成原来错误地要求外部封面、目录、穿层柱文件全部存在。改为使用包内已转换封面和当前编辑目录；缺少外部 Excel 不影响封面、目录、OUT。按钮不再无提示禁用，保留人工确认，失败显示原因。移除生成副本中的历史签章及封面图片，原母件不变。
- Linux合并使用已有Poppler的pdfunite，Windows使用本机文档Python的pypdf。原PDF下载、页预览和网页API均由打包器转换到 `/work/api/`。

## 验证

隔离服务5198、隔离项目库 `qa/calculation-release/store`。浏览器实际选择文件夹上传四类PDF，预览和合并下载成功；核对4页文本、顺序及A4竖版/A3横版/A4横版尺寸。服务器无外部母件目录情况下，Word按钮给出未确认反馈，确认后成功生成封面及完整27条目录。PDF渲染与Word原生渲染用于视觉核对。

```text
node --test design/project-integration/calculation-pdfs.test.mjs design/project-integration/calculation-deployment.test.mjs deploy/baota/http-app.test.mjs
<文档Python> design/project-integration/calculation-builder.test.py
python deploy/baota/update.test.py
npm run build
python deploy/baota/package.py --base-path /work/ --proxy-strips-prefix --guide 计算书更新说明.md --name structure-workbench-work-calculation-20261015.zip
```

未连接真实宝塔服务器，不声称已上线。Linux的pdfunite需要在服务器验收；当前真实合并验证在Windows完成。未引入新的Linux Python依赖。
