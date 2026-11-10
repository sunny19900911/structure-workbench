// Explicitly paired historical references are evaluation targets only.
// Exact reuse checks do not measure paraphrases or full semantic coverage.
// Usage: node audit-reference-paragraphs.mjs private-manifest.json output.json
import {readFile,writeFile} from 'node:fs/promises';
import {detailedGeotech} from '../../../geotech-document.js';
import {referenceEvaluationScope} from './reference-evaluation-scope.mjs';
const manifest=JSON.parse(await readFile(process.argv[2],'utf8'));
const normalize=v=>String(v??'').replace(/\s/g,'');
const results=[];
for(const item of manifest){
 const source=JSON.parse(await readFile(item.source,'utf8')),reference=JSON.parse(await readFile(item.reference,'utf8'));
 const evaluationScope=referenceEvaluationScope(reference),excluded=new Set(evaluationScope.excludedParagraphs);
 if(item.joinSourceParagraphs&&source.blocks.paragraphMeta?.some(p=>p.sourceBoundary))throw new Error('Joined comparison requires a single source document');
 const offsets=[];let joined='';for(const p of source.blocks.paras){const start=joined.length;joined+=normalize(p);offsets.push({start,end:joined.length});}
 const document=detailedGeotech(source),output=normalize([document.text,document.foundationText,document.antifloatText].join('\n'));
 const checks=reference.blocks.paras.flatMap((text,index)=>{
  if(excluded.has(index+1))return [];
  if(text.length<=30)return [];
  let match=source.blocks.paras.findIndex(p=>normalize(p).includes(normalize(text))),end=match;
  if(match<0&&item.joinSourceParagraphs){
   const at=joined.indexOf(normalize(text));
   if(at>=0){match=offsets.findIndex(p=>p.end>at);end=offsets.findIndex(p=>p.end>=at+normalize(text).length);}
  }
  return match<0?[]:[{referenceParagraph:index+1,sourceParagraph:match+1,sourceParagraphEnd:end+1,text,present:output.includes(normalize(text))}];
 });
 const result={id:item.id,source_id:source.source_id,sourceHash:source.hash,reference_id:reference.source_id,scope:'reference paragraphs >30 characters contained verbatim in original source; whitespace ignored; quarantined ranges excluded',evaluationScope,joinedSourceParagraphs:!!item.joinSourceParagraphs,checks,matched:checks.length,retained:checks.filter(c=>c.present).length};
 results.push(result);console.log(JSON.stringify({id:item.id,matched:result.matched,retained:result.retained}));
}
await writeFile(process.argv[3],JSON.stringify(results,null,2));
