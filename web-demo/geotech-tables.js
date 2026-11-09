import {tableRecords,blockTableRecords} from './intake-structure.js';

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const label=v=>clean(v).replace(/\s/g,'');
const layer=/^(?:土层编号|地层编号|层序|层号|层次)$/;
const soil=/土层名称|岩土名称|地层名称|^土名$/;
const note=v=>/^(?:注|说明|备注)[:：]/.test(clean(v));
const value=(r,re)=>{
 const fields=r.fields.filter(c=>re.test(label(c.label))&&c.value);
 return fields.length===1?fields[0].value:'';
};
const unitKpa=/kpa/i;
const fields={
 weight:c=>/重度/.test(c)&&/kN[/／]m[³3]/i.test(c),
 compression:c=>/(?:压缩模量)?Es0[.．]1[-～~]0[.．]2/i.test(c)&&/MPa/i.test(c)&&!/(?:Eo|E0|变形模量)/i.test(c),
 bearing:c=>/承载力特征值|fak/i.test(c)&&unitKpa.test(c),
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
  if(bucket===-1)continue;
  if(!numbered&&before&&blockTableRecords(blocks,index).every(r=>['requirement','toc'].includes(r.kind)))continue;
  let rows=rawRows,meta=blocks.tableMeta?.[index];
  const transposed=layer.test(label(rows[0]?.[0]))&&rows[0].slice(1).every(v=>/^[①-⑳\d]/.test(label(v)))&&rows.slice(1).some(r=>/fak|qsik|qpk|Es/i.test(r[0]));
  if(transposed){
   const data=rows.filter(r=>!note(r[0]));
   rows=Array.from({length:rows[0].length},(_,c)=>data.map(r=>r[c]||''));meta={};
  }
  let records=tableRecords(rows,meta).map(r=>({...r,fields:r.fields.map(c=>({...c,label:label(c.label)}))}));
  if(!records.length&&rows.length===2&&rows[0].some(c=>/场地类别|地震分组/.test(c))&&rows[1].some(c=>/[ⅠⅡⅢⅣ]+类|[6-9]度|第[一二三]组/.test(c))){
   const fields=rows[1].map((v,c)=>({path:[rows[0][c]],label:label(rows[0][c]),value:clean(v),mapped:!!rows[0][c]}));
   records=[{index:1,kind:'table_row',fields,text:fields.map(c=>c.label+'：'+c.value).join('；')}];
  }
  const allLabels=records.flatMap(r=>r.fields.map(c=>c.label)).join(' ');
  const relevant=/土层|岩土|地层|层号|层序|剪切波速|场地类别|水位|抗浮/.test(allLabels);
  if(!relevant)continue;
  let destination=bucket;
  if(destination===undefined){
   if(/地层描述|地层特征/.test(allLabels))destination=1;
   else if(/剪切波速|场地类别/.test(allLabels))destination=4;
   else if(/重度|承载力特征值|fak|qsik|压缩模量/i.test(allLabels))destination=2;
  }
  if(!Number.isInteger(destination)||destination<0)continue;
  // Construction tables are not used as design soil parameters, even when
  // their names and units resemble the natural-foundation table.
  const caption=before?clean(blocks.paras[before.index]):'';
  const data=records.filter(r=>r.kind==='table_row'&&(!r.unit||unit==='项目整体'||r.unit===unit));
  if(!data.length)continue;
  const lines=data.map(r=>r.fields.filter(c=>c.value&&c.mapped).map(c=>c.label+'：'+c.value).join('；'));
  const notes=[...new Set([...records.filter(r=>r.kind==='table_note').map(r=>r.text),...rawRows.filter(r=>note(r[0])).map(r=>r[0])])];
  const title=caption.length<100&&/表\s*\d|表$/.test(caption)?caption:'';
  texts[destination].push(...[title,...lines,...notes].filter(Boolean));
  data.forEach(r=>tableEvidence.push({id:`GEO-T${index+1}-R${r.index+1}`,locator:`提取表 ${index+1} ${transposed?'列':'行'} ${r.index+1}`,text:r.text}));
  notes.forEach(text=>tableEvidence.push({id:`GEO-T${index+1}-NOTE`,locator:`提取表 ${index+1} 表注`,text}));
  tables.push({key:'source-'+(index+1),rows,rawRows,records,source_id:source.source_id,locator:'提取表 '+(index+1),destination,transposed});
  if(![2,10,12].includes(destination))continue;
  for(const r of data){
   const id=value(r,/(?:^|\/)(?:土层编号|地层编号|层序|层号|层次)(?:\/|$)/);
   const names=r.fields.filter(c=>soil.test(c.label)&&!c.path.some(p=>layer.test(label(p))));
   const name=names.length===1?names[0].value:'';
   if(!id&&!name)continue;
   const scope=r.unit||value(r,/(?:^|\/)(?:分区|区域|区段|部位|适用范围)(?:\/|$)/);
   const key=JSON.stringify([scope,id||name]);
   let item=soilRows.get(key);
   if(!item){item={id,name,scope,values:{},sources:[]};soilRows.set(key,item);}
   if(name&&item.name&&name!==item.name){item.conflict=true;continue;}
   if(name)item.name=name;
   item.sources.push(index);
   for(const [key,match] of Object.entries(fields)){
    const candidates=r.fields.filter(c=>match(c.label)&&c.value);
    // Multiple pile types or tests must remain in their own source table.
    if(candidates.length!==1)continue;
    (item.values[key]??=new Set()).add(candidates[0].value);
   }
  }
 }
 const safe=(item,key)=>!item.conflict&&item.values[key]?.size===1?[...item.values[key]][0]:'';
 const name=item=>[item.scope,item.id,item.name].filter(Boolean).join(' ');
 const strength=[['土层名称','重度（kN/m³）','','','压缩模量Es0.1-0.2（MPa）','承载力特征值（kPa）']];
 const methods=[...new Set(tables.flatMap(t=>t.records.flatMap(r=>r.fields.filter(c=>fields.side(c.label)||fields.end(c.label)).flatMap(c=>c.path.filter(p=>/预制桩|灌注桩|旋挖|人工挖孔/.test(p))))))];
 const pile=[['土层名称',methods.length===1?methods[0]:'桩基','桩端阻力（kPa）']];
 for(const item of soilRows.values()){
  if(['weight','compression','bearing'].some(k=>safe(item,k)))strength.push([name(item),safe(item,'weight'),'','',safe(item,'compression'),safe(item,'bearing')]);
  if(methods.length<=1&&['side','end'].some(k=>safe(item,k)))pile.push([name(item),safe(item,'side'),safe(item,'end')]);
 }
 for(const [key,rows] of [['strength',strength],['pile',pile]])if(rows.length>1)tables.unshift({key,rows,source_id:source.source_id});
 return {tables,texts,evidence:tableEvidence};
}
