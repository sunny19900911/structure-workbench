import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createApplication} from '../baota/http-app.mjs';
import {portablePaths,portableEnvironment,portableHTML,validateRuntime,RELEASE} from './runtime.mjs';
import {createBrowserBridge} from '../../server/mcp-browser-bridge.mjs';
import {acquireService,serviceAddress} from './portable-service-lock.mjs';
import {officeDocumentApi} from '../../server/office-document-api.mjs';

const appRoot=fileURLToPath(new URL('../../',import.meta.url));
process.chdir(appRoot);
const paths=portablePaths(appRoot),env=portableEnvironment(paths);
let lease,server;
function openPage(url){if(process.argv.includes('--open'))spawn('explorer.exe',[url+'/workbuddy-integrated-studio.html'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});}
try{
lease=await acquireService(paths.data,RELEASE);
if(!lease.owner){openPage(lease.url);console.log('复用本地工作台 '+lease.url);process.exit(0);}
// Older packages have no kernel lock. Refuse to start beside one using this root.
const older=await Promise.all(Array.from({length:20},async(_,i)=>{
 try{const response=await fetch('http://127.0.0.1:'+(58720+i)+'/api/portable/health',{signal:AbortSignal.timeout(500),redirect:'error'});return response.ok?await response.json():null;}catch{return null;}
}));
for(const h of older)if(h?.app==='structure-workbench-portable'&&h.dataRoot&&
 (await serviceAddress(h.dataRoot)).dataRoot===lease.info.dataRoot)throw Error('此数据目录已有未采用单服务锁的工作台运行，请保存并关闭该服务后重试。');
validateRuntime(env);
for(const dir of [paths.data,paths.projects,paths.uploads,paths.cache,env.CALCBOOK_SOURCE_DIR])await mkdir(dir,{recursive:true});
Object.assign(process.env,env);
// Only this user's explicit local settings are used. Never load .env or E:/00-key.
let preferences={};
try{preferences=JSON.parse(await readFile(paths.preferences,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('本机设置文件损坏，请通过说明中的恢复方法处理。');}
function aiEnvironment(){return {...env,...(typeof preferences.apiKey==='string'&&preferences.apiKey.trim()?{DEEPSEEK_API_KEY:preferences.apiKey.trim(),DEEPSEEK_MODEL:'deepseek-chat'}:{})};}
const [{deepSeekLocalApi,calculationBookLocalApi},{expansionApi},{projectStoreApi},{intakeApi},{calculationPdfApi},{rewriteApi},{documentFormatApi},{portableProjectApi}]=await Promise.all([
 import('../../vite.config.js'),import('../../server/expansion-api.mjs'),import('../../server/project-store.mjs'),import('../../server/intake-api.mjs'),import('../../server/calculation-pdf-api.mjs'),import('../../deepseek-rewrite/service.mjs'),import('../../server/document-format-api.mjs'),import('../../server/portable-projects.mjs')
]);
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
let service;
const mcpBridge=createBrowserBridge();
const localSettings={configurePreviewServer(adapter){adapter.middlewares.use('/api/portable',async(req,res,next)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/health'&&req.method==='GET')return json(res,200,{app:'structure-workbench-portable',version:RELEASE,pid:process.pid,instanceId:lease.info.instanceId,dataRoot:paths.data,local:true});
 if(path==='/preferences'&&req.method==='GET')return json(res,200,{aiConfigured:Boolean(preferences.apiKey),dataRoot:paths.data,version:RELEASE});
 if(!['/preferences','/open-data'].includes(path))return next();
 if(req.method!=='POST'||req.headers['x-workbench-request']!=='portable-settings')return json(res,403,{error:'请从本机设置操作'});
 if(path==='/open-data'){spawn('explorer.exe',[paths.data],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});return json(res,200,{ok:true});}
 try{
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('设置内容过长');chunks.push(chunk);}
  const input=JSON.parse(Buffer.concat(chunks).toString());
  if(typeof input.apiKey!=='string'||input.apiKey.length>512||/[\r\n]/.test(input.apiKey))throw Error('API Key 格式不正确');
  preferences={apiKey:input.apiKey.trim()};await writeFile(paths.preferences,JSON.stringify(preferences),{encoding:'utf8',mode:0o600});
  service=build();return json(res,200,{ok:true,aiConfigured:Boolean(preferences.apiKey)});
 }catch(e){return json(res,400,{error:e.message});}
 });}};
function build(){const config=aiEnvironment();return createApplication({publicDir:join(appRoot,'dist'),localOnly:true,transformHTML:portableHTML,plugins:[localSettings,mcpBridge.plugin,officeDocumentApi(config),documentFormatApi(config),portableProjectApi(config),deepSeekLocalApi(config),calculationBookLocalApi(config),expansionApi(config),projectStoreApi(config),intakeApi(config),calculationPdfApi(config),rewriteApi(config)]});}
service=build();
const index=process.argv.indexOf('--port'),port=index>=0?Number(process.argv[index+1]):58720;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('本机端口无效');
server=createServer((req,res)=>service(req,res));
// Hold the kernel lock before importing/writing project state, through HTTP shutdown.
let selected=port;
for(;;){
 try{await new Promise((done,reject)=>{server.once('error',reject);server.listen(selected,'127.0.0.1',()=>{server.removeListener('error',reject);done();});});break;}
 catch(e){if(e.code!=='EADDRINUSE'||selected>=Math.min(port+19,65535))throw e;selected++;}
}
const url='http://127.0.0.1:'+selected;
lease.ready(url);openPage(url);console.log('本地工作台已启动 '+url+' / '+RELEASE);
const stop=()=>{mcpBridge.close();server.close(()=>{lease.close();});server.closeIdleConnections();};
process.once('SIGTERM',stop);process.once('SIGINT',stop);
server.once('close',()=>lease.close());
}catch(error){server?.close();lease?.owner&&lease.close();console.error('工作台未能启动：'+error.message);process.exitCode=1;}
