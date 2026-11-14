param([string]$WorkbenchRoot, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$stateDir = Join-Path $env:LOCALAPPDATA 'StructureWorkbenchConnector'
$locationFile = Join-Path $stateDir 'location.txt'
function Test-Workbench([string]$path) {
 if (!$path) { return $false }
 foreach ($item in @('launch.ps1','runtime\node\node.exe','app\deploy\portable\start.mjs','app\deploy\blackbox\manager.mjs','app\server\mcp-server.mjs')) {
  if (!(Test-Path -LiteralPath (Join-Path $path $item) -PathType Leaf)) { return $false }
 }
 return $true
}
try {
 if ($WorkbenchRoot -and !(Test-Workbench $WorkbenchRoot)) { throw '所选目录不是完整的离线工作台，请选择解压后的工作台文件夹。' }
 if (!$WorkbenchRoot -and (Test-Path -LiteralPath $locationFile)) {
  $saved = [IO.File]::ReadAllText($locationFile).Trim()
  if (Test-Workbench $saved) { $WorkbenchRoot = $saved }
 }
 if (!$WorkbenchRoot) {
  $neighbors = @(Get-ChildItem -LiteralPath (Split-Path $PSScriptRoot -Parent) -Directory | Where-Object { $_.Name -like '结构工作台-离线网页版*' -and (Test-Workbench $_.FullName) })
  if ($neighbors.Count -eq 1) { $WorkbenchRoot = $neighbors[0].FullName }
 }
 if (!$WorkbenchRoot -and !$CheckOnly) {
  Add-Type -AssemblyName System.Windows.Forms
  $picker = New-Object System.Windows.Forms.FolderBrowserDialog
  $picker.Description = '首次连接：选择已解压的离线工作台文件夹（里面有“启动工作台.cmd”）。'
  $picker.ShowNewFolderButton = $false
  try { if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }; $WorkbenchRoot = $picker.SelectedPath } finally { $picker.Dispose() }
 }
 if (!(Test-Workbench $WorkbenchRoot)) { throw '请先下载并完整解压离线网页版，再选择它的文件夹。' }
 $WorkbenchRoot = [IO.Path]::GetFullPath($WorkbenchRoot)
 if ($CheckOnly) { [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output $WorkbenchRoot; exit 0 }
 [IO.Directory]::CreateDirectory($stateDir) | Out-Null
 [IO.File]::WriteAllText($locationFile,$WorkbenchRoot)
 & powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File (Join-Path $WorkbenchRoot 'launch.ps1') -Manager
 exit $LASTEXITCODE
} catch {
 if ($CheckOnly) { Write-Error $_.Exception.Message; exit 1 }
 Add-Type -AssemblyName System.Windows.Forms
 [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'小黑箱连接提示') | Out-Null
 exit 1
}
