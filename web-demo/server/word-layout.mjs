import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const root=fileURLToPath(new URL('../outputs/word-preview/',import.meta.url));
let queue=Promise.resolve();
export function cleanDocumentHTML(html){
 if(typeof html!=='string'||html.length>1500000)throw Error('文档内容无效或过长');
 return html.replace(/<(script|style|iframe|object|embed|form|button|svg|img)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[^]*?-->/g,'').replace(/<\/?([a-z][\w-]*)\b([^>]*)>/gi,(tag,name,attrs)=>{
  if(!/^(p|div|span|br|h1|h2|h3|table|thead|tbody|tr|td|th|b|strong|i|em|ul|ol|li|sup|sub)$/.test(name.toLowerCase()))return '';
  const closing=tag.startsWith('</');const spans=/^(td|th)$/i.test(name)?[...attrs.matchAll(/\b(colspan|rowspan)=["']?(\d{1,2})/gi)].map(m=>' '+m[1]+'="'+m[2]+'"').join(''):'';
  const cls=/\bclass=["']([^"']*)/.exec(attrs)?.[1]?.split(/\s+/).find(c=>['document-title','document-subtitle'].includes(c));
  return '<'+(closing?'/':'')+name+(closing?'':spans+(cls?' class="'+cls+'"':''))+'>';
 });
}
export async function wordLayout(raw,kind='expansion',format='pdf',template=null){
 if(template){if(template.version!==1||!Array.isArray(template.blocks)||template.blocks.length>4000||JSON.stringify(template).length>30*1024*1024)throw Error('模板文档数据无效');}

 kind=kind==='measures'?'measures':'expansion';format=['docx','preview'].includes(format)?format:'pdf';
 const html=template?'':cleanDocumentHTML(raw),measures=kind==='measures';
 const css=measures
 ? 'body{font-size:12pt}p{line-height:150%;text-indent:24pt;margin:0}h1,h2{font-size:14pt;line-height:150%;margin:0}'
 : 'body{font-size:9.5pt}p{line-height:100%;margin:0 0 1pt 18pt}h1{font-size:13pt;margin:10pt 0 4pt}h2{font-size:10.5pt;margin:6pt 0 2pt 6pt}';
 const document='<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:"Times New Roman","SimSun";color:black}p{text-align:justify}h1,h2,h3{font-family:SimSun;color:black;page-break-after:avoid}'+css+'.document-title{font:700 18pt SimSun;text-align:center;margin:0 0 2pt}.document-subtitle{font:10.5pt SimSun;text-align:center;margin:0 0 4pt}table{border-collapse:collapse;width:100%;font-size:9pt;margin:4pt 0}td,th{border:0.5pt solid black;padding:2pt;text-align:left}td p,th p{margin:0;text-indent:0}th{font-weight:bold}</style></head><body>'+html+'</body></html>';
 const key=createHash('sha256').update('native-word-reference-v2'+kind+document+JSON.stringify(template)).digest('hex').slice(0,32);
 const dir=join(root,key),path=join(dir,'document.'+(format==='preview'?'pdf':format));
 const job=queue.catch(()=>{}).then(async()=>{
  if(!existsSync(path)){
   await mkdir(dir,{recursive:true});await writeFile(join(dir,'document.html'),document,'utf8');
   if(template){
    await writeFile(join(dir,'template.json'),JSON.stringify(template),'utf8');
    const python=process.env.WORKBENCH_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
    await run(python,[fileURLToPath(new URL('./reference-docx.py',import.meta.url)),join(dir,'template.json'),join(dir,'document.docx')],{windowsHide:true,timeout:60000,maxBuffer:20000});
    await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./word-render-native.ps1',import.meta.url)),'-InputDocx',join(dir,'document.docx'),'-OutputPdf',join(dir,'document.pdf')],{windowsHide:true,timeout:90000,maxBuffer:20000});
   }else await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./word-layout.ps1',import.meta.url)),'-InputHtml',join(dir,'document.html'),'-OutputDocx',join(dir,'document.docx'),'-OutputPdf',join(dir,'document.pdf'),'-Kind',kind],{windowsHide:true,timeout:90000,maxBuffer:20000});
  }
  if(format==='preview'){
   const manifest=join(dir,'preview.json');
   if(!existsSync(manifest)){
    const bundledPoppler=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe');
    await run(process.env.WORKBENCH_PDFTOPPM||(existsSync(bundledPoppler)?bundledPoppler:'pdftoppm.exe'),['-png','-r','120','-scale-to','2200',join(dir,'document.pdf'),join(dir,'page')],{windowsHide:true,timeout:90000,maxBuffer:10000});
    const names=(await readdir(dir)).filter(n=>/^page-\d+\.png$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if(!names.length)throw Error('Word 页面渲染未生成图片');
    const pages=[];for(const name of names)pages.push('data:image/png;base64,'+(await readFile(join(dir,name))).toString('base64'));
    const pdftotext=bundledPoppler.replace('pdftoppm.exe','pdftotext.exe');
    const extracted=await run(existsSync(pdftotext)?pdftotext:'pdftotext.exe',['-layout','-enc','UTF-8',join(dir,'document.pdf'),'-'],{windowsHide:true,timeout:30000,maxBuffer:3000000});
    const pageText=extracted.stdout.split('\f').map(t=>t.replace(/\s+/g,''));
    await writeFile(manifest,JSON.stringify({pages,pageText}),'utf8');
   }
   return JSON.parse(await readFile(manifest,'utf8'));
  }
  return readFile(path);
 });queue=job;return job;
}
