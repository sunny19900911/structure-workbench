// Explicit, same-scope QA association; no filename-based matching or production upload hook.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fragments} from '../../../intake-core.js';
import {composeDocument} from '../../../document-intake.js';
const manifest=JSON.parse(await readFile(process.argv[2],'utf8')),out=resolve(process.argv[3]);
if(!manifest.scope||!manifest.associationEvidence||manifest.members.length<2)throw Error('Explicit scope and association evidence required');
const blocks={paras:[],paragraphMeta:[],tables:[],tableMeta:[],ordered:[],images:[],warnings:[]},members=[],seen=new Set();
for(const entry of manifest.members){
 if(entry.scope!==manifest.scope)throw Error('Different scopes cannot be associated');
 const source=JSON.parse(await readFile(entry.source,'utf8'));
 const bytes=await readFile(entry.input),hash=createHash('sha256').update(bytes).digest('hex');
 if(hash!==source.hash||seen.has(hash))throw Error('Source hash mismatch or duplicate input');seen.add(hash);
 const b=source.blocks,pOffset=blocks.paras.length,tOffset=blocks.tables.length;
 if(!b.ordered?.length)throw Error('Ordered blocks required');
 const origin={source_id:source.source_id,hash,name:source.name,member:entry.member};
 members.push({...origin,input:entry.input,scope:entry.scope});
 const boundary=blocks.paras.length;blocks.paras.push('');blocks.paragraphMeta.push({sourceBoundary:true});blocks.ordered.push({type:'p',index:boundary});
 b.paras.forEach((p,i)=>{blocks.paras.push(p);blocks.paragraphMeta.push({...b.paragraphMeta?.[i],sourceOrigin:{...origin,locator:'提取段落 '+(i+1)}});});
 b.tables.forEach((t,i)=>{blocks.tables.push(t);const meta={...b.tableMeta?.[i],sourceOrigin:{...origin,locator:'提取表 '+(i+1)}};if(Number.isInteger(meta.continuationOf))meta.continuationOf+=tOffset;blocks.tableMeta.push(meta);});
 for(const item of b.ordered){if(item.type==='p')blocks.ordered.push({...item,index:item.index+pOffset+1});else if(item.type==='table')blocks.ordered.push({...item,index:item.index+tOffset});}
 blocks.images.push(...(b.images||[]).map(i=>({...i,sourceOrigin:origin})));
 blocks.warnings.push(...(b.warnings||[]));
}
// Native geometry-reflowed paragraphs must not be split again simply because a member is PDF.
blocks.pdfReadReport={paragraphsReflowed:true};
const hash=createHash('sha256').update(JSON.stringify({scope:manifest.scope,members:members.map(m=>m.hash)})).digest('hex');
const source={slot:'geo',source_id:'GEO-SET-'+hash.slice(0,20),hash,name:manifest.name,blocks,fragments:fragments(blocks),sourceSet:{scope:manifest.scope,evidence:manifest.associationEvidence,members}};
await mkdir(out,{recursive:true});
await writeFile(join(out,'bundle.json'),JSON.stringify({sources:[source],facts:[],unmapped:[],issues:[],confirmations:[]}));
await writeFile(join(out,'document.json'),JSON.stringify(composeDocument([source]),null,2));
await writeFile(join(out,'source-set.json'),JSON.stringify(source.sourceSet,null,2));
console.log(JSON.stringify({members:members.length,paragraphs:blocks.paras.length,tables:blocks.tables.length,hash}));
