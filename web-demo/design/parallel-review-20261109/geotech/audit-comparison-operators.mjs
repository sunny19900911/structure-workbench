// Audit explicitly paired passages. Reference differences never rewrite source facts.
export function comparisonConditions(text) {
 const normalized=String(text??'').replace(/\s+/g,'').replace(/≦/g,'≤').replace(/≧/g,'≥').replace(/＜/g,'<').replace(/＞/g,'>').replace(/≤/g,'<=').replace(/≥/g,'>=');
 return [...normalized.matchAll(/(<=|>=|<|>)([+-]?\d+(?:\.\d+)?)(kPa|MPa|mm|cm|m|%|％)?/g)]
  .map(m=>({operator:m[1],value:m[2],unit:m[3]==='％'?'%':m[3]||''}));
}
export function auditComparisonOperators(sourceText,referenceText,outputText) {
 const source=comparisonConditions(sourceText),reference=comparisonConditions(referenceText),output=comparisonConditions(outputText);
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 return {source,reference,output,sourceOutput:!source.length?'no-source-condition':equal(source,output)?'preserved':'needs-output-review',
  sourceReference:!source.length&&!reference.length?'no-condition':equal(source,reference)?'equivalent-conditions':'source-reference-difference',automaticAdoption:false};
}
