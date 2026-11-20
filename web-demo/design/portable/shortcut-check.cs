using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
class ShortcutCheck {
 [STAThread] static void Main(string[] args){
  Directory.CreateDirectory(args[0]);var exe=Path.GetFullPath(args[1]);var path=LauncherCore.CreateShortcut(args[0],exe);
  var type=Type.GetTypeFromProgID("WScript.Shell");var shell=Activator.CreateInstance(type);var link=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{path});
  var target=(string)link.GetType().InvokeMember("TargetPath",BindingFlags.GetProperty,null,link,null);
  if(!String.Equals(target,exe,StringComparison.OrdinalIgnoreCase))throw new Exception("Wrong shortcut target");
  bool rejected=false;try{LauncherCore.CreateShortcut(args[0],exe);}catch(IOException){rejected=true;}if(!rejected)throw new Exception("Existing shortcut was overwritten");
  Marshal.FinalReleaseComObject(link);Marshal.FinalReleaseComObject(shell);Console.WriteLine("PASS: shortcut target and existing shortcut protection");
 }
}
