// Release-time public-link audit. It never changes the regulation's legal validity.
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const [key,...rest]=value.replace(/^--/,'').split('=');return [key,rest.join('=')];}));
const timeout=Number(args.timeout||8000),concurrency=Math.min(12,Math.max(1,Number(args.concurrency||8)));
const input=JSON.parse(await readFile(join(root,'design/parallel-tasks/02-regulation-query/main-workbench-pilot-tj-bj.json'),'utf8'));
const records=Object.values(input.provinces).flatMap(value=>value.records);
const grouped=new Map();for(const record of records){const list=grouped.get(record.source_url)||[];list.push(record);grouped.set(record.source_url,list);}
const normalize=value=>String(value||'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9\u4e00-\u9fff]/g,'');
const checkedAt=new Date().toISOString(),out={},counts={urls:grouped.size,records:records.length,verified:0,unavailable:0,unverified:0};
const work=join(root,'qa','portable-link-audit');await mkdir(work,{recursive:true});
async function pdfText(bytes,index){
  if(!args.pdftotext)return '';
  const file=join(work,`source-${index}.pdf`);await writeFile(file,bytes);
  try{return await new Promise((ok,fail)=>{let text='';const child=spawn(args.pdftotext,['-enc','UTF-8',file,'-'],{windowsHide:true,timeout:15000});child.stdout.on('data',chunk=>{if(text.length<4000000)text+=chunk.toString('utf8');});child.stderr.resume();child.on('error',fail);child.on('close',code=>code===0?ok(text):fail(Error('PDF正文未读取')));});}finally{await rm(file,{force:true});}
}
async function inspect(url,list,index){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  let body='',httpStatus=null,finalUrl=url,status='unverified',reason='正文未核对';
  try{
    if(!/^https:\/\//.test(url))throw Error('未使用HTTPS');
    const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'StructureWorkbench-LinkAudit/1.0','Accept':'text/html,application/pdf'}});
    httpStatus=response.status;finalUrl=response.url;
    if(!response.ok){status='unavailable';reason=`HTTP ${response.status}`;await response.body?.cancel();}
    else{
      const reader=response.body.getReader(),chunks=[];let size=0;
      while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>12*1024*1024){await reader.cancel();throw Error('超过12MB核验上限');}chunks.push(next.value);}
      const bytes=Buffer.concat(chunks);
      if(bytes.subarray(0,5).toString()==='%PDF-')body=await pdfText(bytes,index);
      else{
        let charset=(response.headers.get('content-type')||'').match(/charset\s*=\s*([\w-]+)/i)?.[1];
        const ascii=bytes.subarray(0,4096).toString('latin1');charset||=ascii.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';
        try{body=new TextDecoder(charset).decode(bytes);}catch{body=bytes.toString('utf8');}
        body=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
      }
    }
  }catch(error){status='unavailable';reason=error.name==='AbortError'?'核验超时，不能判定长期失效':error.message;}finally{clearTimeout(timer);}
  for(const record of list){
    const text=normalize(body),code=normalize(record.code),title=normalize(record.title);
    const hasSpecificCode=code.length>=7&&/[0-9]/.test(code);
    const contentMatches=Boolean(text&&(hasSpecificCode?text.includes(code):title.length>=8&&text.includes(title)));
    const itemStatus=httpStatus===200&&contentMatches?'verified':status;
    const entry={source_url:url,url:finalUrl,status:itemStatus,contentMatches,checkedAt,httpStatus,matchedField:contentMatches?(hasSpecificCode?'code':'title'):null,matchedValue:contentMatches?(hasSpecificCode?record.code:record.title):null,reason:itemStatus==='verified'?'正文匹配具体规范编号（含年份）；无具体编号时匹配完整标题':reason};
    out[record.source_id]=entry;counts[itemStatus]++;
  }
}
const queue=[...grouped.entries()];let next=0;
await Promise.all(Array.from({length:concurrency},async()=>{while(next<queue.length){const index=next++,[url,list]=queue[index];await inspect(url,list,index);}}));
const payload={schema:1,checkedAt,note:'仅核验链接可访问及正文名称/编号；不等同规范有效性复核。超时、403、未匹配正文不显示链接，目录记录保留。',counts,records:out};
await writeFile(join(root,'data/portable-regulation-links.js'),'/* Release-time link audit; does not change regulation validity. */\nwindow.WorkbenchRegulationLinks = '+JSON.stringify(payload,null,2)+';\n','utf8');
await writeFile(join(work,'audit.json'),JSON.stringify(payload,null,2),'utf8');
console.log(JSON.stringify({checkedAt,...counts}));
