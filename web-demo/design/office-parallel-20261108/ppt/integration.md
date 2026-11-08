# PPT 工作树集成清单

source_id: USER-OFFICE-PARALLEL-20261108（原文事实：独立模块交付、共享文件交由主对话接线）。

基线 `9265f94`；本树分支 `codex/office-ppt-20261108`。代码目前为未提交新增文件，没有修改共享入口、现有服务、正式项目或其他工作树。没有执行 commit / push / merge / 发布。

## 文件与接线

1. `office-editor.js`：保留 Word 和 Excel 分支。读取非 Word 的 `/view` 后，PPT 使用下面的模块，其他类型沿用 Excel 组的模块。原 `metadata`、`onSaved`、保存和下载回调不变。

```js
const mount = metadata.type === 'pptx'
  ? (await import('./office-ppt-editor.js')).mountPptEditor
  : (await import('./office-simple-editors.js')).mountSimpleEditor;
controller = await mount({
  element: $('office-editor'), document: metadata, view,
  onSaved: next => {
    metadata = next; title();
    status('已保存到本机 · 版本 ' + metadata.fileRevision);
    notifySaved();
  }
});
```

在 `office-editor.js` 加 `import './office-ppt-editor.css';`，或在编辑器 HTML 加 stylesheet link，让 Vite 正式构建包含样式。不要同时挂载旧 `mountSimpleEditor` 的 PPT 分支。

2. HTTP：`office-document-api.mjs` 已有 `dependencies.inspect/edit`，无需重写共享服务。注册它的调用点（当前离线入口 `deploy/portable/start.mjs` 的 `build()`）注入 PPT 路由器，并注册历史恢复扩展。

```js
import {inspectPptPackage, editPptPackage} from '../../server/office-ppt-package.mjs';
import {officePptHistoryApi} from '../../server/office-ppt-document-api.mjs';
// plugins 中：
officeDocumentApi(config, {inspect: inspectPptPackage, edit: editPptPackage}),
officePptHistoryApi(config),
```

上面两个函数遇到非 PPT 会回落现有 `office-package.mjs`。**与 Excel 组一起集成时，应由总集成显式分流**：PPT 调用本组函数，XLSX 调用 Excel 新函数，其他调用原函数；不能把两个依赖对象后者覆盖前者。开发/验收入口同样注入；已有 QA fixture 展示完整接线。

新后端文件：`server/office-ppt-package.mjs`、`server/office-ppt-package.py`、`server/office-ppt-document-api.mjs`。保留原 `office-package.py`、`document-format.py` 等依赖，扩展直接复用其包校验和读取。Python 用既有运行时的 lxml、Pillow，未新增依赖。

3. MCP：`mcp-browser-operations.js` 在生成 `officeCommandSchema` **之前**导入并合并命令：

```js
import {PPT_COMMAND_ARGUMENTS} from './office-ppt-commands.js';
// 原 OFFICE_COMMAND_ARGUMENTS 声明后、officeCommandSchema 声明前：
Object.assign(OFFICE_COMMAND_ARGUMENTS, PPT_COMMAND_ARGUMENTS);
```

`history.undo` / `history.redo` 沿用已有空参数 schema。本组使用 `ppt.image.insert`，不覆盖 Word 的 `image.insert`，避免 Word 的 targetText、像素宽度和 PPT 的页码、EMU 混用。当前 `ppt.image.insert` 接受 PNG/JPEG data URL；已有 `mcp-tools.mjs` 仅对 Word 的 image.insert 做 filePath 转换，不要误把新命令套进 Word 的转换规则。如总集成另加文件路径便利接口，应限制 1,300,000 bytes 并验证图片魔数，再转换为同一个 data 参数。

当前 MCP `office.command → WorkbenchOffice.command → controller.executeCommand` 调用链不用改；业务命令和按钮共用这个控制器。`office.read` 会返回原生 view、文件修订、dirty、canUndo、canRedo。`office.save` 等待当前保存完成。项目/单体/分区修订校验继续由既有桥接承担。

4. 打包：Vite 从编辑器动态 import 收入 JS/CSS；`deploy/portable/package.py` 会扫描 server 文件。仍需总集成在解压包核对上述三个后端文件、基础 Python 文件、lxml/Pillow 和正式 MCP schema。未自动覆盖当前运行包。

## 命令约定

所有调用携带文件 `expectedRevision`；页码从 1 开始，几何单位 EMU（1 cm = 360000）。UI 显示 cm。读取对象 ID 后操作，不根据名称猜 ID。

| name | args |
|---|---|
| slide.add / slide.duplicate | `{slide}`，插在指定页之后，新建页继承其版式但不复制正文 |
| slide.delete | `{slide}`，至少保留一页 |
| slide.move | `{slide,to}`，to 为移动完成后的页码 |
| shape.addText | `{slide,text,x?,y?,width?,height?}` |
| shape.text | `{slide,shapeId,expectedText,text}`，允许新增段落 |
| shape.geometry | `{slide,shapeId,expectedGeometry:{x,y,width,height},x?,y?,width?,height?}` |
| shape.move | 兼容已有 `{slide,shapeId,expectedX,expectedY,x,y}` |
| shape.format | `{slide,shapeId,fontFace?,fontSize?,bold?,italic?,underline?,color?,align?}`；颜色 #RRGGBB，对齐 l/ctr/r/just |
| shape.delete | `{slide,shapeId}` |
| ppt.image.insert | `{slide,data,x?,y?,width?,height?}`；PNG/JPEG，小于 1.3 MB |
| history.undo / history.redo | `{}`，当前打开会话内；恢复仍生成新版本 |

几何与格式命令不改变工程参数；复制页备注单独复制并修正回链，媒体和版式保留。删除页和删除对象会解除显示引用，ZIP 中不自动清理可能被其他页面使用的部件；版本历史保留完整原件。网络响应不明时不自动重放写入，要求重新读取核对。

## 验证与限制

腾讯界面复刻增量：`createPptRibbon` 已内置在 `office-ppt-editor.js`，无需额外 ribbon 文件。挂载时给 body 添加 `ppt-editor-mounted`，隐藏重复外层 header；销毁时移除。新增基础放映、网格线、缩略图显示和工具栏收起；这些是本机 UI 功能，不代表已支持 PPT 动画或母版编辑。文件栏明确显示本机保存，下载替代云分享。REA 页面证据与浏览器验收见 `腾讯PPT复刻与REA验收.md`。

`office-ppt-package.mjs` 已修复临时输出读取和清理竞态：读取输出完成后才进入 finally 清理，避免返回尚未完成的 readFile Promise 导致 ENOENT。

详见同目录 `设计与验收.md`。新增 4 项 Python 文件测试、2 项 Node HTTP/schema 测试通过，另有 Edge 无头浏览器完整操作测试通过。浏览器真实调用隔离 HTTP 与文件库，不用模拟文件编辑结果；只在失败保留草稿用例中拦截 422。

尚未接到正式工作台/MCP 客户端或分发包，未运行真实 PowerPoint/WPS，不能表述为正式主入口已经升级。表格/图表/组合对象、继承母版坐标、裁剪和主题渲染不完整；含字段或软换行文本不能直接改字。原部件保留，复杂对象需 Office 编辑。没有加入结构结果计算或 AI 自动研判。

撤销/重做栈限当前打开会话；重开后仍可通过原文档历史接口获取文件版本，但不恢复会话栈。输入框中的 Ctrl+Z 保留浏览器文字撤销；画布非文字焦点下 Ctrl+Z / Ctrl+Y 或 Ctrl+Shift+Z 为文件撤销重做。Ctrl+S 保存。文字停顿 1.2 秒自动保存，尺寸/样式/页面操作即时保存。
