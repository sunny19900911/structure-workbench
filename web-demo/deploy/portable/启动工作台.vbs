Option Explicit
Dim shell, fso, root, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
If fso.FileExists(root & "\结构工作台.exe") Then
 command = """" & root & "\结构工作台.exe"""
 shell.Run command, 1, False
Else
 command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & root & "\launch.ps1"""
 shell.Run command, 0, False
End If
