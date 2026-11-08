import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const run=promisify(execFile);
const inspector=fileURLToPath(new URL('./document-format.py',import.meta.url));
const applicationProbe=fileURLToPath(new URL('./office-capabilities.ps1',import.meta.url));
const maxBytes=64*1024*1024;
const pythonPath=env=>env.WORKBENCH_PYTHON||(process.platform==='win32'?join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');

export async function inspectDocument(bytes,filename='',env=process.env){
  if(bytes.length>maxBytes)throw Object.assign(Error('文件超过 64 MB，请拆分后导入'),{status:413,code:'RESOURCE_LIMIT'});
  const dir=await mkdtemp(join(tmpdir(),'workbench-file-format-'));
  try{
    const file=join(dir,'input.bin');await writeFile(file,bytes);
    let output;
    try{output=await run(pythonPath(env),[inspector,file,String(filename).slice(0,300)],{timeout:60000,maxBuffer:256*1024,windowsHide:true});}
    catch(error){throw Object.assign(Error(error.killed?'文件格式检查超时，未导入任何内容':'文件识别组件无法运行，请重新解压完整工作台包'),{status:503,code:'INSPECTION_UNAVAILABLE'});}
    let result;try{result=JSON.parse(output.stdout.trim());}catch{throw Object.assign(Error('文件识别组件返回异常，未导入任何内容'),{status:503,code:'INSPECTION_UNAVAILABLE'});}
    if(result.error)throw Object.assign(Error(result.error),{status:result.code==='INSPECTION_UNAVAILABLE'?503:422,code:result.code,detected:result.detected});
    return result.detected;
  }finally{await unlink(join(dir,'input.bin')).catch(()=>{});await rmdir(dir).catch(()=>{});}
}

async function commandVersion(command,args){
  try{const {stdout,stderr}=await run(command,args,{timeout:15000,maxBuffer:65536,windowsHide:true});return {available:true,version:(stdout||stderr).trim().split(/\r?\n/)[0].slice(0,180)};}
  catch{return {available:false,version:''};}
}
function popplerTool(env,name){
  const direct=env[name==='pdfinfo'?'WORKBENCH_PDFINFO':'WORKBENCH_PDFTOPPM'];if(direct)return direct;
  const folder=env.WORKBENCH_POPPLER_DIR||env.POPPLER_BIN;
  if(folder)return join(folder,name+(process.platform==='win32'?'.exe':''));
  const bundled=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin',name+'.exe');
  return process.platform==='win32'&&existsSync(bundled)?bundled:name;
}

export async function inspectCapabilities(env=process.env,dependencies={}){
  const probe=dependencies.run||run;
  const [python,apps,pdfinfo,pdftoppm]=await Promise.all([
    probe(pythonPath(env),['-c','import sys,json,importlib,importlib.util; names={"docx":"docx","openpyxl":"openpyxl","pypdf":"pypdf","PIL":"PIL","lxml":"lxml"}; print(json.dumps({"available":True,"version":sys.version.split()[0],"packages":{k:(getattr(importlib.import_module(v),"__version__","available") if importlib.util.find_spec(v) else None) for k,v in names.items()}}))'],{timeout:15000,maxBuffer:65536,windowsHide:true}).then(r=>JSON.parse(r.stdout.trim())).catch(()=>({available:false,version:'',packages:{}})),
    process.platform==='win32'?probe('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',applicationProbe],{timeout:20000,maxBuffer:65536,windowsHide:true}).then(r=>JSON.parse(r.stdout.replace(/^\uFEFF/,'').trim())).catch(()=>[]):Promise.resolve([]),
    commandVersion(popplerTool(env,'pdfinfo'),['-v']),commandVersion(popplerTool(env,'pdftoppm'),['-v'])
  ]);
  const installedApps=Array.isArray(apps)?apps:[apps];
  const word=installedApps.some(a=>a.id==='word'&&a.detected&&a.automationRegistered);
  const lo=installedApps.some(a=>a.id==='libreoffice'&&a.detected);
  const p=python.packages||{};
  return {schema:1,platform:process.platform,checkedAt:new Date().toISOString(),installedApps,components:{python,pdfinfo,pdftoppm},
    features:[
      {id:'word-modern-read',label:'DOCX / DOCM / DOTX / DOTM 读取',available:Boolean(python.available&&p.PIL&&p.lxml),detail:'按 OOXML 实际结构识别；宏和外部链接不执行。'},
      {id:'word-legacy-read',label:'DOC / DOT 兼容读取',available:word,detail:word?'检测到 Microsoft Word 及自动化注册，实际文件转换时再次校验。':'旧 DOC / DOT 需 Microsoft Word，或先另存为 DOCX 副本。'},
      {id:'word-docx-export',label:'Word 文档生成',available:Boolean(p.docx),detail:'内置 Python 文档组件生成 DOCX；不依赖 Office 安装版本。'},
      {id:'word-pdf-preview',label:'Word 精确预览 / PDF 转换',available:Boolean(word&&pdfinfo.available&&pdftoppm.available),detail:word?'检测到 Word；实际分页受字体与 Word 版本影响，转换结果需实测。':lo?'检测到 LibreOffice，当前 Windows 的 Word 精确渲染路径未据此认定可用。':'未检测到可用 Word 自动化；可先导出 DOCX。'},
      {id:'excel-read',label:'Excel 资料读取',available:true,detail:'由随包表格解析器处理；XLS / XLSX / XLSM / XLSB 等先校验实际格式。读取缓存值，不代替 Excel 重算。'},
      {id:'pptx-export',label:'PPTX 汇报生成',available:true,detail:'使用随包模板和浏览器生成器；识别 PPT 不代表已提供历史演示稿导入。'},
      {id:'pdf-read',label:'PDF 识别与页面校验',available:Boolean(p.pypdf),detail:'识别 PDF 1.0–1.7 / 2.0；加密、截断和结构损坏明确报错。'},
      {id:'pdf-merge',label:'计算书 PDF 预览与合并',available:Boolean(p.pypdf&&pdfinfo.available&&pdftoppm.available),detail:'保留原页面尺寸；需要完整本地 PDF 组件。'}
    ],versionNote:'显示安装程序的实际文件版本；Office 16.x 不据此猜测为 2016、2019、2021 或 Microsoft 365。文件内创建软件信息另列，不代表当前电脑安装版本。'};
}

export function documentFormatApi(env={},dependencies={}){
  const inspect=dependencies.inspect||inspectDocument,capabilities=dependencies.capabilities||inspectCapabilities;
  return {name:'workbench-portable-formats',configureServer:register,configurePreviewServer:register};
  function register(server){
    for(const route of ['/api/portable/formats','/api/portable/capabilities'])server.middlewares.use(route,async(req,res)=>{
      const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
      try{
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply(403,{error:'只允许本机同源页面访问',code:'ORIGIN_REJECTED'});
        if(route.endsWith('/capabilities')){if(req.method!=='GET')return reply(405,{error:'不支持的操作'});return reply(200,await capabilities(env));}
        if(req.method!=='POST'||req.headers['x-workbench-request']!=='portable-formats')return reply(403,{error:'请求来源无效',code:'ORIGIN_REJECTED'});
        let filename;try{filename=decodeURIComponent(req.headers['x-file-name']||'');}catch{return reply(400,{error:'文件名编码无效'});}
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxBytes)return reply(413,{error:'文件超过 64 MB，请拆分后导入',code:'RESOURCE_LIMIT'});chunks.push(chunk);}
        return reply(200,{detected:await inspect(Buffer.concat(chunks),filename,env)});
      }catch(error){return reply(error.status||400,{error:error.message||'文件检查失败',code:error.code||'INVALID_FILE',...(error.detected?{detected:error.detected}:{})});}
    });
  }
}
