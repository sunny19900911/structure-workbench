// Explicit OUT case identity comes before numeric envelopes. No unknown direction defaults to X.
export function displacementCase(description) {
 const text=String(description||'').trim();
 if(/斜交|角度|[\d.]\s*(?:°|度)/.test(text))return null;
 const direction=/^([+-]?)([XY])([+-]?)\s*(?:方向|向)?\s*/i.exec(text);
 if(!direction)return null;
 const tail=text.slice(direction[0].length);
 const kind=/规定水平力/.test(tail)?'dlf':/风荷载/.test(tail)?'wind':/双向地震/.test(tail)?'bi':/地震/.test(tail)?'eq':null;
 if(!kind)return null;
 return {axis:direction[2].toLowerCase(),kind,eccentric:/偶然偏心/.test(tail)||Boolean(direction[1]||direction[3])};
}
const floorValue=(value,floor)=>value&&floor!==undefined&&floor!==''?`${value}（${floor} 层）`:String(value??'');
export function withFloor(value,floor){return /[（(][^）)]*层/.test(String(value))?String(value):floorValue(value,floor);}
export function translationComponents(period,fallback='') {
 return period?.x!==undefined&&period?.y!==undefined?`(${period.x} + ${period.y})`:String(period?.tr??fallback);
}
export function parseDisplacementResults(source) {
 const groups={},cases=[],segments=String(source||'').split(/={3,}\s*工况\s*(\d+)\s*={3,}\s*/);
 const ratios={X:new Map(),Y:new Map()};
 for(let i=1;i<segments.length;i+=2){
  const segment=segments[i+1]||'',description=segment.split(/\r?\n/)[0].trim(),identity=displacementCase(description);
  if(!identity)continue;
  const {kind,axis,eccentric}=identity,key=kind+'_'+axis+(eccentric?'_e':'');
  const drift=/最大层间位移角\s*[:：]\s*1\s*\/\s*(\d+)\s*[（(]\s*(-?\d+)\s*层/.exec(segment);
  const ratio=/最大层间位移与平均层间位移的比值\s*[:：]\s*([\d.]+)\s*[（(]\s*(-?\d+)\s*层/.exec(segment);
  const entry={id:segments[i],description,...identity,den:drift?Number(drift[1]):null,floor:drift?.[2],ratio:ratio?.[1],ratioFloor:ratio?.[2]};cases.push(entry);
  (groups[key]??=[]).push(entry);
  if(kind==='dlf'&&eccentric){
   const map=ratios[axis.toUpperCase()],lines=segment.split(/\r?\n/);
   for(let j=0;j<lines.length-1;j++){
    const first=/^\s*(-?\d+)\s+1\s+\d+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+\d+\s*$/.exec(lines[j]);
    const second=/^\s*\d+\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$/.exec(lines[j+1]);
    if(first&&second){const floor=Number(first[1]),r=Number(second[3]);if(!map.has(floor)||r>map.get(floor))map.set(floor,r);}
   }
  }
 }
 const result={displacementCases:cases,ratios:Object.fromEntries(Object.entries(ratios).map(([axis,map])=>[axis,[...map].map(([floor,r])=>({floor,r})).sort((a,b)=>a.floor-b.floor)]))};
 const largestDrift=items=>items.filter(x=>x.den>0).reduce((a,b)=>!a||b.den<a.den?b:a,null);
 for(const axis of ['x','y']){
  for(const kind of ['eq','bi','wind']){
   const entry=largestDrift(groups[kind+'_'+axis]||[]);result['drift_'+kind+'_'+axis]=entry?floorValue('1/'+entry.den,entry.floor):'';
  }
  const entry=largestDrift([...(groups['eq_'+axis]||[]),...(groups['bi_'+axis]||[])]);
  result['drift_env_'+axis]=entry?floorValue('1/'+entry.den,entry.floor):'';
  const eccentric=largestDrift(groups['eq_'+axis+'_e']||[]);
  result['drift_ecc_'+axis]=eccentric?floorValue('1/'+eccentric.den,eccentric.floor):'';
  const rows=result.ratios[axis.toUpperCase()];
  const summary=(groups['dlf_'+axis+'_e']||[]).filter(x=>x.ratio).map(x=>({r:Number(x.ratio),floor:Number(x.ratioFloor)}));
  if(!rows.length)result.ratios[axis.toUpperCase()]=summary;
  const ratio=(rows.length?rows:summary).reduce((a,b)=>!a||b.r>a.r?b:a,null);
  result['disp_ratio_'+axis]=ratio?ratio.r.toFixed(2):'';result['disp_ratio_'+axis+'_floor']=ratio?String(ratio.floor):'';
 }
 return result;
}
export function correctModelResults(metrics,files=[],log=null) {
 const periods=files.find(f=>/WZQ/i.test(f.name||''));
 if(periods){
  const rows=[];
  for(const line of periods.text.split(/\r?\n/)){
   const match=/^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*[（(]\s*([\d.]+)\s*\+\s*([\d.]+)\s*[）)]\s+([\d.]+)\s*$/.exec(line);
   if(!match)continue;if(rows.length&&Number(match[1])===1)break;
   rows.push({n:Number(match[1]),T:match[2],ang:match[3],tr:match[4],x:match[5],y:match[6],tor:match[7]});
  }
  if(rows.length)metrics.periods=rows;
 }
 const source=files.find(f=>/WDISP/i.test(f.name||''))||files.find(f=>/最大层间位移角/.test(f.text||''));
 if(source){
  Object.assign(metrics,parseDisplacementResults(source.text));
  if(Array.isArray(log)){
   for(let i=log.length-1;i>=0;i--)if(/^(地震位移角包络|逐层位移比已读取)/.test(log[i]))log.splice(i,1);
   log.push('地震位移角（本向及本向双向地震，不含偶偏和斜向）X '+(metrics.drift_env_x||'未读取')+' / Y '+(metrics.drift_env_y||'未读取'));
   log.push('偶然偏心规定水平力位移比 X '+(withFloor(metrics.disp_ratio_x,metrics.disp_ratio_x_floor)||'未读取')+' / Y '+(withFloor(metrics.disp_ratio_y,metrics.disp_ratio_y_floor)||'未读取'));
  }
 }
 return metrics;
}
if(typeof window!=='undefined')window.WorkbenchModelResults={correctModelResults};
