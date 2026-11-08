import fs, {readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export const validProjectId=id=>/^[a-f0-9]{32}$/.test(id||'');
function folder(root,id,part){if(!validProjectId(id)||!/^([a-z][a-z0-9_-]{0,79})$/.test(part))throw Error('项目或数据分区标识无效');return join(root,id,part);}
const versionName=/^(\d{10})-[a-f0-9-]+\.json$/;
const maxRevision=9999999999;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function damaged(message,files){return Object.assign(Error(message),{status:503,code:'PROJECT_STORE_CORRUPT',files});}
function ioFailure(error){if(!error.status)error.status=500;return error;}

// Dependency injection is only for isolated fault tests; production always uses node:fs.
export function createProjectStore({io=fs,platform=process.platform}={}){
 const queues=new Map();
 async function readPart(root,id,part){
  const dir=folder(root,id,part);let names;
  try{names=await io.readdir(dir);}catch(error){if(error.code==='ENOENT')return null;throw ioFailure(error);}
  const versions=names.filter(name=>versionName.test(name)).sort().reverse();
  if(!versions.length)return null;
  const highestRevision=Number(versionName.exec(versions[0])[1]),invalid=[];
  for(let index=0;index<versions.length;index++){
   const name=versions[index],revision=Number(versionName.exec(name)[1]);
   // Same-revision siblings can be left by older multi-process writers. Never choose by UUID.
   if(versions[index+1]&&Number(versionName.exec(versions[index+1])[1])===revision)
    throw damaged('项目分区存在重复修订，已保留文件，请检查备份后恢复。',versions.filter(n=>Number(versionName.exec(n)[1])===revision));
   let text;
   try{text=await io.readFile(join(dir,name),'utf8');}catch(error){throw ioFailure(error);}
   let record;
   try{record=JSON.parse(text);}catch(error){if(!(error instanceof SyntaxError))throw error;invalid.push(name);continue;}
   const valid=object(record)&&record.schema===1&&record.projectId===id&&record.part===part&&record.revision===revision&&revision>0&&object(record.data)&&typeof record.savedAt==='string'&&Number.isFinite(Date.parse(record.savedAt));
   if(!valid){invalid.push(name);continue;}
   if(!invalid.length)return record;
   // A corrupt delete/restore marker cannot safely be interpreted as an active project.
   if(part==='lifecycle')throw damaged('项目删除或恢复记录损坏，已保留文件，请检查备份后恢复。',invalid);
   const recoveryRevision=highestRevision+invalid.length;
   if(recoveryRevision>=maxRevision)throw damaged('项目修订已达上限，请检查备份后恢复。',invalid);
   // Read-only recovery token: above every on-disk revision, so no old writer can match it.
   // The next save re-reads this state and persists token+1; neither damaged nor token
   // revisions are reused. Each additional damaged fallback also advances the token.
   // Repeated reads/restarts return the same token while the on-disk state is unchanged.
   return {...record,revision:recoveryRevision,recovery:{sourceRevision:revision,highestRevision,damagedFiles:invalid}};
  }
  throw damaged('项目分区全部版本损坏，已保留文件，请从备份恢复。',invalid);
 }
 async function publish(dir,saved){
  const final=join(dir,String(saved.revision).padStart(10,'0')+'-'+randomUUID()+'.json');
  const temporary=final+'.tmp';let handle;
  try{
   await io.mkdir(dir,{recursive:true});
   handle=await io.open(temporary,'wx');
   await handle.writeFile(JSON.stringify(saved),'utf8');
   await handle.sync();
   await handle.close();handle=null;
   await io.rename(temporary,final);
   // Windows does not support opening directories for fsync through node:fs.
   // On POSIX, flush the published directory entry before acknowledging the save.
   if(platform!=='win32'){
    const directory=await io.open(dir,'r');
    try{await directory.sync();}finally{await directory.close();}
   }
  }catch(error){throw ioFailure(error);}finally{if(handle)await handle.close().catch(()=>{});}
  // Failed/crashed temporary files are intentionally retained as evidence, never read/GC'd.
 }
 async function writePart(root,id,part,data,expected){
  const dir=folder(root,id,part),key=resolve(root,id),prior=queues.get(key)||Promise.resolve();
  const next=prior.catch(()=>{}).then(async()=>{
   if(part!=='lifecycle'&&(await readPart(root,id,'lifecycle'))?.data.deleted)throw Object.assign(Error('项目已删除，可在项目管理中恢复。'),{status:410});
   const old=await readPart(root,id,part);
   if(!Number.isSafeInteger(expected)||expected<0)throw Error('保存版本无效');
   if((old?.revision||0)!==expected)throw Object.assign(Error('其他窗口已保存新版本。当前恢复稿已保留，请导出备份后载入最新版本。'),{status:409});
   if(!object(data))throw Error('项目内容无效');
   if(expected>=maxRevision)throw Error('项目修订已达上限');
   // Snapshot the JSON representation, which may normalize undefined/NaN or invoke toJSON.
   const saved=JSON.parse(JSON.stringify({schema:1,projectId:id,part,revision:expected+1,savedAt:new Date().toISOString(),data}));
   if(!object(saved.data))throw Error('项目内容无效');
   await publish(dir,saved);return saved;
  });
  queues.set(key,next);try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}
 }
 return {readPart,writePart};
}
export const {readPart,writePart}=createProjectStore();
export function projectStoreApi(env={}){
 const root=env.WORKBENCH_PROJECT_STORE||join(env.WORKBENCH_DATABASE_ROOT||'E:/600-工作台数据库','603-进行项目','workbench-projects');
 return {name:'workbench-project-store',configureServer:register,configurePreviewServer:register};
 function register(server){server.middlewares.use('/api/workbench-projects',async(req,res)=>{const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};try{
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply(403,{error:'只允许同源访问'});
  const url=new URL(req.url,'http://localhost'),path=url.pathname.split('/').filter(Boolean);
  if(req.method==='GET'&&!path.length){let dirs=[];try{dirs=await readdir(root);}catch(e){if(e.code!=='ENOENT')throw e;}const projects=[];for(const id of dirs.filter(validProjectId)){const main=await readPart(root,id,'main');if(main&&!(await readPart(root,id,'lifecycle'))?.data.deleted)projects.push({id,name:main.data.parameters?.project_name||'未命名项目',mode:main.data.mode||'blank',savedAt:main.savedAt,revision:main.revision});}return reply(200,{projects:projects.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))});}
  if(req.method==='GET'&&path.length===1&&validProjectId(path[0])){const id=path[0],prefix=url.searchParams.get('prefix'),view=url.searchParams.get('view');if((prefix&&prefix!=='expansion-')||(view&&(view!=='context'||prefix!=='expansion-')))return reply(400,{error:'分区筛选无效'});let parts=[];try{parts=await readdir(join(root,id));}catch(e){if(e.code!=='ENOENT')throw e;}const records={};for(const p of parts.filter(p=>/^[a-z][a-z0-9_-]{0,79}$/.test(p)&&(!prefix||p.startsWith(prefix)))){const record=await readPart(root,id,p);if(record&&view==='context'){const {identity,parameters,model,regulations}=record.data;records[p]={...record,data:{identity,parameters,model,regulations}};}else records[p]=record;}return reply(200,{projectId:id,records});}
  if(path.length!==2)return reply(404,{error:'数据分区不存在'});const [id,part]=path;folder(root,id,part);
  if(req.method==='GET'){if(part!=='lifecycle'&&(await readPart(root,id,'lifecycle'))?.data.deleted)return reply(410,{error:'项目已删除，可在项目管理中恢复。'});return reply(200,{record:await readPart(root,id,part)});}
  if(req.method!=='POST')return reply(405,{error:'不支持的操作'});
  if(req.headers['x-workbench-request']!=='project-store')return reply(403,{error:'请求来源无效'});
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024)return reply(413,{error:'项目分区超过32MB，请减少本次图片或文件体积'});chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString());const record=await writePart(root,id,part,body.data,body.expectedRevision);return reply(200,{record:url.searchParams.get('ack')==='1'?{revision:record.revision,savedAt:record.savedAt}:record});
 }catch(e){reply(e.status||400,{error:e.message||'项目保存失败',...(e.code?{code:e.code}:{})});}});}
}
