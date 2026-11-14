param([switch]$Manager)
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
 # The service entry point owns discovery, identity checks and the per-data-root lock.
 $env:WORKBENCH_PORTABLE_DATA = $dataDir
 $logId = [Guid]::NewGuid().ToString('N')
 $stdout = Join-Path $dataDir ("启动-$logId.log")
 $stderr = Join-Path $dataDir ("启动错误-$logId.log")
 $mode = if ($Manager) { '--manager' } else { '--open' }
 $process = Start-Process -FilePath $nodePath -ArgumentList "`"$entryPath`" $mode" -WorkingDirectory $installDir -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
 $deadline = [DateTime]::UtcNow.AddSeconds(60)
 $ready = $false
 while ([DateTime]::UtcNow -lt $deadline) {
  $process.Refresh()
  if ($process.HasExited) {
   if ($process.ExitCode -ne 0) { throw "启动失败，请查看：`n$stderr" }
   $ready = $true; break
  }
  if ((Test-Path -LiteralPath $stdout) -and [IO.File]::ReadAllText($stdout).Contains('本地工作台已启动')) { $ready = $true; break }
  Start-Sleep -Milliseconds 300
 }
 if (!$ready) { throw "启动尚未就绪，请查看：`n$stdout`n$stderr" }

} catch {
 [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'结构工作台启动提示',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
 exit 1
}
