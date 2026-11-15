// Format only recognized seismic intensity values; never edit free-form prose.
export function intensityNumberText(value){
 const text=String(value??'').trim();
 const match=text.match(/^([6-9ⅥⅦⅧⅨ])(?:\s*度)?$/);
 return match?match[1]:text;
}
export function intensityDisplay(value){
 const text=intensityNumberText(value);
 return /^[6-9ⅥⅦⅧⅨ]$/.test(text)?text+'度':text;
}
