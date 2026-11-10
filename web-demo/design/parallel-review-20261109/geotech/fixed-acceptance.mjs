// Frozen private fixtures verify current composition, not whole-document OCR
// accuracy or readiness of the production upload entry point.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {detailedGeotech} from '../../../geotech-document.js';
const norm=v=>String(v??'').replace(/\s/g,'');
const sha=b=>createHash('sha256').update(b).digest('hex');

export function checkDocument(source,checks){
 if(!Array.isArray(checks)||!checks.length)throw Error('Nonempty frozen checks required');
 const doc=detailedGeotech(source),text=norm([doc.text,doc.foundationText,doc.antifloatText].join('\n'));
 return checks.map(c=>{
  const table=c.table?doc.tables.find(t=>t.key==='source-'+c.table):null;
  let pass=false;
  if(c.kind==='paragraph'){
   const p=source.blocks.paras[c.paragraph-1];pass=!!norm(p)&&text.includes(norm(p));
  }else if(c.kind==='table-retained'){
   pass=!!table&&isDeepStrictEqual(table.rawRows,source.blocks.tables[c.table-1]);
  }else if(c.kind==='cell'){
   const actual=table?.rawRows?.[c.row-1]?.[c.column-1];
   pass=actual!==undefined&&c.expected!==undefined&&norm(actual)===norm(c.expected);
  }else if(c.kind==='field'){
   const fields=table?.records?.find(r=>r.index===c.row-1)?.fields?.filter(f=>norm(f.label)===norm(c.label))||[];
   pass=fields.length===1&&c.expected!==undefined&&norm(fields[0].value)===norm(c.expected);
  }else if(c.kind==='text'||c.kind==='absent'){
   if(!norm(c.expected))throw Error('Empty text expectation');
   pass=c.kind==='text'?text.includes(norm(c.expected)):!text.includes(norm(c.expected));
  }else throw Error('Unknown check kind: '+c.kind);
  return {id:c.id,kind:c.kind,pass};
 });
}

export async function runManifest(manifestPath){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.schemaVersion!==1||!manifest.cases?.length)throw Error('Invalid fixed acceptance manifest');
 const ids=new Set(),cases=[];
 for(const c of manifest.cases){
  if(!c.id||ids.has(c.id))throw Error('Missing or duplicate case id');ids.add(c.id);
  try{
   const [original,artifact]=await Promise.all([readFile(c.original),readFile(c.source)]);
   if(sha(original)!==c.originalHash||sha(artifact)!==c.sourceArtifactHash)throw Error('Frozen input changed; re-review fixture');
   for(const reference of c.references||[]){
    if(sha(await readFile(reference.original))!==reference.hash)throw Error('Reference changed; re-review expected values');
   }
   const source=JSON.parse(artifact);
   if(source.hash!==c.originalHash)throw Error('Source does not belong to original');
   const checks=checkDocument(source,c.checks);
   cases.push({id:c.id,scope:c.scope,status:checks.every(x=>x.pass)?'pass':'fail',checks});
  }catch(e){cases.push({id:c.id,scope:c.scope,status:'fail',error:e.message});}
 }
 return {schemaVersion:1,stage:'current-composition-from-frozen-extraction',
  status:cases.every(c=>c.status==='pass')?'selected-checks-pass':'selected-checks-fail',
  wholeDocumentAccuracy:'not-measured',productionUpload:'not-tested',cases};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await runManifest(resolve(process.argv[2]));
 await writeFile(resolve(process.argv[3]),JSON.stringify(result,null,2));
 console.log(JSON.stringify({status:result.status,stage:result.stage,cases:result.cases.map(c=>({id:c.id,status:c.status,checks:c.checks?.length,error:c.error}))}));
 if(result.status!=='selected-checks-pass')process.exitCode=1;
}
