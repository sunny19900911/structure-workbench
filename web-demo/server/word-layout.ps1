param([string]$InputHtml,[string]$OutputDocx,[string]$OutputPdf,[string]$Kind)
$ErrorActionPreference='Stop'
$word=$null
$doc=$null
try {
  $word=New-Object -ComObject Word.Application
  $word.Visible=$false
  $word.DisplayAlerts=0
  $word.AutomationSecurity=3
  $doc=$word.Documents.Open($InputHtml,$false,$false,$false)
  foreach($section in $doc.Sections){
    $setup=$section.PageSetup
    $setup.Orientation=1
    $setup.PageWidth=1190.55
    $setup.PageHeight=841.9
    if($Kind -eq 'measures'){
      $setup.TopMargin=90;$setup.BottomMargin=90;$setup.LeftMargin=72;$setup.RightMargin=72
      $setup.HeaderDistance=42.55;$setup.FooterDistance=49.6
      $setup.TextColumns.SetCount(2);$setup.TextColumns.Spacing=21.25
    }else{
      $setup.TopMargin=56.7;$setup.BottomMargin=56.7;$setup.LeftMargin=62.35;$setup.RightMargin=62.35
      $setup.HeaderDistance=36;$setup.FooterDistance=36
      $setup.TextColumns.SetCount(2);$setup.TextColumns.Spacing=24
    }
  }
  $doc.Repaginate()
  $doc.SaveAs2($OutputDocx,16)
  $doc.ExportAsFixedFormat($OutputPdf,17)
  Write-Output 'WORD_LAYOUT_OK'
} finally {
  if($doc){$doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc)}
  if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
}
