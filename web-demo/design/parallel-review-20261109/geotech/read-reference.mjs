// Read-only reference inventory. Never feeds historical design values into intake.
// Usage: node read-reference.mjs <reference-root> <private-output-directory>
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {readWordSource} from '../../../server/word-source.mjs';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);
await mkdir(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(dir){const list=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())list.push(...await files(p));else list.push(p);}return list;}
const inventory=[];
for(const path of await files(root)){
 const bytes=await readFile(path),hash=sha(bytes),id='REFERENCE-'+hash.slice(0,20);
 const item={source_id:id,path,relativePath:relative(root,path),sha256:hash,role:'historical_design_reference',read:false};
 if(/\.docx?$/i.test(path)){
  try{
   const blocks=await readWordSource(bytes,/\.doc$/i.test(path),basename(path));
   // Keep image locations/captions, not another copy of the embedded artwork.
   blocks.images=(blocks.images||[]).map(({data,...meta})=>meta);
   await writeFile(join(out,id+'.json'),JSON.stringify({source_id:id,role:item.role,name:basename(path),blocks}));
   Object.assign(item,{read:true,paragraphs:blocks.paras.length,tables:blocks.tables.length,warnings:blocks.warnings});
  }catch(error){item.error=error.message;}
 }
 item.unchanged=sha(await readFile(path))===hash;
 inventory.push(item);await writeFile(join(out,'inventory.json'),JSON.stringify(inventory,null,2));
 console.log(JSON.stringify({name:basename(path),read:item.read,paragraphs:item.paragraphs,tables:item.tables,unchanged:item.unchanged,error:item.error}));
}
