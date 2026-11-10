// Private source/reference pairs only. A historical design is an evaluation
// target, never a current-project intake source. Freeze the committed parser
// to compare extraction changes with exactly the same input blocks.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {detailedGeotech} from '../../../geotech-document.js';
const root=resolve(process.argv[2]),manifest=JSON.parse(await readFile(join(root,'comparison-manifest.json'),'utf8'));
const baseline=join(root,'baseline');await mkdir(baseline,{recursive:true});
const app=resolve(import.meta.dirname,'../../..');
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const name of ['geotech-document.js','geotech-tables.js','geotech-numbered-sections.js']){
 let code=execFileSync('git',['show',revision+':web-demo/'+name],{encoding:'utf8'});
 code=code.replaceAll("'./intake-structure.js'",JSON.stringify(pathToFileURL(join(app,'intake-structure.js')).href));
 await writeFile(join(baseline,name),code);
}
const old=(await import(pathToFileURL(join(baseline,'geotech-document.js')).href)).detailedGeotech;
const norm=v=>String(v??'').replace(/\s+/g,'');
const layer=v=>norm(v).match(/^[①-⑳]\d*(?:[-－]\d+)*/)?.[0];
const results=[];
for(const item of manifest){
 const source=JSON.parse(await readFile(item.source,'utf8')),reference=JSON.parse(await readFile(item.reference,'utf8'));
 const before=old(source),after=detailedGeotech(source),wanted=reference.blocks.tables[item.referenceTable-1];
 const result={id:item.id,baselineRevision:revision,source_id:source.source_id,reference_id:reference.source_id,referenceTable:item.referenceTable};
 if(item.kind==='source-table'){
  const rows=source.blocks.tables[item.sourceTable-1];
  result.sourceTable=item.sourceTable;result.sameShape=rows.length===wanted.length&&rows.every((r,i)=>r.length===wanted[i].length);
  result.checks=wanted.flatMap((r,ri)=>r.map((v,ci)=>({row:ri+1,column:ci+1,expected:v,actual:rows[ri]?.[ci],pass:norm(v)===norm(rows[ri]?.[ci])})));
  result.beforeRetained=before.tables.some(t=>t.key==='source-'+item.sourceTable);
  result.afterRetained=after.tables.some(t=>t.key==='source-'+item.sourceTable);
 }else{
  const check=doc=>{
   const actual=doc.tables.find(t=>t.key==='strength')?.rows.slice(1)||[];
   return wanted.slice(item.headerRows).flatMap(row=>item.columns.map(({reference:ri,actual:ai,name})=>{
    const match=actual.find(r=>layer(r[0])===layer(row[0]));
    return {layer:layer(row[0]),name,expected:row[ri],actual:match?.[ai]??'',pass:norm(row[ri])===norm(match?.[ai]),conflict:!!match?.[0].includes('冲突')};
   }));
  };
  result.beforeChecks=check(before);result.checks=check(after);
  result.beforeCorrect=result.beforeChecks.filter(c=>c.pass).length;
 }
 result.correct=result.checks.filter(c=>c.pass).length;result.checked=result.checks.length;
 results.push(result);await writeFile(join(root,item.id+'-latest-document.json'),JSON.stringify(after,null,2));
 console.log(JSON.stringify({id:result.id,beforeCorrect:result.beforeCorrect,correct:result.correct,checked:result.checked,beforeRetained:result.beforeRetained,afterRetained:result.afterRetained}));
}
await writeFile(join(root,'final-reference-checks.json'),JSON.stringify(results,null,2));
