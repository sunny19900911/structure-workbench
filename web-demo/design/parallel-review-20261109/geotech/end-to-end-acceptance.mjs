// Original bytes -> current readers -> shared composer. Frozen extraction is
// only a source of reviewed expectations, never input to the current composer.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {readWordSource} from '../../../server/word-source.mjs';
import {readGeotechPdfSource} from '../../../server/geotech-pdf-source.mjs';
import {fragments} from '../../../intake-core.js';
import {composeDocument} from '../../../document-intake.js';
import {checkDocument} from './fixed-acceptance.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const norm=s=>String(s??'').replace(/\s/g,'');

export function checkFreshSource(source,frozen,checks){
 const stable=checks.map(c=>c.kind==='paragraph'?{...c,kind:'text',expected:frozen.blocks.paras[c.paragraph-1]}:c);
 const results=checkDocument(source,stable);
 for(const c of checks.filter(c=>c.kind==='table-retained')){
  results.push({id:c.id+'-parser',pass:isDeepStrictEqual(source.blocks.tables[c.table-1],frozen.blocks.tables[c.table-1])});
 }
 const document=composeDocument([source]);
 const final=norm([document.geotech.text,document.foundation].join('\n'));
 for(const c of stable.filter(c=>c.kind==='text'))results.push({id:c.id+'-shared-composer',pass:!!norm(c.expected)&&final.includes(norm(c.expected))});
 return {results,document};
}

export async function runEndToEnd(manifestFile,output,env=process.env){
 const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
 if(manifest.schemaVersion!==1||!manifest.cases?.length)throw Error('Nonempty frozen manifest required');
 await mkdir(output,{recursive:true});const results=[];
 for(const c of manifest.cases){
  if(!/^[a-z0-9-]+$/.test(c.id))throw Error('Invalid case id');
  const dir=join(output,c.id);await mkdir(dir,{recursive:true});
  try{
   const bytes=await readFile(c.original);if(hash(bytes)!==c.originalHash)throw Error('Original changed');
   for(const ref of c.references||[])if(hash(await readFile(ref.original))!==ref.hash)throw Error('Reference changed');
   const blocks=/\.pdf$/i.test(c.original)?await readGeotechPdfSource(bytes,basename(c.original),{...env,WORKBENCH_PDF_ARTIFACT_ROOT:dir}):
    await readWordSource(bytes,/\.doc$/i.test(c.original),basename(c.original),env);
   const source={slot:'geo',source_id:'CURRENT-geo-'+c.originalHash.slice(0,20),name:basename(c.original),hash:c.originalHash,blocks,fragments:fragments(blocks)};
   let checks,document;
   if(c.source){
    const frozenBytes=await readFile(c.source);if(hash(frozenBytes)!==c.sourceArtifactHash)throw Error('Frozen expectations changed');
    ({results:checks,document}=checkFreshSource(source,JSON.parse(frozenBytes),c.checks));
   }else{
    if(!c.ocrChecks?.length)throw Error('Missing OCR expectations');
    document=composeDocument([source]);
    checks=c.ocrChecks.map(check=>{const page=blocks.ocrReview?.pages.find(p=>p.page===check.page);return {id:check.id,pass:!!page&&norm(page.lines.map(l=>l.text).join(' ')).includes(norm(check.text))};});
    checks.push({id:'ocr-not-design-values',pass:blocks.ocrReview?.automaticAdoption===false});
   }
   checks.push({id:'original-unchanged',pass:hash(await readFile(c.original))===c.originalHash});
   await writeFile(join(dir,'source.json'),JSON.stringify(source));await writeFile(join(dir,'document.json'),JSON.stringify(document));
   results.push({id:c.id,status:checks.every(c=>c.pass)?'pass':'fail',checks,ocrStatus:blocks.ocrReview?.status,ocrPages:blocks.ocrReview?.pages.map(p=>p.page)||[]});
  }catch(e){results.push({id:c.id,status:'fail',error:e.message});}
  await writeFile(join(output,'results.json'),JSON.stringify({stage:'original-to-current-parser-to-shared-composer',cases:results},null,2));
  console.log(JSON.stringify({id:c.id,...results.at(-1),checks:results.at(-1).checks?.filter(c=>!c.pass)}));
 }
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const results=await runEndToEnd(resolve(process.argv[2]),resolve(process.argv[3]));
 if(results.some(c=>c.status!=='pass'))process.exitCode=1;
}
