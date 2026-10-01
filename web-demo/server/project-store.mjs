import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const queues=new Map();
export const validProjectId=id=>/^[a-f0-9]{32}$/.test(id||'');
function folder(root,id,part){if(!validProjectId(id)||!/^([a-z][a-z0-9_-]{0,79})$/.test(part))throw Error('项目或数据分区标识无效');return join(root,id,part);}
export async function readPart(root,id,part){let names;const dir=folder(root,id,part);try{names=await readdir(dir);}catch(e){if(e.code==='ENOENT')return null;throw e;}const last=names.filter(x=>/^\d{10}-[a-f0-9-]+\.json$/.test(x)).sort().at(-1);return last?JSON.parse(await readFile(join(dir,last),'utf8')):null;}
export async function writePart(root,id,part,data,expected){
 const dir=folder(root,id,part),key=dir;const prior=queues.get(key)||Promise.resolve();
 const next=prior.catch(()=>{}).then(async()=>{const old=await readPart(root,id,part);if(!Number.isInteger(expected)||expected<0)throw Error('保存版本无效');if((old?.revision||0)!==expected){const e=Error('其他窗口已保存新版本。当前恢复稿已保留，请导出备份后载入最新版本。');e.status=409;throw e;}if(!data||typeof data!=='object'||Array.isArray(data))throw Error('项目内容无效');const saved={schema:1,projectId:id,part,revision:expected+1,savedAt:new Date().toISOString(),data};await mkdir(dir,{recursive:true});await writeFile(join(dir,String(saved.revision).padStart(10,'0')+'-'+randomUUID()+'.json'),JSON.stringify(saved),{encoding:'utf8',flag:'wx'});return saved;});
 queues.set(key,next);try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}
}
export function projectStoreApi(env={}){
 const root=env.WORKBENCH_PROJECT_STORE||join(env.WORKBENCH_DATABASE_ROOT||'E:/600-工作台数据库','603-进行项目','workbench-projects');
 return {name:'workbench-project-store',configureServer:register,configurePreviewServer:register};
 function register(server){server.middlewares.use('/api/workbench-projects',async(req,res)=>{const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};try{
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply(403,{error:'只允许同源访问'});
  const path=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);
  if(req.method==='GET'&&!path.length){let dirs=[];try{dirs=await readdir(root);}catch(e){if(e.code!=='ENOENT')throw e;}const projects=[];for(const id of dirs.filter(validProjectId)){const main=await readPart(root,id,'main');if(main)projects.push({id,name:main.data.parameters?.project_name||'未命名项目',mode:main.data.mode||'blank',savedAt:main.savedAt,revision:main.revision});}return reply(200,{projects:projects.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))});}
  if(req.method==='GET'&&path.length===1&&validProjectId(path[0])){const id=path[0];let parts=[];try{parts=await readdir(join(root,id));}catch(e){if(e.code!=='ENOENT')throw e;}const records={};for(const p of parts.filter(p=>/^[a-z][a-z0-9_-]{0,79}$/.test(p)))records[p]=await readPart(root,id,p);return reply(200,{projectId:id,records});}
  if(path.length!==2)return reply(404,{error:'数据分区不存在'});const [id,part]=path;folder(root,id,part);
  if(req.method==='GET')return reply(200,{record:await readPart(root,id,part)});
  if(req.method!=='POST')return reply(405,{error:'不支持的操作'});
  if(req.headers['x-workbench-request']!=='project-store')return reply(403,{error:'请求来源无效'});
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024)return reply(413,{error:'项目分区超过32MB，请减少本次图片或文件体积'});chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString());const record=await writePart(root,id,part,body.data,body.expectedRevision);return reply(200,{record});
 }catch(e){reply(e.status||400,{error:e.message||'项目保存失败'});}});}
}
