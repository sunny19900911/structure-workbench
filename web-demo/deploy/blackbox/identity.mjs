import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

// Runtime code only; no project documents, .env, credentials or QA files are read.
export async function sourceIdentity(root){
 const files=[];
 for(const folder of ['', 'server','deploy/portable','deploy/blackbox','deepseek-rewrite','design/parallel-review-20261109/geotech/pdf','design/parallel-review-20261109/geotech/ocr']){
  const entries=await readdir(join(root,folder),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const entry of entries)if(entry.isFile()&&/\.(mjs|js|py)$/.test(entry.name)&&!entry.name.includes('.test.'))files.push(join(folder,entry.name));
 }
 const hash=createHash('sha256');for(const file of files.sort()){hash.update(file.replaceAll('\\','/'));hash.update(await readFile(join(root,file)));}
 return hash.digest('hex');
}
