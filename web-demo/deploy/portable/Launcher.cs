using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class LaunchResult {
 public bool ok {get;set;}
 public string url {get;set;} public string error {get;set;} public string detail {get;set;} public string dataDir {get;set;}
 public Dictionary<string,string> logs {get;set;}
}
internal static class LauncherCore {
 public static string CreateShortcut(string desktop,string executable) {
  string path=Path.Combine(desktop,"结构工作台.lnk");
  if(File.Exists(path))throw new IOException("桌面已存在“结构工作台”快捷方式。请先确认已有快捷方式后再处理。");
  object shell=null,shortcut=null;
  try {
   var type=Type.GetTypeFromProgID("WScript.Shell",true);
   shell=Activator.CreateInstance(type);
   shortcut=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{path});
   var shortcutType=shortcut.GetType();
   foreach(var property in new string[]{"TargetPath","WorkingDirectory","IconLocation","Description"}){
    string value=property=="TargetPath"?executable:property=="WorkingDirectory"?Path.GetDirectoryName(executable):property=="IconLocation"?executable+",0":"打开结构工作台";
    shortcutType.InvokeMember(property,BindingFlags.SetProperty,null,shortcut,new object[]{value});
   }
   shortcutType.InvokeMember("Save",BindingFlags.InvokeMethod,null,shortcut,null);
   return path;
  }finally{if(shortcut!=null)Marshal.FinalReleaseComObject(shortcut);if(shell!=null)Marshal.FinalReleaseComObject(shell);}
 }
 public static LaunchResult Run(string root) {
  string node=Path.Combine(root,@"runtime\node\node.exe");
  string host=Path.Combine(root,@"app\deploy\portable\launcher-host.mjs");
  if(!File.Exists(node)||!File.Exists(host))return new LaunchResult{error="运行组件不完整。请完整解压整个软件包，再打开结构工作台.exe。不要单独复制 EXE。"};
  string response=Path.Combine(Path.GetTempPath(),"StructureWorkbenchLauncher-"+Guid.NewGuid().ToString("N")+".json");
  try {
   var start=new ProcessStartInfo(node,"\""+host+"\" --result \""+response+"\"") {
    WorkingDirectory=root, UseShellExecute=false, CreateNoWindow=true
   };
   using(var process=new Process{StartInfo=start}) {
    process.Start();
    if(!process.WaitForExit(135000))return new LaunchResult{error="启动检查超时，请稍后重试。后台可能仍在初始化。"};
    if(!File.Exists(response))return new LaunchResult{error="运行组件没有返回启动结果。",detail="请检查软件包是否完整，以及本机是否阻止运行组件。组件退出码："+process.ExitCode};
    string text=File.ReadAllText(response,Encoding.UTF8);
    var result=new JavaScriptSerializer().Deserialize<LaunchResult>(text);
    if(result==null)throw new InvalidDataException("启动结果为空");
    if(result.ok) {
     Uri uri;
     if(process.ExitCode!=0||!Uri.TryCreate(result.url,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.UserInfo!=""||uri.AbsolutePath!="/workbuddy-integrated-studio.html")
      return new LaunchResult{error="工作台返回了无效地址，未打开浏览器。"};
    }
    return result;
   }
  }catch(Exception e){return new LaunchResult{error="无法启动工作台。",detail=e.Message};}
  finally{try{if(File.Exists(response))File.Delete(response);}catch{}}
 }
 public static string Diagnostics(LaunchResult r) {
  var text=new StringBuilder("结构工作台启动诊断\r\n启动器：2026.11.16.1\r\n");
  text.AppendLine("系统："+Environment.OSVersion+"；64位系统："+Environment.Is64BitOperatingSystem);
  text.AppendLine(r.ok?"后台已就绪":r.error);if(!String.IsNullOrEmpty(r.detail))text.AppendLine(r.detail);
  if(!String.IsNullOrEmpty(r.dataDir))text.AppendLine("数据位置："+r.dataDir);
  if(r.logs!=null)foreach(var log in r.logs)text.AppendLine(log.Key+"："+log.Value);
  return text.ToString();
 }
}
internal sealed class LauncherWindow : Form {
 readonly Label status=new Label(),hint=new Label();
 readonly TextBox details=new TextBox();
 readonly Button open=new Button(),retry=new Button(),copy=new Button(),folder=new Button();
 readonly ProgressBar progress=new ProgressBar();
 LaunchResult result;bool busy;
 public LauncherWindow(bool autoStart=true) {
  Text="结构工作台";ClientSize=new Size(620,420);MinimumSize=new Size(636,459);
  Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(248,249,251);
  StartPosition=FormStartPosition.CenterScreen;AutoScaleMode=AutoScaleMode.Dpi;
  try{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);}catch{}
  var title=new Label{Text="结构工作台",Font=new Font(Font.FontFamily,23,FontStyle.Bold),ForeColor=Color.FromArgb(137,36,46),Location=new Point(28,22),Size=new Size(550,46)};
  status.SetBounds(30,85,550,32);status.Font=new Font(Font.FontFamily,13,FontStyle.Bold);
  hint.SetBounds(30,122,550,45);hint.Text="首次启动需要载入默认 A 模板，请稍候。";
  progress.SetBounds(30,174,550,5);progress.Style=ProgressBarStyle.Marquee;
  details.SetBounds(30,194,550,112);details.Multiline=true;details.ReadOnly=true;details.ScrollBars=ScrollBars.Vertical;details.BorderStyle=BorderStyle.None;details.BackColor=BackColor;
  open.Text="打开工作台";open.SetBounds(30,326,148,40);open.BackColor=Color.FromArgb(137,36,46);open.ForeColor=Color.White;open.FlatStyle=FlatStyle.Flat;
  retry.Text="重试";retry.SetBounds(190,326,90,40);
  copy.Text="复制诊断信息";copy.SetBounds(292,326,140,40);
  folder.Text="打开日志目录";folder.SetBounds(444,326,140,40);
  var footer=new Label{Text="关闭此窗口后，已启动的工作台仍可继续使用。",ForeColor=Color.DimGray,Location=new Point(30,382),Size=new Size(560,25)};
  Controls.AddRange(new Control[]{title,status,hint,progress,details,open,retry,copy,folder,footer});
  open.Click+=(s,e)=>OpenPage();retry.Click+=(s,e)=>Start();
  copy.Click+=(s,e)=>{try{Clipboard.SetText(LauncherCore.Diagnostics(result));copy.Text="已复制";}catch(Exception ex){details.Text=ex.Message;}};
  folder.Click+=(s,e)=>{try{Process.Start(new ProcessStartInfo(result.dataDir){UseShellExecute=true});}catch(Exception ex){details.Text=ex.Message;}};
  status.Text="正在启动…";open.Enabled=retry.Enabled=copy.Enabled=folder.Enabled=false;
  if(autoStart)Shown+=(s,e)=>Start();
 }
 void Start(){
  if(busy)return;busy=true;status.Text="正在启动…";hint.Text="正在检查本机服务，准备好后会自动打开网页。";
  progress.Visible=true;details.Clear();open.Enabled=retry.Enabled=copy.Enabled=folder.Enabled=false;copy.Text="复制诊断信息";
  ThreadPool.QueueUserWorkItem(delegate {
   var next=LauncherCore.Run(AppDomain.CurrentDomain.BaseDirectory);
   try{if(!IsDisposed)BeginInvoke((MethodInvoker)delegate{Apply(next,true);});}catch(InvalidOperationException){}
  });
 }
 internal void Apply(LaunchResult next,bool autoOpen){
  result=next;busy=false;progress.Visible=false;open.Enabled=result.ok;retry.Enabled=copy.Enabled=true;folder.Enabled=!String.IsNullOrEmpty(result.dataDir)&&Directory.Exists(result.dataDir);
  status.Text=result.ok?"工作台已就绪":"工作台未能启动";
  hint.Text=result.ok?"可以在浏览器中继续工作。再次点击按钮可重新打开。":result.error;
  details.Text=result.ok?"项目保存在本机。更新软件包不会覆盖已有项目。":LauncherCore.Diagnostics(result);
  if(autoOpen&&result.ok){OpenPage();OfferShortcut();}
 }
 void OfferShortcut(){
  try{
   string marker=Path.Combine(result.dataDir,"launcher-desktop-choice.txt");
   string exe=Application.ExecutablePath;
   if(File.Exists(marker)&&File.ReadAllText(marker)==exe)return;
   string desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
   if(!File.Exists(Path.Combine(desktop,"结构工作台.lnk"))&&MessageBox.Show(this,"是否在桌面创建“结构工作台”快捷方式？\r\n以后可以直接从桌面打开。","结构工作台",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes)
    LauncherCore.CreateShortcut(desktop,exe);
   File.WriteAllText(marker,exe,Encoding.UTF8);
  }catch(Exception e){MessageBox.Show(this,"桌面快捷方式创建失败。\r\n"+e.Message,"结构工作台",MessageBoxButtons.OK,MessageBoxIcon.Information);}
 }
 void OpenPage(){try{Process.Start(new ProcessStartInfo(result.url){UseShellExecute=true});status.Text="工作台已打开";}catch(Exception e){status.Text="后台已就绪，浏览器未打开";hint.Text="可以复制下面的地址，在浏览器中打开。";details.Text=result.url+Environment.NewLine+e.Message;}}
}
internal static class Program {
 [STAThread] static int Main(string[] args) {
  // Diagnostic mode exercises the same launcher without opening a browser.
  if(args.Length==2&&args[0]=="--diagnose"){
   var result=LauncherCore.Run(AppDomain.CurrentDomain.BaseDirectory);
   File.WriteAllText(args[1],new JavaScriptSerializer().Serialize(result),new UTF8Encoding(false));return result.ok?0:1;
  }
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  Application.Run(new LauncherWindow());return 0;
 }
}
