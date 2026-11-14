import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const qa=join(root,'qa/portable-release/calculation-cover-logo-20261113');
await mkdir(qa,{recursive:true});
const payload=JSON.parse(await readFile(join(root,'qa/portable-release/calculation-single-column-20261113/export-payload.json'),'utf8'));
for(const [name,company] of [['native-company','同济大学建筑设计研究院(集团)有限公司'],['other-company','QA设计单位'],['empty-company','']]){
 const response=await fetch('http://127.0.0.1:58727/api/calculation-book/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,company})});
 if(!response.ok)throw Error(await response.text());
 await writeFile(join(qa,name+'.docx'),Buffer.from(await response.arrayBuffer()));
}
console.log(qa);
