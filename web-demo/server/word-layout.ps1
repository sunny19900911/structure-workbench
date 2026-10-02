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
    }elseif($Kind -eq 'regulations'){
      $setup.PageWidth=1190.7;$setup.PageHeight=841.95
      $setup.TopMargin=85.05;$setup.BottomMargin=85.05;$setup.LeftMargin=70.9;$setup.RightMargin=70.9;$setup.Gutter=28.35
      $setup.HeaderDistance=42.55;$setup.FooterDistance=49.6
      $setup.TextColumns.SetCount(2);$setup.TextColumns.Spacing=52.5
    }else{
      $setup.TopMargin=56.7;$setup.BottomMargin=56.7;$setup.LeftMargin=62.35;$setup.RightMargin=62.35
      $setup.HeaderDistance=36;$setup.FooterDistance=36
      $setup.TextColumns.SetCount(2);$setup.TextColumns.Spacing=24
    }
  }
  # Reference table 2.2: preserve real Word widths, paragraph indents and borders.
  foreach($table in $doc.Tables){
    $header=$table.Cell(1,1).Range.Text -replace '[\r\x07]',''
    if($header -ne '规范、规程和图集名称' -or $table.Columns.Count -ne 2){continue}
    $table.AllowAutoFit=$false
    $table.Spacing=0;$table.PreferredWidthType=3;$table.PreferredWidth=494.8
    $table.Columns.Item(1).SetWidth(302.3,0);$table.Columns.Item(2).SetWidth(192.5,0)
    $table.Rows.LeftIndent=6.15
    $table.TopPadding=0;$table.BottomPadding=0;$table.LeftPadding=5.4;$table.RightPadding=5.4
    $table.Range.Font.Name='宋体';$table.Range.Font.NameFarEast='宋体';$table.Range.Font.Size=10.5;$table.Range.Font.Bold=0
    $paragraph=$table.Range.ParagraphFormat
    $paragraph.SpaceBefore=0;$paragraph.SpaceAfter=0;$paragraph.LineSpacingRule=5;$paragraph.LineSpacing=15
    $paragraph.CharacterUnitFirstLineIndent=0;$paragraph.FirstLineIndent=21;$paragraph.LeftIndent=0;$paragraph.RightIndent=0;$paragraph.Alignment=3
    $table.Range.Cells.VerticalAlignment=1
    $table.Rows.HeightRule=1;$table.Rows.Height=16.85;$table.Rows.AllowBreakAcrossPages=$true
    $table.Rows.Item(1).HeadingFormat=$true
    foreach($edge in @(-1,-2,-3,-4,-5,-6)){
      $border=$table.Borders.Item($edge);$border.LineStyle=1;$border.Color=0
      $border.LineWidth=4;if($edge -le -5){$border.LineWidth=6}
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
