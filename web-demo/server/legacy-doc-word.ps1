param([string]$InputDoc,[string]$OutputDocx,[string]$OutputXml)
$ErrorActionPreference='Stop'
$word=$null;$doc=$null;$archive=$null;$reader=$null
try {
  $word=New-Object -ComObject Word.Application
  $word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
  $word.Options.UpdateLinksAtOpen=$false
  $doc=$word.Documents.Open($InputDoc,$false,$true,$false)
  $doc.SaveAs2($OutputDocx,16)
  $doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc);$doc=$null
  $word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word);$word=$null

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($OutputDocx)
  $entry=$archive.GetEntry('word/document.xml')
  if(!$entry){throw 'Word document body is missing'}
  $reader=New-Object IO.StreamReader($entry.Open())
  $source=New-Object Xml.XmlDocument;$source.XmlResolver=$null
  $source.LoadXml($reader.ReadToEnd())
  $ns=New-Object Xml.XmlNamespaceManager($source.NameTable)
  $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $result=New-Object Xml.XmlDocument
  $article=$result.CreateElement('article');[void]$result.AppendChild($article)
  function Add-Paragraph($parent,$paragraph){
    $text=($paragraph.SelectNodes('.//w:t[not(ancestor::w:del)]',$ns) | ForEach-Object {$_.InnerText}) -join ''
    if($text.Trim()){$p=$result.CreateElement('para');$p.InnerText=$text;[void]$parent.AppendChild($p)}
  }
  foreach($block in $source.SelectSingleNode('//w:body',$ns).ChildNodes){
    if($block.LocalName -eq 'p'){Add-Paragraph $article $block}
    elseif($block.LocalName -eq 'tbl'){
      $table=$result.CreateElement('informaltable');[void]$article.AppendChild($table)
      foreach($row in $block.SelectNodes('w:tr',$ns)){
        $outRow=$result.CreateElement('row');[void]$table.AppendChild($outRow)
        foreach($cell in $row.SelectNodes('w:tc',$ns)){
          $outCell=$result.CreateElement('entry');[void]$outRow.AppendChild($outCell)
          foreach($p in $cell.SelectNodes('.//w:p',$ns)){Add-Paragraph $outCell $p}
        }
      }
    }
  }
  [IO.File]::WriteAllText($OutputXml,$result.OuterXml,(New-Object Text.UTF8Encoding($false)))
} finally {
  if($reader){$reader.Dispose()};if($archive){$archive.Dispose()}
  if($doc){$doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc)}
  if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
}
