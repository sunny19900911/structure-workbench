import {numberedGeotechSections} from './geotech-numbered-sections.js';
import {geotechTables} from './geotech-tables.js';
import {geotechScopedNativeTable} from './geotech-native-table.js';
import {detailedGeotech} from './geotech-document.js';

const headings=['4.1 场地地形及地貌','4.2 场地地层岩性构成','4.3 地基土层物理力学参数',
 '4.4.1 抗震地段的划分','4.4.2 场地类别','4.4.3 场地地震液化判定','4.4.4 软土震陷',
 '4.4.5 断裂带','4.5 岩土工程评价','4.5 岩土工程评价','4.5 岩土工程评价',
 '4.6 水文地质与腐蚀性','地基基础建议','抗浮建议'];
const norm=v=>String(v??'').replace(/\s/g,'');

// Read-only export contract. A consumer must successfully render each native
// table before replacing the existing text export; this does not edit drafts.
export function geotechSectionBlocks(source,unit='项目整体'){
 const numbered=numberedGeotechSections(source,unit);
 if(!numbered){
  const d=detailedGeotech(source,unit);
  return {version:1,source_id:source.source_id,hash:source.hash,unit,mode:'text-fallback',sections:[
   {title:'地勘资料',blocks:[d.text,d.foundationText,d.antifloatText].filter(Boolean).map(text=>({kind:'paragraph',text}))}],warnings:['未识别章节，保留原文字编排。']};
 }
 const structured=geotechTables(source,numbered,unit),sections=[],warnings=[];
 const positions=new Map((source.blocks.ordered||[]).map((b,i)=>[b.type+':'+b.index,i]));
 for(let bucket=0;bucket<14;bucket++){
  const title=headings[bucket];let section=sections.find(s=>s.title===title);
  if(!section){section={title,buckets:[],blocks:[]};sections.push(section);}section.buckets.push(bucket);
  section.blocks.push(...numbered.runs[bucket].map(run=>({kind:'paragraph',text:run.text,source_id:source.source_id,
   sourceParagraphs:run.paragraphs.map(i=>i+1),sourceOrder:positions.get('p:'+run.paragraphs[0])??null})));
  for(const retained of structured.tables.filter(t=>/^source-\d+$/.test(t.key)&&t.destination===bucket)){
   const index=Number(retained.key.slice(7))-1;
   let native;
   try{
    native=geotechScopedNativeTable(source,retained,structured.tables,unit);
   }catch(error){warnings.push({table:index+1,reason:error.message});}
   if(native){
    if(!/表\s*\d|表$/.test(native.title))native.title='';
    section.blocks.push({...native,sourceOrder:positions.get('table:'+index)??null,estimateOnly:!!retained.estimateOnly});
   }else{
    const position=(source.blocks.ordered||[]).findIndex(b=>b.type==='table'&&b.index===index);
    const prior=position<0?null:source.blocks.ordered.slice(0,position).findLast(b=>b.type==='p');
    const caption=prior?source.blocks.paras[prior.index]:'';
    const data=retained.records.filter(r=>r.kind==='table_row'&&(!r.unit||unit==='项目整体'||norm(r.unit)===norm(unit)));
    const paragraphs=[caption?.length<100&&/表\s*\d|表$/.test(caption)?caption:'',retained.scenario,...data.map(r=>r.fields.filter(c=>c.value&&c.mapped).map(c=>c.label+'：'+c.value).join('；')),
     ...retained.records.filter(r=>r.kind==='table_note').map(r=>r.text)].filter(Boolean);
    section.blocks.push({kind:'table-text-fallback',source_id:source.source_id,locator:retained.locator,sourceOrder:positions.get('table:'+index)??null,
     estimateOnly:!!retained.estimateOnly,paragraphs});
   }
  }
 }
 for(const section of sections){
  if(section.blocks.every(b=>Number.isInteger(b.sourceOrder))){section.blocks.sort((a,b)=>a.sourceOrder-b.sourceOrder);section.placement='source-order';}
  else {section.placement='section-end';warnings.push({section:section.title,reason:'缺少来源顺序，保留章节内原文字及表格，不推测交错位置。'});}
 }
 // Water figures need their real section anchor. The legacy shared exporter
 // groups detailedGeotech.images under geology, so do not add them there.
 const images=detailedGeotech(source,unit).images;
 const seenImages=new Set(images.map(i=>i.data));
 for(const image of source.blocks?.images||[]){
  if(!/水系分布|抗浮(?:设计|设防)?水位.*(?:分区|分布|平面)/.test(image.caption)||seenImages.has(image.data))continue;
  images.push({...image,source_id:source.source_id});seenImages.add(image.data);
 }
 return {version:1,source_id:source.source_id,hash:source.hash,unit,mode:'native-tables',tablePlacement:sections.every(s=>s.placement==='source-order')?'source-order':'mixed',sections,warnings,
  evidence:numbered.evidence,images};
}
