using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
internal static class LauncherUiCheck {
 [STAThread] static void Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  Directory.CreateDirectory(args[0]);
  using(var window=new LauncherWindow(false)){
   window.StartPosition=FormStartPosition.Manual;window.Location=new Point(-20000,-20000);window.ShowInTaskbar=false;
   window.Show();Application.DoEvents();Save(window,args[0],"loading");
   window.Apply(new LaunchResult{ok=true,url="http://127.0.0.1:58720/workbuddy-integrated-studio.html"},false);Save(window,args[0],"ready");
   window.Apply(new LaunchResult{ok=false,error="后台启动失败（退出码 7）。",detail="运行组件不完整，请完整解压离线包后重新启动。"},false);Save(window,args[0],"failure");
   foreach(Control control in window.Controls)if(control.Visible&&control.Bottom>window.ClientSize.Height)throw new Exception("Control overflow: "+control.Text);
  }
 }
 static void Save(Form form,string folder,string name){using(var image=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(image,new Rectangle(0,0,image.Width,image.Height));image.Save(Path.Combine(folder,name+".png"));}}
}
