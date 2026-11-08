# Excel 独立扩展接线与验收

source_id: USER-OFFICE-PARALLEL-20261108（用户要求，原文事实）。

## 腾讯表格参考增量

source_id: USER-TENCENT-EXCEL-REA-20261108。以用户提供链接经 REA 观察的真实菜单为参考，采用“开始、插入、数据、公式、视图”五页签及双层工具栏。观察事实、证据 ID 和禁用操作的边界见 `tencent-reference.md`。

- 开始：格式刷、字体字号、粗斜体/下划线/删除线、字色底色、边框、表格配色、条件格式、对齐、换行、合并、数字格式、排序筛选、冻结、求和、保护、查找替换和打印。
- 插入/数据/公式/视图按任务分组，只提供实际接线的操作。页签切换、显示比例、网格线、零值、行列高亮、深色和显示公式是本窗口设置，不伪称保存为原生文件设置。
- 常用编辑保留公式栏、TSV、键盘、撤销/重做及本机不可变版本。所有文件写入使用同一后端 command。

## 总集成接线（本树不改共享文件）

1. `office-editor.js` 在 XLSX 分支动态导入 `./office-excel-editor.js`，调用 `mountExcelEditor({element,document:metadata,view,onSaved})`，返回控制器赋给原 `controller`。PPT 保留原实现。新模块自己导入 CSS。传入的 view 必须由下述新版 inspect 生成。
2. 在 Vite/离线/测试服务创建 `officeDocumentApi(env)` 的位置，导入 `inspectWithExcel, editWithExcel`（`server/office-excel-package.mjs`），改为 `officeDocumentApi(env,{inspect:inspectWithExcel,edit:editWithExcel})`。不要另建保存路由或项目库。每次命令仍由现有 `/command` 检查 expectedRevision 并保存不可变版本；下载沿用 `/content`。
3. 在 `mcp-browser-operations.js` 导入 `EXCEL_COMMAND_SCHEMAS`（`./office-excel-commands.js`），在声明 `OFFICE_COMMAND_ARGUMENTS` 之后、生成 `officeCommandSchema` 之前执行 `Object.assign(OFFICE_COMMAND_ARGUMENTS, EXCEL_COMMAND_SCHEMAS)`。现有代码会据此生成 name.enum 和各命令的条件 args schema。cell.set 用本模块定义替换，Word/PPT 其他命令保留。前端控制器 `executeCommand({name,args,expectedRevision})` 是 UI / MCP 共用入口，包含选区、切表、撤销重做。原 office.read 返回控制器 read 内容即可。更新命令描述，避免仍称“仅 Excel 单元格”。
4. 便携包白名单添加前端 `office-excel-editor.js/css`、`office-excel-ribbon.js`、`office-excel-commands.js` 与后端 `office-excel-package.mjs`、`office-excel-package.py`、`office-excel-formulas.py`、`office-excel-formatting.py`、`office-excel-data.py`。无需新增依赖，复用已有 Python、lxml、openpyxl。
5. 主对话统一合并和构建、注册 MCP schema 后，再在真实集成入口验收。当前树不改运行包、不操作真实项目、不推送、不合并。

## 能力边界

支持普通 A1 引用、绝对/混合引用、跨表引用、矩形范围、四则/幂/百分比/比较/连接、SUM/AVERAGE/MIN/MAX/COUNT/IF。IF 分支惰性求值。重算全工作簿依赖；支持公式与布尔/文字结果。无网络、宏或 eval。

不支持的函数、名称、外链、共享/数组公式、超限依赖显示具体单元格与原因，清除缓存但保留公式；计算错误写入原生 Excel 错误值。读取时计算仅在内存，不保存；`formula` 为原公式，`cachedValue` 是磁盘原缓存，`calculatedValue/value` 为本次重算值，`calculationStatus` 标明结果状态。保存时刷新缓存并要求 Excel 打开后复算。

结构调整只对普通工作簿开放。含命名/打印区域、合并区域、冻结窗格、表格、图表、数据验证、条件格式、共享/数组公式或外链等会明确拒绝，避免错改引用。普通列宽/列样式定义随列增删移动。普通单元格输入仍可保留这些未改部件；受保护表拒绝修改。网页显示基础字体、颜色、边框、对齐、换行、合并、常用数字条件格式、行列尺寸、筛选隐藏与当前分页内冻结；不完整绘制图表、主题字体或复杂格式。保护只允许创建/解除本地无密码保护，已有密码保护不可绕过。排序暂拒绝任何含公式的工作簿，避免悄然改变引用。筛选只修改受本编辑器管理的范围，恢复原人工隐藏状态。

限制：工作簿 40000 个已存单元格、选区/范围 10000 格、公式引用访问 200000 次、依赖深度 150、公式标记 512。界面分页显示，不把视窗外数据删除。不承诺完整 Office 计算或渲染兼容。

## 保存、撤销与调用

- 输入停顿 700 ms 自动保存，Enter/失焦立即保存。保存期间锁定编辑，完成后恢复输入位置；失败保留本地输入。不自动重放版本冲突。
- `save()` 等待进行中的业务命令，下载可复用外层 `await controller.save()`，避免拿到命令完成前的旧版本。`onSaved` 在服务端确认后更新外层 metadata。
- 撤销/重做复用不可变文档历史和 `/save?expectedRevision=`，把历史字节保存为新版本，不删除历史。当前窗口保留最近 30 步操作栈；重开后操作栈不恢复，历史文件仍可通过原版本接口查询。
- `range.set` 接收矩形二维**字符串**数组，`cells.set` 接收含 `address/expectedText/text` 的数组；批量操作在内存完整成功后才保存一个版本。复制 `range.copy` 会调整相对/混合引用；系统剪贴板跨应用以 TSV 交换显示值，当前窗口内复制粘贴保留公式与样式。
- 单元格支持直接键入、双击/F2 编辑、Enter/Tab、方向键、Shift 选区、鼠标拖选、Ctrl/Cmd+C/V、Delete、Ctrl/Cmd+Z/Y、Ctrl/Cmd+S。地址栏可跳至视窗之外，分页每次显示 80 行 × 16 列。
- `sheet.select/selection.set/selection.copy` 为同一控制器的视图命令，不创建文件版本。`history.undo/redo` 仍需当前文件修订，其他文件写入走同一后端 `/command`。

示例：先 `office.read`，以其 `document.fileRevision` 调用 `office.command`，name=`range.set`，args=`{"sheet":"荷载","address":"B2","values":[["3.5","100","=B2*C2"]]}`；外层项目 ID、明确单体、expectedRevisions 仍按原 MCP 约定传入。

## 实际验证（2026-11-08）

以下为本工作树隔离测试事实，source_id 为对应测试文件；不等于已发布或已接入主入口。

1. `package.test.py`：13 项通过。原生文件编辑保存重开、常用公式、跨表依赖、IF 空值/惰性分支、复制绝对/相对引用、行列及工作表增删改名、数字格式、原部件保留、原文冲突、保护表、循环引用、数组结果拒绝与清缓存、计算预算耗尽后清除剩余缓存。
2. `browser.test.mjs`：真实 Edge 无头浏览器 + 原 `/api/office-documents` + 原不可变文档库。使用合成教学楼荷载表与用钢量表，输入自动保存后仍能继续打字；TSV 粘贴、格式、复制公式、工作表/行列操作、撤销重做、下载后 openpyxl 同时核对公式与缓存、修订冲突保留输入、刷新重开均通过。页面错误 0，原稿字节未变。
3. `schema.test.mjs`：全部新增 Excel 命令的拟接线 schema 经 AJV 编译和参数校验通过；保留现有 Word 文字及 PPT 移动命令，拒绝缺原文/无效行号/非字符串矩阵。**尚未改共享 MCP 注册，不能说真实 STDIO 已支持这些新增命令。**
4. 原有 `design/office-editor/package.test.py` 6 项通过。新 JS `node --check` 通过，新 Excel JS/CSS 使用已有 Vite 8.3.0 依赖独立 library build 通过。
5. 本树没有 `package-lock.json` 和 node_modules，`npm ci` 因缺锁文件失败；未生成锁文件或修改依赖声明。浏览器测试使用已有 Playwright；AJV/独立 Vite 打包只读复用主工作区已安装依赖。**未运行完整主入口 npm build**；该项应在统一接线后执行。

命令（在 web-demo 下；Python 路径可用 WORKBENCH_PYTHON 指定）：

```powershell
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" design/office-parallel-20261108/excel/package.test.py
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" design/office-editor/package.test.py
# 已安装本项目依赖时不必设置下一项；本次只读借用已安装的 AJV。
$env:WORKBENCH_AJV_ENTRY='C:/Users/mj528/Documents/004 工作/web-demo/node_modules/ajv/dist/ajv.js'
node --test design/office-parallel-20261108/excel/schema.test.mjs design/office-parallel-20261108/excel/browser.test.mjs
```

所有实际测试成果限 `web-demo/qa/portable-release/mcp/office-excel/acceptance-*`（忽略目录），含修改前后 XLSX、截图、验收 JSON 与不可变历史。测试服务使用系统分配的空闲端口，只在测试内启停，没有停启用户现有服务。未使用实际工程资料，未写真实项目库，未提交、推送、合并或更新运行包。已应用 REA 与 project-skill-memory；技能记录暂存本专项 skills/，公共技能索引留总集成汇总。

## 腾讯参考增量验收

source_id: 本目录 `formatting.test.py`、`data.test.py`、`browser.test.mjs`、`schema.test.mjs`（实际执行结果）。

- 原生测试：package 13、data 10、formatting 8，共 31 项通过。
- 浏览器/API 集成新增：按钮加粗、字色/边框、条件填充、合并拆分、列宽、行高、筛选隐藏/恢复、视图页签、网格线、冻结、查找、纯文字替换及保护/解除通过，页面错误 0。截图与工作簿位于忽略的 `qa/portable-release/mcp/office-excel/acceptance-d4sw8g/`。
- AJV 所有命令及拒绝案例通过；独立 Vite library build 通过。完整主入口仍待总集成接线验收。
- 修复 Node 包装层 `return readFile(...)` 的 finally 提前删除竞争，改成 `return await readFile(...)` 后才清理自己生成的临时文件。
- 本轮预览 `http://127.0.0.1:52303/excel-preview`，PID 54828，仅测试库 `qa/portable-release/mcp/office-excel/tencent-preview-20261108`。旧预览和其他服务未停止。
- 打印为本地 HTML 全部已用矩形（最多 10000 格），不等于 Excel 的页眉页脚、打印范围或分页；复杂格式以下载 XLSX 为准。图表/透视表、数据验证、云协作、会员工具及完整函数库未实现，未展示可误解为已实现的按钮。
