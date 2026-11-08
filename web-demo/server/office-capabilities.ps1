$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$specs = @(
  @{id='word'; name='Microsoft Word'; exe='WINWORD.EXE'; prog='Word.Application'},
  @{id='excel'; name='Microsoft Excel'; exe='EXCEL.EXE'; prog='Excel.Application'},
  @{id='powerpoint'; name='Microsoft PowerPoint'; exe='POWERPNT.EXE'; prog='PowerPoint.Application'},
  @{id='wps-word'; name='WPS Writer'; exe='wps.exe'; prog='KWPS.Application'},
  @{id='wps-excel'; name='WPS Spreadsheets'; exe='et.exe'; prog='KET.Application'},
  @{id='wps-presentation'; name='WPS Presentation'; exe='wpp.exe'; prog='KWPP.Application'},
  @{id='libreoffice'; name='LibreOffice'; exe='soffice.exe'; prog=''}
)
$results = @()
foreach ($spec in $specs) {
  $paths = @()
  foreach ($base in @('Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\', 'Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths\', 'Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\')) {
    try { $value = (Get-Item -LiteralPath ($base + $spec.exe) -ErrorAction Stop).GetValue(''); if ($value) { $paths += [string]$value } } catch {}
  }
  $registered = $false
  if ($spec.prog) {
    try {
      $classId = (Get-Item -LiteralPath ('Registry::HKEY_CLASSES_ROOT\' + $spec.prog + '\CLSID') -ErrorAction Stop).GetValue('')
      $value = (Get-Item -LiteralPath ('Registry::HKEY_CLASSES_ROOT\CLSID\' + $classId + '\LocalServer32') -ErrorAction Stop).GetValue('')
      if ($value) { $registered = $true; $paths += [string]$value }
    } catch {}
  }
  if ($spec.id -eq 'libreoffice') {
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) { if ($base) { $paths += (Join-Path $base 'LibreOffice\program\soffice.exe') } }
  }
  $found = $null
  foreach ($candidate in ($paths | Select-Object -Unique)) {
    $expanded = [Environment]::ExpandEnvironmentVariables($candidate)
    $path = $null
    if ($expanded -match '^\s*"([^"]+\.exe)"') { $path = $Matches[1] }
    elseif ($expanded -match '^\s*(.+?\.exe)(?:\s|$)') { $path = $Matches[1] }
    if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) { $found = Get-Item -LiteralPath $path; break }
  }
  $results += [pscustomobject]@{
    id=$spec.id; name=$spec.name; detected=[bool]$found
    version=$(if($found){[string]$found.VersionInfo.FileVersion}else{''})
    productName=$(if($found){[string]$found.VersionInfo.ProductName}else{''})
    automationRegistered=($registered -and [bool]$found)
  }
}
# Inspect fixed executable metadata and registration only. Do not instantiate COM,
# open documents, scan user profiles or inspect license/credential stores.
ConvertTo-Json -InputObject @($results) -Depth 4 -Compress
