param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($target) | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw '构建启动器需要 .NET Framework C# 编译器。' }
Add-Type -AssemblyName System.Drawing
# A simple structural-frame application icon; no external image dependencies.
$bitmap = New-Object Drawing.Bitmap 64,64
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([Drawing.Color]::FromArgb(137,36,46))
$pen = New-Object Drawing.Pen ([Drawing.Color]::White),5
$graphics.DrawLine($pen,17,48,17,18)
$graphics.DrawLine($pen,47,48,47,18)
$graphics.DrawLine($pen,14,19,50,19)
$graphics.DrawLine($pen,17,34,47,34)
$iconPath = Join-Path $target 'launcher.ico'
$stream = [IO.File]::Create($iconPath)
$icon = [Drawing.Icon]::FromHandle($bitmap.GetHicon())
try { $icon.Save($stream) } finally { $stream.Dispose();$graphics.Dispose();$pen.Dispose();$bitmap.Dispose() }
$exe = Join-Path $target '结构工作台.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ "/out:$exe" "/win32icon:$iconPath" "/win32manifest:$PSScriptRoot\launcher.manifest" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "$PSScriptRoot\Launcher.cs"
if ($LASTEXITCODE -ne 0) { throw '启动器编译失败。' }
'<?xml version="1.0"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.0"/></startup></configuration>' | Set-Content -LiteralPath ($exe+'.config') -Encoding UTF8
Write-Output $exe
