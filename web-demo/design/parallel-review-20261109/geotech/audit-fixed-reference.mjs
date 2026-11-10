// Compare a verified reference pair without calling every unresolved source
// conflict an extraction error. This audit never modifies intake or fills data.
import {readFile,writeFile} from 'node:fs/promises';
import {detailedGeotech} from '../../../geotech-document.js';
const norm=v=>String(v??'').replace(/\s/g,'');
const layer=v=>norm(v).match(/^[①-⑳]\d*(?:[-－]\d+)*/)?.[0];
export function classifyReferenceCell(expected,actual,provenance){
 if(norm(expected)===norm(actual))return 'exact-match';
 if(provenance?.conflict)return 'unresolved-source-conflict';
 if(norm(expected)==='/'&&!norm(actual))return 'unspecified-value-format';
 return 'needs-source-review';
}
export function auditFixedReference(source,reference,item){
 const table=detailedGeotech(source).tables.find(t=>t.key==='strength');
 const wanted=reference.blocks.tables[item.referenceTable-1],checks=[];
 for(const [offset,row] of wanted.slice(item.headerRows).entries()){
  const id=layer(row[0]);
  const matches=(table?.rows||[]).map((r,index)=>({row:r,index})).filter(x=>id&&layer(x.row[0])===id);
  for(const column of item.columns){
   const match=matches.length===1?matches[0]:null,actual=match?.row[column.actual]??'';
   const provenance=match?table.rowSources?.[match.index]:null;
   checks.push({layer:id,field:column.name,expected:row[column.reference],actual,
    classification:matches.length>1?'ambiguous-output-rows':classifyReferenceCell(row[column.reference],actual,provenance),
    referenceLocator:`表 ${item.referenceTable} 行 ${item.headerRows+offset+1} 列 ${column.reference+1}`,
    outputLayer:match?.row[0]||'',provenance,
    sourceRows:(provenance?.references||[]).map(r=>({table:r.table,row:r.row,
      cells:source.blocks.tables[r.table-1]?.[r.row-1]}))});
  }
 }
 const counts={};for(const c of checks)counts[c.classification]=(counts[c.classification]||0)+1;
 return {id:item.id,source_id:source.source_id,reference_id:reference.source_id,
  scope:'selected fixed fields; exact matches, representation differences and unresolved conflicts reported separately',
  counts,checks,automaticAdoption:false};
}
if(process.argv[1]?.endsWith('audit-fixed-reference.mjs')){
 const manifest=JSON.parse(await readFile(process.argv[2],'utf8')),results=[];
 for(const item of manifest.filter(x=>x.kind==='fixed-parameters')){
  const source=JSON.parse(await readFile(item.source,'utf8')),reference=JSON.parse(await readFile(item.reference,'utf8'));
  const result=auditFixedReference(source,reference,item);results.push(result);console.log(JSON.stringify({id:item.id,counts:result.counts}));
 }
 await writeFile(process.argv[3],JSON.stringify(results,null,2));
}
