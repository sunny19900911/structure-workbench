// Private inputs/results are passed at runtime; never commit their contents.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {readWordSource} from '../../../server/word-source.mjs';
import {fragments} from '../../../intake-core.js';
import {composeDocument} from '../../../document-intake.js';
import {readGeotechPdf} from '../../../geotech-pdf.js';
const manifest=JSON.parse(await readFile(process.argv[2],'utf8')),out=resolve(process.argv[3]);await mkdir(out,{recursive:true});
const results=[];
for(const item of manifest){
 const bytes=await readFile(item.input),hash=createHash('sha256').update(bytes).digest('hex');let blocks;
 if(/\.pdf$/i.test(item.input)){
  const lib=createRequire(import.meta.url)(resolve(process.env.QA_PDFJS));
  lib.GlobalWorkerOptions.workerSrc=resolve(process.env.QA_PDF_WORKER);
  blocks=await readGeotechPdf(lib,{arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
 }else blocks=await readWordSource(bytes,/\.doc$/i.test(item.input),basename(item.input));
 const source={slot:'geo',source_id:'CURRENT-geo-'+hash.slice(0,20),hash,name:basename(item.input),blocks,fragments:fragments(blocks)};
 const document=composeDocument([source]);
 await writeFile(join(out,item.id+'-source.json'),JSON.stringify(source));
 await writeFile(join(out,item.id+'-document.json'),JSON.stringify(document,null,2));
 await writeFile(join(out,item.id+'-text.txt'),document.geotech.text+'\n\n'+document.foundation);
 const result={...item,inputHash:hash,paras:blocks.paras.length,tables:blocks.tables.length,sections:document.geotech.sections?.map(s=>({paragraph:s.index+1,title:s.title,destination:s.active})),soilRows:document.geotech.tables.find(t=>t.key==='strength')?.rows.length-1||0,pdf:blocks.pdfReadReport,warnings:blocks.warnings};
 results.push(result);console.log(JSON.stringify({id:item.id,paras:result.paras,tables:result.tables,soilRows:result.soilRows,pdf:result.pdf,warnings:result.warnings}));
}
await writeFile(join(out,'evaluation.json'),JSON.stringify(results,null,2));
