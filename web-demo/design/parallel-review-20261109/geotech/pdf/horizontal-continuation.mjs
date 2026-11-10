// Rejoin only adjacent column fragments of an explicit horizontal building
// schedule. Physical cell provenance, withheld values and raw fragments survive.
const label=v=>String(v??'').replace(/\s/g,'');
const edges=t=>[...new Set(t.cellOrigins.flat().filter(Boolean).flatMap(c=>[c.bbox[0],c.bbox[2]]))].sort((a,b)=>a-b).map(x=>(x-t.bbox[0])/(t.bbox[2]-t.bbox[0]));
export function joinHorizontalBuildingTables(first,next){
 if(first?.kind!=='table'||next?.kind!=='table'||first.page!==next.page||next.column!==first.column+1)return null;
 if(!first.gridExpanded||!next.gridExpanded||!first.cellOrigins||!next.cellOrigins)return null;
 if(!/^(?:拟建)?建筑物名称$/.test(label(first.rows[0]?.[0])))return null;
 if(!/^(?:基础持力层|建议持力层)$/.test(label(next.rows[0]?.[0])))return null;
 if(!next.rows.some(r=>/^(?:基础形式|建议基础形式)$/.test(label(r[0]))))return null;
 if(Math.abs((first.bbox[2]-first.bbox[0])-(next.bbox[2]-next.bbox[0]))>3)return null;
 const a=edges(first),b=edges(next),tolerance=.004;
 // A missing subdivision may lie inside a merged cell. Never warp distinct
 // existing boundaries to fit a different table or infer a split from values.
 if(a.length>b.length||a.some(x=>!b.some(y=>Math.abs(x-y)<=tolerance))||b.some((x,i)=>i&&x-b[i-1]<.025))return null;
 const rows=[],origins=[];
 for(const [fragment,t] of [first,next].entries()){
  for(let ri=0;ri<t.rows.length;ri++){
   const physical=[...new Map(t.cellOrigins[ri].filter(Boolean).map(c=>[c.bbox.join(','),c])).values()];
   const width=t.bbox[2]-t.bbox[0],row=[],sourceRow=[];
   for(let ci=0;ci<b.length-1;ci++){
    const x=t.bbox[0]+(b[ci]+b[ci+1])/2*width;
    const owners=physical.filter(c=>c.bbox[0]<x&&x<c.bbox[2]);
    if(owners.length!==1)return null;
    const origin=owners[0];row.push(origin.requiresReview?'':origin.text);
    sourceRow.push({...origin,fragment,page:t.page,column:t.column});
   }
   rows.push(row);origins.push(sourceRow);
  }
 }
 return {...first,rows,cellOrigins:origins,rawRows:[...first.rawRows,...next.rawRows],
  sourceFragments:[first,next],horizontalContinuation:true,
  numericBoundaryWarnings:[...(first.numericBoundaryWarnings||[]),...(next.numericBoundaryWarnings||[])],
  numericBoundaryResolutions:[...(first.numericBoundaryResolutions||[]),...(next.numericBoundaryResolutions||[])]};
}
export function restoreHorizontalContinuations(blocks){
 const result=[];
 for(const block of blocks){
  const joined=joinHorizontalBuildingTables(result.at(-1),block);
  if(joined)result[result.length-1]=joined;else result.push(block);
 }
 return result;
}
