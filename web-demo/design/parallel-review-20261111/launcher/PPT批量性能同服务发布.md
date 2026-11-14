# PPT批量性能同服务发布

source_id: USER-PPT-BATCH-STATIC-20261111。UI性能专项冻结后，启动专项把补丁同步至当前58727服务使用的App。人工数据根及服务实例保持。

## 打开新页面

[修后项目页面](http://127.0.0.1:58727/workbuddy-integrated-studio.html?project=2a1ccf080c3e4b5f9d795e4e7b357b82&ppt_update=20261111-224646)

新页使用现有项目ID和原人工库。原页面的内存、上传状态仍未知，需要保留其内容。新页会读取已经保存的图片，可按需重新选择本批文件。主控和用户需核对旧页尚未保存的操作，避免在两页同时保存同一PPT。

自动执行审核拒绝了通过explorer.exe打开该URL，返回blocked by policy。新页需要点击上方链接打开，本专项未自动刷新或关闭用户标签。

## 运行身份

| 项目 | 核对结果 |
|---|---|
| 服务 | `http://127.0.0.1:58727` |
| 实例 | `74763222-f16e-4dcd-bd7a-009018372f93` |
| PID | `61404` |
| 后台版本 | `2026.11.11-ui-out.1` |
| 前端发布标识 | `ppt-performance-20261111-224646` |
| 标识读取 | `http://127.0.0.1:58727/frontend-update.json` |
| App | `outputs/portable/结构工作台-网页修复-20261111-220948/app` |
| 人工数据根 | `qa/portable-release/launcher-20261111/ui-update-20261111-220948/已保存数据副本` |

静态路由每次按请求读取dist文件，并返回no-store。发布前核对server运行代码与主源码一致。后台继续使用原实例，客户端连接配置沿用当前同库配置。

## 发布过程

Vite使用独立输出 `qa/portable-release/launcher-20261111/ppt-static-20261111-224646/dist`，源工作区dist及运行目录在构建过程中保持原样。构建前后前端源码hash一致。

更新20项App文件，包含编译资源、PPT入口、已有非hash静态脚本及App对应前端源码，新增ppt-draft.js。已有变更文件先复制到 `original-app-backup`。发布采用临时文件原子替换，脚本资源先就绪，HTML入口最后切换。此前hash资源继续保留，原页面可以使用原先载入的代码。

发布于2026-11-11 22:47:10（Asia/Shanghai）。逐文件原hash、新hash及顺序见 `plan.json` 和 `publication.json`。实际HTTP返回的11项更新JS均与构建hash一致。源HTML的运行时注入由既有portableHTML处理。

## 编译输出验证

使用5483独立预览库验证本次编译输出，复制了该项目的保存状态。实际用户数据没有承载压力实验。

- 33张经开原图首次上传约1050毫秒，保存响应成功。
- 同批重复上传约413毫秒，图片数保持，未增加保存请求。
- 刷新后图片数量恢复，页面无JS错误。
- 隔离库实际保存38张图片，为原存5张加本次33张压力图片。界面67行包含空图位和待放置项。
- 用户人工库在22:48:23只读核对仍为PPT revision1，保存时间22:17:42，5张图片。根节点与当前单体的旧版重复表示均为5，尚不能据此判断旧页面内存或上传情况。

当前5张是江南媒体楼图片。33张经开是压力测试集，用户当时选择文件数量仍未知。UI专项另行记录5/6张江南图片、原图字节、真实409、网络失败、单体隔离及PPTX导出验证，本专项此次覆盖编译输出的33图、重复与读回。

## 证据位置

本段路径均位于 `C:/Users/mj528/Documents/004 工作/web-demo/qa/portable-release/launcher-20261111/ppt-static-20261111-224646/`。

- `plan.json`及`original-app-backup/`保存发布前文件与hash。
- `publication.json`记录实际写入顺序和发布时间。
- `compiled-33-images.json`记录独立编译版上传、重复、读回及保存响应。
- `compiled-33-images.png`为实际UI截图，启动专项已查看，图片面板显示已载入38张。
- `live-verification.json`核对实例、数据根、HTTP文件hash、人工库5张与隔离库38张。

发布脚本为本专项目录 `static-ppt-update.py`，编译预览与浏览器验证分别为 `static-ppt-preview.mjs`、`static-ppt-check.mjs`。原服务和人工库由现有启动锁继续管理。
