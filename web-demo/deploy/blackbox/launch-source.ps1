$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
 $appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
 $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
 $runtimePath = if ($env:WORKBENCH_SOURCE_RUNTIME) { $env:WORKBENCH_SOURCE_RUNTIME } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies' }
 $dataPath = if ($env:WORKBENCH_PORTABLE_DATA) { [IO.Path]::GetFullPath($env:WORKBENCH_PORTABLE_DATA) } else { Join-Path $env:LOCALAPPDATA 'StructureWorkbenchBlackbox' }
 [IO.Directory]::CreateDirectory($dataPath) | Out-Null
 $env:WORKBENCH_PORTABLE_DATA = $dataPath
 $env:WORKBENCH_SOURCE_MODE = '1'
 $env:WORKBENCH_SOURCE_RUNTIME = $runtimePath
 $entry = Join-Path $appRoot 'deploy/portable/start.mjs'
 $logId = [Guid]::NewGuid().ToString('N')
 $errorLog = Join-Path $dataPath "启动错误-$logId.log"
 $outputLog = Join-Path $dataPath "启动-$logId.log"
 $process = Start-Process -FilePath $nodePath -ArgumentList "`"$entry`" --manager" -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
 $deadline = [DateTime]::UtcNow.AddSeconds(60)
 $ready = $false
 while ([DateTime]::UtcNow -lt $deadline) {
  $process.Refresh()
  if ($process.HasExited) {
   if ($process.ExitCode -ne 0) { throw "启动失败，请查看：$errorLog" }
   $ready = $true
   break
  }
  if ((Test-Path -LiteralPath $outputLog) -and [IO.File]::ReadAllText($outputLog).Contains('本地工作台已启动')) { $ready = $true; break }
  Start-Sleep -Milliseconds 300
 }
 if (!$ready) { throw "启动尚未就绪，未强制停止后台。请查看：$outputLog 和 $errorLog" }
} catch {
 [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'小黑箱启动提示') | Out-Null
 exit 1
}
