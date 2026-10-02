import {readdir, realpath, lstat, stat, open, readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve, relative, isAbsolute, basename, sep} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
const blocked = path => path.split(/[\\/]/).includes('03_盈建科参数导出样本');
const inside = (root, path) => {const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
const groupFor = name => /^荷载校核/.test(name)?'荷载校核':['上部','基础','施工图'].includes(name)?name:'';
const cacheRoot = fileURLToPath(new URL('../outputs/calculation-pdf/',import.meta.url));

function binary(name, env){
 const configured=env[name==='pdfinfo'?'WORKBENCH_PDFINFO':'WORKBENCH_PDFTOPPM'];
 const bundled=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin',name+'.exe');
 return configured||(existsSync(bundled)?bundled:name);
}
export async function pdfMetadata(path, env={}){
 const {stdout}=await run(binary('pdfinfo',env),[path],{windowsHide:true,timeout:15000,maxBuffer:100000,encoding:'utf8'});
 const pages=Number(/^Pages:\s*(\d+)/m.exec(stdout)?.[1]);
 if(!pages)throw Error('无法读取 PDF 页数');
 return {pages};
}

// Only inspect PDFs in the explicitly chosen YJK report folders. Never traverse links.
export async function scanCalculationPdfs(input,{metadata=pdfMetadata,maxFiles=200,maxEntries=10000}={}){
 if(typeof input!=='string'||!input.trim()||input.length>2000)throw Error('请填写本机输出文件夹路径');
 const chosen=input.trim().replace(/^"(.*)"$/,'$1');
 if(!isAbsolute(chosen)||/^\\\\/.test(chosen)||blocked(chosen))throw Error('请选择本机计算书输出文件夹的绝对路径');
 const root=await realpath(chosen);
 if(blocked(root)||(await lstat(chosen)).isSymbolicLink()||!(await stat(root)).isDirectory())throw Error('请选择普通文件夹，不使用快捷链接');
 const files=[],warnings=[];let entries=0,limited=false;
 async function visit(dir,group,depth){
  if(depth>8){warnings.push('部分子目录超过 8 层，未继续扫描');return;}
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}))){
   if(++entries>maxEntries||files.length>=maxFiles){limited=true;return;}
   const path=join(dir,entry.name);
   if(entry.isSymbolicLink()||blocked(path))continue;
   if(entry.isDirectory()){
    const next=groupFor(entry.name)||group;
    if(next||entry.name==='计算书')await visit(path,next,depth+1);
    continue;
   }
   if(!group||!entry.isFile()||!entry.name.toLowerCase().endsWith('.pdf'))continue;
   let handle;
   try{
    const actual=await realpath(path);if(!inside(root,actual))continue;
    const info=await stat(actual);if(info.size>128*1024*1024){warnings.push(entry.name+' 超过 128 MB，未读取');continue;}
    handle=await open(actual,'r');const header=Buffer.alloc(1024);await handle.read(header,0,1024,0);await handle.close();handle=null;
    if(!header.includes(Buffer.from('%PDF-'))){warnings.push(entry.name+' 不是有效 PDF');continue;}
    let details;try{details=await metadata(actual);}catch{details={pages:0,error:'无法解析页数；可下载原件核对 PDF 或 Poppler 配置'};}
    files.push({path:actual,relativePath:relative(root,actual).split(sep).join('/'),name:entry.name,group,size:info.size,mtimeMs:info.mtimeMs,...details});
   }catch{warnings.push(entry.name+' 无法读取，请检查文件占用或权限');}finally{await handle?.close();}
  }
 }
 await visit(root,groupFor(basename(root)),0);
 if(limited)warnings.push('已达到扫描上限，请选择更具体的计算书文件夹');
 return {root,files,warnings};
}

export function calculationPdfApi(env={},dependencies={}){
 const grants=new Map(),pending=new Map();
 const metadata=dependencies.metadata||((path)=>pdfMetadata(path,env));
 const render=dependencies.render||async function(path,page,key){
  const dir=join(cacheRoot,key),prefix=join(dir,String(page));await mkdir(dir,{recursive:true});
  if(!existsSync(prefix+'.png'))await run(binary('pdftoppm',env),['-f',String(page),'-l',String(page),'-singlefile','-scale-to','1800','-png',path,prefix],{windowsHide:true,timeout:45000,maxBuffer:100000});
  return readFile(prefix+'.png');
 };
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 async function grantFile(id){
  const file=grants.get(id);if(!file||file.expires<Date.now()){grants.delete(id);throw Error('读取记录已过期，请重新读取文件夹');}
  const path=await realpath(file.path),info=await stat(path);
  if(path!==file.path||!inside(file.root,path)||info.size!==file.size||info.mtimeMs!==file.mtimeMs)throw Error('PDF 已变化，请重新读取文件夹');
  return file;
 }
 function register(server){server.middlewares.use('/api/calculation-pdfs',async(req,res)=>{
  try{
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'仅允许工作台同源读取'});
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/scan'){
    if(req.method!=='POST')return json(res,405,{error:'请主动读取文件夹'});
    if(req.headers['x-workbench-request']!=='calculation-pdfs')return json(res,403,{error:'仅允许工作台同源读取'});
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return json(res,413,{error:'路径请求过长'});}
    const result=await scanCalculationPdfs(JSON.parse(raw).path,{metadata});
    for(const [id,f]of grants)if(f.expires<Date.now())grants.delete(id);
    const files=result.files.map(file=>{const id=randomUUID();grants.set(id,{...file,root:result.root,expires:Date.now()+2*3600000});const {path,...publicFile}=file;return {...publicFile,id};});
    while(grants.size>1000)grants.delete(grants.keys().next().value);
    return json(res,200,{root:result.root,files,warnings:result.warnings});
   }
   if(req.method!=='GET'||!['/page','/file'].includes(url.pathname))return json(res,404,{error:'接口不存在'});
   const file=await grantFile(url.searchParams.get('id'));
   if(url.pathname==='/file'){
    const bytes=await readFile(file.path);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
   }
   const page=Number(url.searchParams.get('page'));
   if(!Number.isInteger(page)||page<1||page>file.pages)return json(res,400,{error:'PDF 页码无效'});
   const key=createHash('sha256').update(file.path+':'+file.size+':'+file.mtimeMs).digest('hex');
   const jobKey=key+':'+page;
   if(!pending.has(jobKey))pending.set(jobKey,Promise.resolve().then(()=>render(file.path,page,key)).finally(()=>pending.delete(jobKey)));
   const png=await pending.get(jobKey);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(png);
  }catch(e){json(res,400,{error:e.code==='ENOENT'?'文件夹或 PDF 不存在，请检查路径':e.code==='EACCES'?'无权读取此文件夹':e.message||'PDF 读取失败'});}
 });}
 return {name:'calculation-pdf-reader',configureServer:register,configurePreviewServer:register};
}
