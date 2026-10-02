param([string]$InputDocx,[string]$OutputPdf)
$ErrorActionPreference='Stop'
$word=$null;$doc=$null
try {
 $word=New-Object -ComObject Word.Application
 $word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 $word.Options.UpdateLinksAtOpen=$false
 $doc=$word.Documents.Open($InputDocx,$false,$true,$false)
 $doc.Repaginate();$doc.ExportAsFixedFormat($OutputPdf,17)
} finally {
 if($doc){$doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc)}
 if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
}
