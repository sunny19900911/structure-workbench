param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputDirectory,[switch]$ConvertDoc)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($OutputDirectory)
[void][IO.Directory]::CreateDirectory($target)
$copy=Join-Path $target ('input-copy'+[IO.Path]::GetExtension($InputFile))
Copy-Item -LiteralPath $InputFile -Destination $copy
$word=$null;$doc=$null
try {
  $word=New-Object -ComObject Word.Application
  $word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
  $word.Options.UpdateLinksAtOpen=$false
  $word.Options.PrintDrawingObjects=$true
  $word.Options.PrintBackground=$false
  $doc=$word.Documents.Open($copy,$false,$true,$false)
  if($ConvertDoc){$doc.SaveAs2((Join-Path $target 'reference.docx'),16)}
  $doc.Repaginate()
  $pages=$doc.ComputeStatistics(2)
  $doc.ExportAsFixedFormat((Join-Path $target 'word-render.pdf'),17)
  $pdfPath=Join-Path $target 'word-render.pdf'
  for($attempt=0;$attempt -lt 20 -and !(Test-Path -LiteralPath $pdfPath);$attempt++){Start-Sleep -Milliseconds 250}
  if(!(Test-Path -LiteralPath $pdfPath)){throw 'Word did not create the requested PDF'}
  [pscustomobject]@{pages=$pages;pdf=(Join-Path $target 'word-render.pdf')} | ConvertTo-Json -Compress
}finally{
  if($doc){$doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc)}
  if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
}
