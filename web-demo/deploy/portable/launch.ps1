$ErrorActionPreference = 'Stop'
$installDir = [IO.Path]::GetFullPath($PSScriptRoot)
$nodePath = Join-Path $installDir 'runtime\node\node.exe'
$entryPath = Join-Path $installDir 'app\deploy\portable\start.mjs'
$dataFolder = 'StructureWorkbench'
$dataFolderFile = Join-Path $installDir 'data-folder.txt'
if (Test-Path -LiteralPath $dataFolderFile) { $dataFolder = [IO.File]::ReadAllText($dataFolderFile).Trim(); if ($dataFolder -notmatch '^[A-Za-z][A-Za-z0-9_-]{0,60}$') { throw '本机数据目录设置无效' } }
$dataDir = if ($env:WORKBENCH_PORTABLE_DATA) { [IO.Path]::GetFullPath($env:WORKBENCH_PORTABLE_DATA) } else { Join-Path $env:LOCALAPPDATA $dataFolder }
Add-Type -AssemblyName System.Windows.Forms
try {
 if (!(Test-Path -LiteralPath $nodePath) -or !(Test-Path -LiteralPath $entryPath)) { throw '请先将压缩包完整解压，再双击“启动工作台”。不要在压缩软件内直接打开。' }
 [IO.Directory]::CreateDirectory($dataDir) | Out-Null
 $manifest = Get-Content -LiteralPath (Join-Path $installDir '发行版本.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 $chosen = $null
 for ($port = 58720; $port -lt 58740; $port++) {
  $url = "http://127.0.0.1:$port"
  try {
   $health = Invoke-RestMethod -Uri "$url/api/portable/health" -TimeoutSec 1
   if ($health.app -eq 'structure-workbench-portable' -and $health.version -eq $manifest.version -and $health.dataRoot -eq $dataDir) { Start-Process "$url/workbuddy-integrated-studio.html"; exit 0 }
   if ($health.app -eq 'structure-workbench-portable' -and $health.dataRoot -eq $dataDir) { throw '已有其他版本工作台正在运行。请先保存并重启电脑，再启动新版；项目数据会保留。' }
  } catch {
   if ($_.Exception.Message -like '已有其他版本*') { throw }
  }
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (!$listener) { $chosen = $port; break }
 }
 if (!$chosen) { throw '未找到可用的本机端口，请重启电脑后再试。' }
 $stdout = Join-Path $dataDir '启动.log'
 $stderr = Join-Path $dataDir '启动错误.log'
 $process = Start-Process -FilePath $nodePath -ArgumentList "`"$entryPath`" --port $chosen" -WorkingDirectory $installDir -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
 for ($i=0; $i -lt 100; $i++) {
  Start-Sleep -Milliseconds 500
  if ($process.HasExited) { throw "启动失败。请查看本机目录中的 启动错误.log：`n$dataDir" }
  try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$chosen/api/portable/health" -TimeoutSec 1; if ($health.app -eq 'structure-workbench-portable') { Start-Process "http://127.0.0.1:$chosen/workbuddy-integrated-studio.html"; exit 0 } } catch {}
 }
 throw '启动时间较长。请稍后再次双击启动器；已有项目不会被覆盖。'
} catch {
 [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'结构工作台启动提示',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
 exit 1
}
