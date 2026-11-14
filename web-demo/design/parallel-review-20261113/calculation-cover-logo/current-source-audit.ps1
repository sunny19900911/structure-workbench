param([string]$SourceDoc,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
[void][IO.Directory]::CreateDirectory($OutputDirectory)
$copy=Join-Path $OutputDirectory 'current-source-readonly-copy.DOC'
Copy-Item -LiteralPath $SourceDoc -Destination $copy
$word=$null;$doc=$null
try{
 $word=New-Object -ComObject Word.Application
 $word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 $word.Options.UpdateLinksAtOpen=$false;$word.Options.PrintDrawingObjects=$true;$word.Options.PrintBackground=$false
 $doc=$word.Documents.Open($copy,$false,$true,$false)
 $sections=@(foreach($section in $doc.Sections){$page=$section.PageSetup;[pscustomobject]@{pageWidthPt=$page.PageWidth;pageHeightPt=$page.PageHeight;orientation=$page.Orientation;columns=$page.TextColumns.Count;leftMarginPt=$page.LeftMargin;rightMarginPt=$page.RightMargin;gutterPt=$page.Gutter}})
 $zoom=$word.ActiveWindow.View.Zoom
 $view=[pscustomobject]@{viewType=$word.ActiveWindow.View.Type;zoomPercentage=$zoom.Percentage;pageFit=$zoom.PageFit;pageColumns=$zoom.PageColumns;pageRows=$zoom.PageRows}
 $branding=$doc.Tables.Item(5)
 $audit=[pscustomobject]@{sourceSha256=(Get-FileHash -LiteralPath $SourceDoc -Algorithm SHA256).Hash;sourceModifiedUtc=(Get-Item -LiteralPath $SourceDoc).LastWriteTimeUtc;readOnly=$doc.ReadOnly;sections=$sections;view=$view;tableCount=$doc.Tables.Count;brandingTableRows=$branding.Rows.Count;brandingTableCells=$branding.Range.Cells.Count;brandingCell1Pictures=$branding.Cell(1,1).Range.InlineShapes.Count;brandingCell2Pictures=$branding.Cell(1,2).Range.InlineShapes.Count;brandingCell2Text=$branding.Cell(1,2).Range.Text;inlinePictures=$doc.InlineShapes.Count}
 $doc.Repaginate();$doc.ExportAsFixedFormat((Join-Path $OutputDirectory 'current-source-direct.pdf'),17)
 $audit | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'current-source-audit.json') -Encoding utf8
 $audit | ConvertTo-Json -Depth 6
}finally{
 if($doc){$doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc)}
 if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
}
