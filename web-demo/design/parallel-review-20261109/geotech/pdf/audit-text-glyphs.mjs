// Flag unresolved PDF character mappings without guessing their visible glyphs.
// This is not a complete formula-layout or semantic accuracy check.
export function auditTextGlyphs(text){
 const value=String(text??'');
 const unresolved=[...new Set([...value].filter(c=>{
  const n=c.codePointAt(0);
  return n===0xfffd||n>=0xe000&&n<=0xf8ff||n>=0xf0000&&n<=0xffffd||n>=0x100000&&n<=0x10fffd;
 }))].map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'));
 const cidTokens=[...new Set(value.match(/\(cid:\d+\)/g)||[])];
 return unresolved.length||cidTokens.length?{status:'review-required',reason:'unresolved-pdf-glyphs',codepoints:unresolved,cidTokens}:null;
}
