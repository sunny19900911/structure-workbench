import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

export async function openManager(url,paths){
 const response=await fetch(url+'/api/launcher/status',{signal:AbortSignal.timeout(5000),redirect:'error'});
 if(!response.ok)throw Error('此数据目录的旧服务没有小黑箱管理入口。请保存并自行退出旧服务后再启动，未停止旧服务。');
 const state=await response.json();if(!state.instanceId)throw Error('管理入口身份无效');
 const edge=[join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),join(process.env.ProgramFiles||'C:/Program Files','Microsoft/Edge/Application/msedge.exe')].find(existsSync);
 if(!edge)throw Error('小窗口需要 Microsoft Edge，请安装后重试；后台仍可通过本机网址访问。');
 await new Promise((done,reject)=>{const child=spawn(edge,['--app='+url+'/blackbox','--window-size=560,780','--user-data-dir='+join(paths.data,'launcher-browser'),'--no-first-run'],{windowsHide:false,stdio:'ignore',detached:true});child.once('error',reject);child.once('spawn',()=>{child.unref();done();});});
}
