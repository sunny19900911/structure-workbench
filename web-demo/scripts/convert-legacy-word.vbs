Option Explicit

Dim inputPath, outputPath, wordApp, document
If WScript.Arguments.Count <> 2 Then
  WScript.Echo "Usage: convert-legacy-word.vbs input.doc output.docx"
  WScript.Quit 2
End If

inputPath = WScript.Arguments(0)
outputPath = WScript.Arguments(1)

On Error Resume Next
Set wordApp = CreateObject("Word.Application")
If Err.Number <> 0 Then
  WScript.Echo Err.Description
  WScript.Quit 3
End If

wordApp.Visible = False
wordApp.DisplayAlerts = 0
wordApp.AutomationSecurity = 3
wordApp.Options.UpdateLinksAtOpen = False

Err.Clear
Set document = wordApp.Documents.Open(inputPath, False, True, False, "", "", False, "", "", 0, 0, False, True, 0, True)
If Err.Number <> 0 Then
  WScript.Echo Err.Description
  wordApp.Quit
  WScript.Quit 4
End If

Err.Clear
document.SaveAs2 outputPath, 16
If Err.Number <> 0 Then
  WScript.Echo Err.Description
  document.Close False
  wordApp.Quit
  WScript.Quit 5
End If

document.Close False
wordApp.Quit
WScript.Echo "OK"
WScript.Quit 0
