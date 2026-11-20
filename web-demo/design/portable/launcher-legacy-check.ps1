$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$script = Join-Path $root 'deploy/portable/launch.ps1'
$parseErrors = $null
$tokens = $null
[Management.Automation.Language.Parser]::ParseFile($script,[ref]$tokens,[ref]$parseErrors) | Out-Null
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$code = [IO.File]::ReadAllText($script)
$begin = $code.IndexOf("  `$logText = ''")
$end = $code.IndexOf('  if ($logText.Contains', $begin)
if ($begin -lt 0 -or $end -lt 0) { throw 'Missing shared-read block' }
$stdout = Join-Path $root ('qa/portable-release/launcher-20261116/shared-read-'+[Guid]::NewGuid().ToString('N')+'.log')
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($stdout)) | Out-Null
$writer = [IO.File]::Open($stdout,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try {
 $bytes = [Text.Encoding]::UTF8.GetBytes('fixture ready')
 $writer.Write($bytes,0,$bytes.Length);$writer.Flush()
 $oldFailed = $false
 try { [IO.File]::ReadAllText($stdout) | Out-Null } catch { $oldFailed = $true }
 if (!$oldFailed) { throw 'Fixture did not reproduce original sharing violation' }
 . ([ScriptBlock]::Create($code.Substring($begin,$end-$begin)))
 if ($logText -ne 'fixture ready') { throw 'Shared reader failed' }
 'PASS: legacy launcher parses; original sharing violation reproduced; replacement reads the open writer safely.'
} finally { $writer.Dispose() }
