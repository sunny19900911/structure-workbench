// Evaluation-only quarantine. Never edits an original report or source facts.
const rule = {
 referenceId:'REFERENCE-0625e3734084a973a6af',
 expectedOriginalSha256:'0625e3734084a973a6afb057b70100d214aabe2a996809b4c199f54f4c3f6462',
 paragraphCount:396,
 start:382,end:396,
 source_id:'QA-REFERENCE-SCOPE-20261110-R118',
 reason:'Chapter 12 has groundwater/lithology inconsistent with this project and matching another supplied project; pending source review.'
};
const norm=value=>String(value??'').replace(/\s/g,'');

export function referenceEvaluationScope(reference){
 if(reference.source_id!==rule.referenceId)return {excludedParagraphs:[],quarantines:[]};
 const paras=reference.blocks?.paras;
 if(!Array.isArray(paras)||paras.length!==rule.paragraphCount
    ||norm(paras[rule.start-1])!=='12.基坑支护设计'
    ||!norm(paras[392]).includes('1907.59m～1902.02m')){
  throw new Error('Registered reference scope is stale; review paragraph boundaries before scoring');
 }
 return {excludedParagraphs:Array.from({length:rule.end-rule.start+1},(_,i)=>rule.start+i),
  quarantines:[{...rule,status:'pending-source-review'}]};
}
