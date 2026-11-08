# 结构工作台本地版

source_id: USER-PORTABLE-20261030（小香金猪要求同事解压即用、项目各自保存，并识别 Word、Excel、PPT、PDF 多种格式；原文事实）。

## 使用与数据

Windows 10/11 x64，完整解压后双击 `启动工作台.vbs`，也可用 CMD 启动器。程序自带 Node、Python、Poppler、表格/PDF/OCR 依赖。只监听本机 127.0.0.1；无需安装运行时或网站部署。

数据位于当前 Windows 用户 `%LOCALAPPDATA%/StructureWorkbench`，与软件目录分离。换电脑使用页面的项目包导入/导出；不同 Windows 用户各自保存。`WORKBENCH_PORTABLE_DATA` 只用于指定独立存储，验收必须指向 `web-demo/qa/portable-release/`。

保留统一措施、地方规范、扩充说明、PPT、用钢量、计算书。隐藏重难点和反校核入口，保留扩初中的不规则措施库。仅保留本轮可访问且匹配规范编号/年份的网络链接，网络链接仍需联网，条目本身可离线编辑。

基础整理及导出离线运行。DeepSeek 为主动启用的可选联网功能；仅使用同事自己在本机设置中填写的配置，不读取作者密钥或部署环境。

## 打包

在 `web-demo` 执行：

```powershell
$env:WORKBENCH_PORTABLE_BUILD='1'
npm run build
python deploy/portable/package.py --python-runtime <Python目录> --poppler-runtime <Poppler的Library目录>
```

输出在 `outputs/portable`。打包采用白名单，附版本、依赖来源和 SHA256 文件清单，不含项目数据、QA、密钥。不要直接复制整个工作区交付；不可把服务器版安装脚本用于本地版。

## 验收与边界

运行 `node --test design/portable/*.test.mjs`，以及 `design/project-integration` 的 document-format、portable-projects、portable-calculation-sources 回归；Python 回归为 document-format.test.py、portable-formula-results.test.py 和 `design/portable/word-output.test.py`。

独立发行包启动后，用 `WORKBENCH_SMOKE_PYTHON` 指定文档 Python，运行 `node design/portable/release-smoke.mjs http://127.0.0.1:<端口>`；该脚本拒绝生产存储，仅向 QA 写入。浏览器另外验证中文 DOCX 导入、单体表、PDF 合并及 PPTX 导出。

格式识别与内容导入能力分开报告，详见[文件兼容与准确度](../project-integration/离线版文件兼容与准确度.md)。旧 DOC 转换和精确 Word 分页仍依赖可用的 Microsoft Word；本机 COM 转换未通过，因此不能声称全版本 Office/WPS 已实机验证。PPT 支持格式预检和既有 PPTX 生成，不支持任意历史 PPT 全文导入。扫描 OCR 及结构设计结论仍须复核。

本轮同时修复 DOCX 原始表头在 fragments 链路丢失的问题；真实单表头合成文件验证 5 层、23.70 m、1234.56 ㎡。公式无缓存、错误值、改输入后缓存失效时阻止计算书导出，避免空白或陈旧结果被当作计算值。
