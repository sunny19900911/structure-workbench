import {tableRecords,blockTableRecords} from './intake-structure.js';

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const label=v=>clean(v).replace(/\s/g,'');
const soilNameKey=v=>label(v).replace(/粘/g,'黏');
const layer=/^(?:土层编号|地层编号|层序号?|层号|层次)$/;
const soil=/土层名称|岩土层?名称|地层名称|^(?:岩土层|岩层)及编号$|(?:土层|岩土|地层)代号及名称|^指标地层$|^土名$/;
const note=v=>/^(?:注|说明|备注)[:：]/.test(clean(v));
const value=(r,re)=>{
 const fields=r.fields.filter(c=>re.test(label(c.label))&&c.value);
 return fields.length===1?fields[0].value:'';
};
const unitKpa=/kpa/i;
// A corrosion matrix can change its column meanings below the ion block.
// Use explicit Word cell spans; never carry ion headers into pH/Cl rows.
export function geotechCorrosionMatrixRecords(rows,meta){
 if(label(rows[0]?.[0])!=='场地环境类型'||label(rows[1]?.[0])!=='腐蚀介质'
   ||!/^介质含量/.test(label(rows[2]?.[0]))||label(rows[3]?.[0])!=='腐蚀等级'
   ||!rows.slice(4).some(r=>/^PH值$/i.test(label(r[0])))||meta?.rows?.length!==rows.length)return null;
 const width=rows[0].length,physical=[];
 for(const [ri,row] of rows.entries()){
  if(row.length!==width)return null;
  const cells=meta.rows[ri]?.cells;if(!Array.isArray(cells))return null;
  const coverage=Array(width).fill(false),values=[];
  for(const cell of cells){
   const {column,span}=cell;
   if(!Number.isInteger(column)||!Number.isInteger(span)||column<0||span<1||column+span>width)return null;
   const text=cell.verticalMerge==='continue'&&ri>0?clean(rows[ri-1][column]):clean(cell.text);
   for(let col=column;col<column+span;col++){
    if(coverage[col]||clean(row[col])!==text)return null;coverage[col]=true;
   }
   values.push({column,span,text});
  }
  if(coverage.some(v=>!v)||values[0]?.column!==0||values[0].span!==1)return null;
  physical.push(values);
 }
 const ions=physical[1].slice(1),records=[];
 const field=(path,cell)=>({path,label:path.join(' / '),value:cell.text,mapped:true,sourceColumn:cell.column,sourceSpan:cell.span});
 for(let ri=0;ri<rows.length;ri++){
  if(ri===1)continue;
  const cells=physical[ri],rowLabel=cells[0].text,data=cells.slice(1);let fields;
  if(ri===2||ri===3){
   if(data.length!==ions.length||data.some((c,i)=>c.column!==ions[i].column||c.span!==ions[i].span))return null;
   fields=data.map((c,i)=>field([rowLabel,ions[i].text],c));
  }else if(data.length===1){
   fields=[field([rowLabel],data[0])];
  }else if(data.length===2&&(/^(?:PH值)$/i.test(label(rowLabel))||/Cl.*含量/i.test(label(rowLabel)))
    &&/^[ABC](?:[（(][^）)]*透水[^）)]*[）)])?$/.test(label(data[0].text))
    &&/^\d+(?:\.\d+)?(?:[～~－—-]\d+(?:\.\d+)?)?$/.test(label(data[1].text))){
   fields=[field([rowLabel,'评价条件'],data[0]),field([rowLabel],data[1])];
  }else return null;
  records.push({index:ri,kind:'table_row',cells:rows[ri],fields,unit:'',row_key:rowLabel,
   text:fields.map(c=>c.label+'：'+c.value).join('；'),columnMeaning:'row-local'});
 }
 return records;
}
export function geotechPermeabilityRecords(rows){
 const header=rows[0]?.map(label)||[];
 const name=header.findIndex(c=>/^(?:岩土|土层|地层)名称$/.test(c));
 const coefficient=header.findIndex(c=>/^渗透系数(?:[（(](?:m\/d|m\/s|cm\/s)[）)])?$/.test(c));
 if(name<0||coefficient<0||rows.length<2)return null;
 const quantity='[+]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[～~－—-](?:\\d+(?:\\.\\d+)?|\\.\\d+))?';
 const headerUnit=/[（(](?:m\/d|m\/s|cm\/s)[）)]$/.test(header[coefficient]);
 const valuePattern=new RegExp('^'+quantity+(headerUnit?'(?:m/d|m/s|cm/s)?':'(?:m/d|m/s|cm/s)')+'$');
 if(!rows.slice(1).every(r=>note(r[0])||label(r[name])&&valuePattern.test(label(r[coefficient]))))return null;
 return rows.slice(1).map((cells,i)=>{
  if(note(cells[0]))return {index:i+1,kind:'table_note',cells,fields:[],unit:'',text:[...new Set(cells.map(clean).filter(Boolean))].join('；')};
  const fields=cells.map((v,c)=>({path:[clean(rows[0][c])],label:header[c],value:clean(v),mapped:!!header[c]}));
  return {index:i+1,kind:'table_row',cells,fields,unit:'',row_key:clean(cells[name]),text:fields.filter(c=>c.value).map(c=>c.label+'：'+c.value).join('；')};
 });
}
export function geotechCorrosionRecords(rows,meta){
 const header=rows[0]?.map(label)||[],column=header.findIndex(c=>/含量/.test(c));
 if(!header.some(c=>/腐蚀/.test(c)))return null;
 // Limit rows beginning with inequalities are data, not another header tier.
 // Require the explicit corrosion criterion label and a measured sample body;
 // ordinary comparison symbols in a header do not establish this boundary.
 const criterion=rows.findIndex((r,i)=>i>0&&r.some(c=>/^(?:《[^》]*(?:规范|标准)[^》]*》|规范|标准).*腐蚀性(?:规定|限值)$/.test(label(c)))
  &&r.filter(c=>/^[<>≤≥＜＞][+-]?\d+(?:\.\d+)?$/.test(label(c))).length>=2);
 const sample=rows.some((r,i)=>i>criterion&&r.some(c=>/^(?:水样|土样)$/.test(label(c)))&&r.filter(c=>/^[+-]?\d+(?:\.\d+)?$/.test(label(c))).length>=2);
 // A result-only schedule can contain identifiers and corrosion grades but
 // no numeric measurements. Do not swallow its entire body as header rows.
 const sampleColumn=header.findIndex(c=>/^(?:试样|样品|取样)编号$/.test(c));
 const typeColumn=header.findIndex(c=>/^(?:类型|介质类型|水土类型)$/.test(c));
 const gradeColumns=header.flatMap((c,i)=>/腐蚀/.test(c)?[i]:[]);
 const gradeStart=sampleColumn>=0&&typeColumn>=0?rows.findIndex((r,i)=>i>0
  &&/^[A-Za-z][A-Za-z0-9－-]*\d[A-Za-z0-9－-]*$/.test(label(r[sampleColumn]))&&label(r[typeColumn])
  &&gradeColumns.length>0&&gradeColumns.every(c=>/^(?:微|弱|中等|强)(?:腐蚀(?:性)?)?$/.test(label(r[c])))):-1;
 if(column<0&&!(criterion>0&&sample)&&gradeStart<1)return null;
 const numeric=v=>{
  const parts=label(v).split(/[（）()]/).filter(Boolean);
  return parts.length>0&&parts.every(p=>/^[+-]?\d+(?:\.\d+)?(?:[～~—－-][+-]?\d+(?:\.\d+)?)?$/.test(p));
 };
 const start=gradeStart>0?gradeStart:criterion>0&&sample?criterion:rows.findIndex((r,i)=>i>0&&numeric(r[column]));if(start<1)return null;
 const paths=Array.from({length:rows[0].length},(_,c)=>[...new Set(rows.slice(0,start).map(r=>clean(r[c])).filter(Boolean))]);
 return rows.slice(start).map((cells,offset)=>{
  let fields=cells.map((v,c)=>({path:paths[c]||[],label:(paths[c]||[]).join(' / '),value:clean(v),mapped:!!paths[c]?.length}));
  // Collapse only an explicitly merged horizontal cell with identical meaning.
  // Equal readings under different exposure headers remain separate facts.
  const ri=start+offset,spans=[];
  if(meta?.cellOrigins?.[ri]?.length===cells.length){
   const origins=meta.cellOrigins[ri];
   for(let c=0;c<cells.length;){
    const o=origins[c],box=o?.bbox;
    if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[0]>=box[2]||box[1]>=box[3]
      ||!Number.isInteger(o.row)||o.row<0||o.row>ri||o.column!==c){c++;continue;}
    let end=c+1;
    while(end<cells.length&&origins[end]?.row===o.row&&origins[end]?.column===c
      &&JSON.stringify(origins[end]?.bbox)===JSON.stringify(box))end++;
    if(end>c+1&&origins.slice(c,end).every(x=>clean(x.text)===clean(cells[c])&&!x.requiresReview))spans.push([c,end]);
    c=end;
   }
  }
  const skip=new Set();
  for(const [from,to] of spans){
   if(fields.slice(from,to).every(f=>f.label===fields[from].label&&f.value===fields[from].value)){
    for(let c=from+1;c<to;c++)skip.add(c);
   }
  }
  fields=fields.filter((_,c)=>!skip.has(c));
  return {index:start+offset,kind:'table_row',cells,fields,unit:'',row_key:clean(cells[0]),text:fields.filter(c=>c.value).map(c=>c.label+'：'+c.value).join('；')};
 });
}
const fields={
 weight:c=>/重度/.test(c)&&/kN[/／]m[³3]/i.test(c),
 compression:c=>/(?:压缩模量)?Es0[.．]1(?:--?|[～~])0[.．]2/i.test(c)&&/MPa/i.test(c)&&!/(?:Eo|E0|变形模量)/i.test(c),
 bearing:c=>/承载力(?:建议)?特征值|fak/i.test(c)&&unitKpa.test(c)&&!/桩|[qｑ][pｐ]/i.test(c),
 side:c=>/侧阻力|qsik/i.test(c)&&unitKpa.test(c),
 end:c=>/端阻力|qpk/i.test(c)&&unitKpa.test(c)
};

// Keep report tables and their conditions independently. Fixed template slots
// only receive uniquely labelled values; table titles are not adopted values.
export function geotechTables(source,numbered,unit='项目整体'){
 const blocks=source.blocks||{},tableEvidence=[],texts=Array.from({length:14},()=>[]),tables=[],soilRows=new Map();
 for(const [index,rawRows] of (blocks.tables||[]).entries()){
  const position=(blocks.ordered||[]).findIndex(b=>b.type==='table'&&b.index===index);
  const before=position<0?null:blocks.ordered.slice(0,position).findLast(b=>b.type==='p');
  const bucket=before?numbered?.paragraphBuckets?.[before.index]:undefined;
  const caption=before?clean(blocks.paras[before.index]):'';
  const pileEstimate=/单桩.*估算|桩基估算/.test(caption);
  if(bucket===-1)continue;
  if(!numbered&&before&&blockTableRecords(blocks,index).every(r=>['requirement','toc'].includes(r.kind)))continue;
  let rows=rawRows,meta=blocks.tableMeta?.[index];
  let inheritedHeaders=0;
  const predecessor=Number.isInteger(meta?.continuationOf)&&meta.continuationOf<index?tables.find(t=>t.key==='source-'+(meta.continuationOf+1)):null;
  if(predecessor){
   const start=Math.min(...predecessor.records.filter(r=>r.kind==='table_row').map(r=>r.index+(predecessor.inheritedHeaders||0)));
   const headers=predecessor.rows.slice(0,start);
   const sameHeader=headers.length&&headers.every((r,i)=>r.every((v,c)=>label(v)===label(rawRows[i]?.[c])));
   if(headers.length&&!sameHeader&&rawRows.every(r=>r.length===headers[0].length)){
    inheritedHeaders=headers.length;rows=[...headers,...rawRows];meta={};
   }
  }
  const transposedSite=/^(?:孔号|钻孔(?:编号|号)?)$/.test(label(rows[0]?.[0]))&&rows[0].length>1
   &&rows[0].slice(1).every(v=>/^(?:[A-Za-z]{1,8}[-－]?\d+(?:[-－]\d+)*|\d+#?)$/.test(label(v)))
   &&rows.filter(r=>!note(r[0])).every(r=>r.length===rows[0].length)
   &&rows.slice(1).some(r=>/等效剪切波速/.test(label(r[0])))&&rows.slice(1).some(r=>/场地类别/.test(label(r[0])));
  const transposedBuilding=/^(?:拟建)?建筑物名称$/.test(label(rows[0]?.[0]))&&rows[0].length>1
   &&rows[0].slice(1).every(v=>clean(v))&&rows.filter(r=>!note(r[0])).every(r=>r.length===rows[0].length)
   &&rows.slice(1).some(r=>/^(?:基础持力层|建议持力层)$/.test(label(r[0])))
   &&rows.slice(1).some(r=>/^(?:基础形式|建议基础形式)$/.test(label(r[0])));
  const transposedPile=bucket===12&&pileEstimate&&rows.length>3
   &&rows[0].length>1&&rows[0].every(c=>label(c)===label(rows[0][0]))&&/桩径.*持力层/.test(label(rows[0][0]))
   &&/^孔号$/.test(label(rows[1]?.[0]))&&rows[1].slice(1).every(c=>/^[A-Za-z]+\d+(?:[-－]\d+)*$/.test(label(c)))
   &&rows.every(r=>r.length===rows[0].length)&&rows.slice(2).some(r=>/单桩承载力.*Ra/i.test(label(r[0])))&&rows.slice(2).some(r=>/桩长/.test(label(r[0])));
  const scenario=transposedPile?clean(rows[0][0]):'';
  const transposed=transposedPile||transposedSite||transposedBuilding||layer.test(label(rows[0]?.[0]))&&rows[0].slice(1).every(v=>/^[①-⑳\d]/.test(label(v)))&&rows.slice(1).some(r=>/fak|qsik|qpk|Es/i.test(r[0]));
  if(transposed){
   const data=(transposedPile?rows.slice(1):rows).filter(r=>!note(r[0]));
   rows=Array.from({length:rows[0].length},(_,c)=>data.map(r=>r[c]||''));meta={};
  }
  const upliftCoefficient=bucket===13&&/抗拔系数/.test(caption)&&rows.length>1
   &&rows[0].length===2&&label(rows[0][0])==='土类'&&/^λ值?$/.test(label(rows[0][1]))
   &&rows.slice(1).every(r=>r.length===2&&clean(r[0])&&/^\d+(?:\.\d+)?$/.test(clean(r[1])));
  let records=(bucket===11?(geotechCorrosionMatrixRecords(rows,meta)||geotechCorrosionRecords(rows,meta)||geotechPermeabilityRecords(rows)):null)||tableRecords(rows,meta);
  if(upliftCoefficient)records=records.map(r=>r.index>0&&['requirement','table_row'].includes(r.kind)?{...r,kind:'table_row'}:r);
  records=records.map(r=>{
   const normalizedFields=r.fields.map(c=>({...c,label:label(c.label)}));
   const units=normalizedFields.filter(c=>/^(?:(?:拟建)?建筑物(?:名称)?|建[（(]构[）)]筑物名称|单体名称|建筑名称|栋号)$/.test(c.label)&&clean(c.value));
   const unlabelled=normalizedFields.filter(c=>!c.mapped&&clean(c.value));
   const layerNames=normalizedFields.filter(c=>c.mapped&&soil.test(c.label)&&clean(c.value));
   const duplicateUnlabelled=r.kind==='unmapped'&&unlabelled.length>0&&layerNames.length===1&&unlabelled.every(c=>label(c.value)===label(layerNames[0].value));
   return {...r,...(duplicateUnlabelled?{kind:'table_row',duplicateUnlabelledCells:unlabelled.length}:{}),unit:r.unit||(units.length===1?label(units[0].value):''),fields:normalizedFields};
  });
  // Some Word schedules mark every row as a repeating header. Recover only
  // an explicit building/water-level schedule with a demonstrable data body.
  // Keep raw rows/meta intact; do not infer this from header formatting alone.
  let headerRecovery=false;
  if(!records.length&&rows.length>1&&meta?.rows?.length===rows.length&&meta.rows.every(r=>r.header)){
   const headers=rows[0].map(label),serial=headers.findIndex(c=>c==='序号');
   const building=headers.findIndex(c=>/^(?:建筑物|建筑|单体)名称$/.test(c));
   const water=headers.findIndex(c=>/水位.*[（(]m[）)]/i.test(c));
   if(serial>=0&&building>=0&&water>=0&&rows.slice(1).every(r=>/^\d+$/.test(clean(r[serial]))&&clean(r[building])&&/^[+-]?\d+(?:\.\d+)?$/.test(clean(r[water])))){
    records=tableRecords(rows,{}).map(r=>({...r,fields:r.fields.map(c=>({...c,label:label(c.label)}))}));headerRecovery=true;
   }
  }
  if(!records.length&&rows.length===2&&rows[0].some(c=>/场地类别|地震分组/.test(c))&&rows[1].some(c=>/[ⅠⅡⅢⅣ]+类|[6-9]度|第[一二三]组/.test(c))){
   const fields=rows[1].map((v,c)=>({path:[rows[0][c]],label:label(rows[0][c]),value:clean(v),mapped:!!rows[0][c]}));
   records=[{index:1,kind:'table_row',cells:rows[1],fields,text:fields.map(c=>c.label+'：'+c.value).join('；')}];
  }
  const allLabels=records.flatMap(r=>r.fields.map(c=>c.label)).join(' ');
  const relevant=transposedPile||upliftCoefficient||/土层|岩土|岩层名称|岩层及编号|地层|层号|层序|剪切波速|场地类别|水位|抗浮/.test(allLabels)
   ||bucket===2&&/岩样名称/.test(allLabels)&&/试验成果统计表/.test(caption)&&/统计值/.test(allLabels)&&/抗压强度/.test(allLabels)
   ||bucket===2&&/岩石名称/.test(allLabels)&&/声波探测结果统计表/.test(caption)&&/钻孔编号/.test(allLabels)&&/完整性评价/.test(allLabels)
   ||bucket===12&&pileEstimate&&/孔号/.test(allLabels)&&/Quk|极限承载力/.test(allLabels)&&/桩长/.test(allLabels)
   ||bucket===8&&/钻孔(?:编号)?/.test(allLabels)&&/溶洞|岩溶/.test(allLabels+' '+caption)
   ||bucket===11&&(/腐蚀/.test(allLabels)||/腐蚀/.test(caption)&&/试验结果/.test(allLabels)&&/评价结果/.test(allLabels))
   ||[10,12].includes(bucket)&&/建筑物名称|建[（(]构[）)]筑物名称|单体名称/.test(allLabels)&&/基础型式|基础形式|持力层|地基均匀性/.test(allLabels);
  if(!relevant)continue;
  if(inheritedHeaders)records=records.map(r=>({...r,index:r.index-inheritedHeaders}));
  records=records.map(r=>{
   if(/^(?:备注|注|说明)[:：]?$/.test(clean(r.cells[0]))){
    const notes=[...new Set(r.cells.slice(1).map(clean).filter(Boolean))];
    if(notes.length)return {...r,kind:'table_note',text:clean(r.cells[0])+'：'+notes.join('；'),fields:[]};
   }
   const unique=[...new Set(r.cells.map(clean).filter(Boolean))];
   return unique.length===1&&/^(?:计算公式|综合评价|备注|注|说明)[:：]/.test(unique[0])?{...r,kind:'table_note',text:unique[0],fields:[]}:r;
  });
  let destination=bucket;
  if(destination===3&&/等效剪切波速/.test(allLabels)&&/场地类别/.test(allLabels))destination=4;
  if(destination===undefined){
   if(/地层描述|地层特征/.test(allLabels))destination=1;
   else if(/剪切波速|场地类别/.test(allLabels))destination=4;
   else if(/重度|承载力特征值|fak|qsik|压缩模量/i.test(allLabels))destination=2;
  }
  if(!Number.isInteger(destination)||destination<0)continue;
  // Construction tables are not used as design soil parameters, even when
  // their names and units resemble the natural-foundation table.
  const data=records.filter(r=>r.kind==='table_row'&&(!r.unit||unit==='项目整体'||label(r.unit)===label(unit)));
  if(!data.length)continue;
  const lines=data.map(r=>r.fields.filter(c=>c.value&&c.mapped).map(c=>c.label+'：'+c.value).join('；'));
  const notes=[...new Set([...records.filter(r=>r.kind==='table_note').map(r=>r.text),...rawRows.filter(r=>note(r[0])).map(r=>r[0])].map(clean).filter(t=>t&&!/^(?:注|说明|备注)[:：]$/.test(t)))];
  const title=caption.length<100&&/表\s*\d|表$/.test(caption)?caption:'';
  texts[destination].push(...[title,scenario,...lines,...notes].filter(Boolean));
  if(scenario)tableEvidence.push({id:`GEO-T${index+1}-SCENARIO`,locator:`提取表 ${index+1} 行 1`,text:scenario});
  data.forEach(r=>tableEvidence.push({id:`GEO-T${index+1}-R${r.index+1}`,locator:`提取表 ${index+1} ${transposed?'列':'行'} ${r.index+1}`,text:r.text}));
  notes.forEach(text=>tableEvidence.push({id:`GEO-T${index+1}-NOTE`,locator:`提取表 ${index+1} 表注`,text}));
  tables.push({key:'source-'+(index+1),rows,rawRows,records,source_id:source.source_id,locator:'提取表 '+(index+1),destination,transposed,headerRecovery,inheritedHeaders,...(scenario?{scenario}:{}),...(pileEstimate?{estimateOnly:true}:{}),...(inheritedHeaders?{headerSource:blocks.tableMeta[index].continuationOf+1}:{})});
  if(pileEstimate)continue;
  if(![2,10,12].includes(destination))continue;
  // Ground-improvement pile parameters are not ordinary pile ultimate
  // resistances or natural-foundation bearing values. Keep their source table.
  if(/CFG桩|高压旋喷桩|搅拌桩|地基处理设计参数/i.test(allLabels+' '+caption))continue;
  for(const r of data){
   let id=value(r,/(?:^|\/)(?:土层编号|地层编号|层序号?|层号|层次)(?:\/|$)/);
   const names=r.fields.filter(c=>soil.test(c.label)&&!c.path.some(p=>layer.test(label(p))));
   let name=names.length===1?names[0].value.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,''):'';
   const originalName=name;
   // A combined name/identifier cell can join tables only through its explicit
   // layer identifier. Never join equally named soils across different layers.
   const combined=/^([①-⑳](?:\s*\d+(?:[-－]\d+)?)?)\s*(.+)$/.exec(name);
   if(!id&&combined){id=combined[1].replace(/\s/g,'');name=combined[2].replace(/^层/,'');}
   if(!id&&!name)continue;
   const scope=r.unit||value(r,/(?:^|\/)(?:分区|区域|区段|部位|适用范围)(?:\/|$)/);
   const key=JSON.stringify([scope,id||name]);
   let item=soilRows.get(key);
   if(!item){item={id,name,scope,displayName:combined?originalName:'',values:{},recommendedValues:{},sources:[],references:[],fieldIssues:[],names:new Set(name?[name]:[])};soilRows.set(key,item);}
   if(name)item.names.add(name);
   if(name&&item.name&&soilNameKey(name)!==soilNameKey(item.name))item.conflict=true;
   if(name)item.name=name;
   item.sources.push(index);
   // Preserve why a source value cannot enter the fixed kN/m³ slot.
   // A missing exponent in the report is not permission to infer its unit.
   for(const c of r.fields.filter(c=>/重度/.test(c.label)&&c.value&&!fields.weight(c.label))){
    item.fieldIssues.push({parameter:'weight',reason:'source-unit-not-verified',table:index+1,row:r.index+1,
     label:c.label,value:c.value,source_id:source.source_id,automaticAdoption:false});
   }
   for(const [key,match] of Object.entries(fields)){
    let candidates=r.fields.filter(c=>match(c.label)&&c.value);
    // A uniquely explicit recommendation is the report's own selection, not
    // an inferred maximum/average of competing test methods. Keep all tests
    // in the source table above, and leave multiple recommendations unresolved.
    if(key==='bearing'){
     const recommended=candidates.filter(c=>/推荐|建议/.test(c.label));
     if(recommended.length)candidates=recommended;
    }
    if(key==='compression')candidates=candidates.filter(c=>!/(?:变形模量|E[0o]\s*=)/i.test(c.value));
    if(key==='end'||key==='side')candidates=candidates.filter(c=>!/(?:MPa|f[rR][kK]?\s*=)/i.test(c.value)&&!/[<>≤≥＜＞]|桩长|桩径/.test(c.label));
    // Multiple pile types or tests must remain in their own source table.
    if(candidates.length!==1)continue;
    (item.values[key]??=new Set()).add(candidates[0].value);
    const recommended=key==='bearing'&&destination===2&&/(?:岩土|地基|土层).*参数.*建议值表/.test(caption);
    if(recommended)(item.recommendedValues[key]??=new Set()).add(candidates[0].value);
    item.references.push({parameter:key,table:index+1,row:r.index+1,label:candidates[0].label,value:candidates[0].value,recommended,...(blocks.tableMeta?.[index]?.sourceOrigin?{sourceOrigin:blocks.tableMeta[index].sourceOrigin}:{})});
   }
  }
 }
 const safe=(item,key)=>{const values=item.recommendedValues[key]?.size?item.recommendedValues[key]:item.values[key];return !item.conflict&&values?.size===1?[...values][0]:'';};
 const name=item=>item.conflict?[item.scope,item.id,'（层名冲突：'+[...item.names].join('／')+'）'].filter(Boolean).join(' '):[item.scope,item.displayName||[item.id,item.name].filter(Boolean).join(' ')].filter(Boolean).join(' ');
 const strength=[['土层名称','重度（kN/m³）','','','压缩模量Es0.1-0.2（MPa）','承载力特征值（kPa）']];
 const methods=[...new Set(tables.flatMap(t=>t.records.flatMap(r=>r.fields.filter(c=>fields.side(c.label)||fields.end(c.label)).flatMap(c=>c.path.filter(p=>/预制桩|预应力管桩|灌注桩|旋挖|人工挖孔/.test(p))))))];
 const pile=[['土层名称',methods.length===1?methods[0]:'桩基','桩端阻力（kPa）']];
 const strengthSources=[null],pileSources=[null];
 const provenance=(item,parameters)=>({layer:item.id,names:[...item.names],scope:item.scope,conflict:!!item.conflict,references:item.references.filter(r=>parameters.includes(r.parameter)),
  ...(item.fieldIssues.some(r=>parameters.includes(r.parameter))?{fieldIssues:item.fieldIssues.filter(r=>parameters.includes(r.parameter))}:{})});
 for(const item of soilRows.values()){
  if(['weight','compression','bearing'].some(k=>safe(item,k))||item.conflict&&['weight','compression','bearing'].some(k=>item.values[k]?.size)){
   strength.push([name(item),safe(item,'weight'),'','',safe(item,'compression'),safe(item,'bearing')]);strengthSources.push(provenance(item,['weight','compression','bearing']));
  }
  if(methods.length<=1&&['side','end'].some(k=>safe(item,k))){pile.push([name(item),safe(item,'side'),safe(item,'end')]);pileSources.push(provenance(item,['side','end']));}
 }
 for(const [key,rows,rowSources] of [['strength',strength,strengthSources],['pile',pile,pileSources]])if(rows.length>1){
  const origins=[...new Set(rowSources.filter(Boolean).flatMap(r=>r.references.map(f=>f.table)))];
  tables.unshift({key,rows,rowSources,source_id:source.source_id,...(origins.length===1?{rawRows:blocks.tables[origins[0]-1],locator:'提取表 '+origins[0]}:{})});
 }
 return {tables,texts,evidence:tableEvidence};
}
