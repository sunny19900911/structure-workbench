import {readdir, realpath, lstat, stat, open, readFile, mkdir, writeFile, mkdtemp, unlink, rmdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve, relative, isAbsolute, basename, sep} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
const blocked = path => path.split(/[\\/]/).includes('03_盈建科参数导出样本');
const inside = (root, path) => {const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
const groupFor = name => /^荷载校核/.test(name)?'荷载校核':['上部','基础','施工图'].includes(name)?name:'';
const cacheRoot = fileURLToPath(new URL('../outputs/calculation-pdf/',import.meta.url));

function binary(name, env){
 const configured=env[{pdfinfo:'WORKBENCH_PDFINFO',pdftoppm:'WORKBENCH_PDFTOPPM',pdfunite:'WORKBENCH_PDFUNITE'}[name]];
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
export async function scanCalculationPdfs(input,{metadata=pdfMetadata,maxFiles=200,maxEntries=10000,platform=process.platform}={}){
 if(typeof input!=='string'||!input.trim()||input.length>2000)throw Error('请填写本机输出文件夹路径');
 const chosen=input.trim().replace(/^"(.*)"$/,'$1');
 if(platform!=='win32'&&/^[a-z]:[\\/]/i.test(chosen))throw Error('网站服务器无法读取电脑盘符路径，请点击“选择本机文件夹”上传盈建科目录中的 PDF。');
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
    await visit(path,next,depth+1);
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
 const groups=['荷载校核','上部','基础','施工图'];
 files.sort((a,b)=>groups.indexOf(a.group)-groups.indexOf(b.group)||a.relativePath.localeCompare(b.relativePath,'zh-CN',{numeric:true}));
 return {root,files,warnings};
}

export function uploadLocation(root,project,batch,relativePath){
 if(!/^[a-f0-9]{32}$/.test(project||'')||!/^[a-f0-9]{32}$/.test(batch||''))throw Error('项目或上传批次无效');
 const parts=String(relativePath||'').split('/');
 if(parts.length>12||parts.some(p=>!p||p==='.'||p==='..'||/[\\:\x00-\x1f]/.test(p))||blocked(relativePath)||!parts.at(-1).toLowerCase().endsWith('.pdf')||!parts.slice(0,-1).some(groupFor))throw Error('只接收荷载校核、上部、基础、施工图目录中的 PDF');
 const dir=join(root,project,batch),path=join(dir,...parts);
 if(!inside(dir,path))throw Error('文件路径无效');
 return {root:dir,path};
}

export async function mergeCalculationPdfs(paths,env={}){
 if(paths.length===1)return readFile(paths[0]);
 await mkdir(cacheRoot,{recursive:true});
 const dir=await mkdtemp(join(cacheRoot,'merge-')),output=join(dir,'计算书.pdf');
 try{
  if(process.platform==='win32'&&!env.WORKBENCH_PDFUNITE){
   const bundled=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
   const python=env.CALCBOOK_PYTHON||env.WORKBENCH_PYTHON||(existsSync(bundled)?bundled:'python');
   await new Promise((resolve,reject)=>{
    const child=spawn(python,[fileURLToPath(new URL('../scripts/merge-calculation-pdfs.py',import.meta.url)),output],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
    const timer=setTimeout(()=>{child.kill();reject(Error('merge timeout'));},180000);
    child.stdout.resume();child.stderr.resume();child.stdin.on('error',()=>{});
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('merge failed'));});child.stdin.end(JSON.stringify(paths));
   });
  }else await run(binary('pdfunite',env),[...paths,output],{windowsHide:true,timeout:180000,maxBuffer:200000});
  return await readFile(output);
 }catch(e){throw Error(e.code==='ENOENT'?'服务器缺少 pdfunite，请安装 poppler-utils 后重试':e.killed?'PDF 合并超时，请减少文件后重试':'PDF 合并失败，请检查原件是否损坏或加密');}
 finally{await unlink(output).catch(()=>{});await rmdir(dir).catch(()=>{});}
}

export function calculationPdfApi(env={},dependencies={}){
 const grants=new Map(),pending=new Map();
 const uploadRoot=env.CALCBOOK_UPLOAD_DIR||join(env.WORKBENCH_DATABASE_ROOT||'E:/600-工作台数据库','calculation-uploads');
 const merge=dependencies.merge||((paths)=>mergeCalculationPdfs(paths,env));
 let merging=false;
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
   if(['/upload','/export'].includes(url.pathname)){
    if(req.method!=='POST'||req.headers['x-workbench-request']!=='calculation-pdfs')return json(res,403,{error:'仅允许工作台主动操作'});
    const chunks=[];let size=0;const limit=url.pathname==='/upload'?64*1024*1024:32000;
    for await(const chunk of req){size+=chunk.length;if(size>limit)return json(res,413,{error:'单个 PDF 最大支持 64 MB；导出最多 200 份'});chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);
    if(url.pathname==='/upload'){
     const location=uploadLocation(uploadRoot,url.searchParams.get('project'),url.searchParams.get('batch'),url.searchParams.get('path'));
     if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))return json(res,400,{error:'文件不是有效 PDF'});
     await mkdir(join(location.path,'..'),{recursive:true});
     await writeFile(location.path,bytes,{flag:'wx'});
     return json(res,200,{root:location.root});
    }
    const body=JSON.parse(bytes.toString()),ids=body.ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length)return json(res,400,{error:'请选择 1～200 份有效 PDF'});
    const files=await Promise.all(ids.map(grantFile));
    if(new Set(files.map(f=>f.root)).size!==1)return json(res,400,{error:'请从同一输出目录导出 PDF'});
    if(files.reduce((sum,f)=>sum+f.size,0)>512*1024*1024)return json(res,413,{error:'本次合并总大小超过 512 MB'});
    if(merging)return json(res,409,{error:'已有 PDF 正在合并，请稍后再试'});
    merging=true;
    try{
     const result=await merge(files.map(f=>f.path));
     res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent('结构计算书.pdf')}`,'Cache-Control':'no-store'});return res.end(result);
    }finally{merging=false;}
   }
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
