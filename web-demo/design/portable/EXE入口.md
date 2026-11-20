# EXE 启动入口（2026-11-16）

source_id: USER-EXE-LAUNCHER-20261116（用户要求制作EXE，另一台Windows10故障随后提供诊断）。

主入口为包根目录“结构工作台.exe”。C# WinForms / .NET Framework 4 系列，普通用户权限，无安装服务、不要求管理员权限。构建使用系统 csc.exe，不引入新的下载组件；尚未代码签名。

## 启动链

`结构工作台.exe → 随包 runtime/node/node.exe → launcher-host.mjs → 原 start.mjs`

EXE 从自身目录找组件，立即显示状态。短生命周期 host 启动 detached 后台，日志直接连接文件；通过原服务管道及 HTTP health 验证 dataRoot、version、PID 和 instanceId。后台持有原单服务锁，重复点击不创建第二份项目库服务。就绪结果用临时 JSON 原子写回；不以日志文本判断 EXE 启动成功，不依赖后台输出管道存活。

成功后 EXE 打开已验证的本机网页；失败显示原因、重试、复制诊断、打开日志目录。关闭启动器不停止后台。诊断只含启动信息和路径，不读取偏好文件或环境变量列表。

旧 CMD/VBS 优先打开 EXE。launch.ps1 保留小黑箱及缺 EXE 时的兼容分支，对进行中的日志使用共享读取；临时文件占用不再直接使启动器失败。

## 构建与验证

在 web-demo 中：

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File deploy/portable/build-launcher.ps1 -OutputDirectory outputs/launcher-20261116/build
node --test design/portable/launcher-exe.test.mjs design/portable/complete-delivery.test.mjs design/portable/runtime.test.mjs design/portable/listen-local.test.mjs design/portable/seed-template.test.mjs
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File design/portable/launcher-legacy-check.ps1
```

14项测试通过：包含实际编译EXE调用随包Node、中文空格路径、后台在host及EXE结束后仍存活、并发重复启动复用、缺文件和后台异常可诊断；其余为相关存储/端口/MCP保护回归。单独共享读取回归复现旧 ReadAllText 报错并验证替代代码通过。夹具是最小测试后台，不冒充完整业务运行。

`launcher-ui-check.cs` 用实际 WinForms 控件生成加载、成功、失败三态图并检查控件越界；图片在 outputs/launcher-20261116/ui。未进行用户真实项目或新包解压运行验收，未在另一台 Windows 10 实测，保留用户手工验收安排。

## 本次包

结构工作台完整包-EXE入口-默认A-20261116-R2.zip，365767100字节。
SHA256：b630e956a005b500c1d970e90ab17a176d092003e3bd8af13e895f423e7b7dc6。

基于此前R1归档（SHA c963982db51ddfdda5e80a0933cdcc554a7029a0708a1fd966a64f575ab5e264），11152个原内容成员逐项核对后覆盖启动器相关文件；新包11159成员全部CRC/哈希通过。默认A内包哈希未变，业务源码、网页构建及随包运行时沿用R1。后台版本仍为2026.11.15-default-a.1，启动器版本单列2026.11.16.1，允许复用同版本已就绪后台。

完整复包脚本、测试输出与归档记录在 outputs/launcher-20261116。通用 deploy/portable/package.py 已接入EXE编译。旧包、用户项目及58727/5488现有服务未改动，源码未提交或推送。
