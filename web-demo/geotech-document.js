import {numberedGeotechSections} from './geotech-numbered-sections.js';
import {geotechTables} from './geotech-tables.js';
import {geotechSiteTable,geotechSiteProseTable} from './geotech-site-table.js';
import {uniqueGeotechProse,proseIdentity} from './geotech-prose.js';
import {sourceParagraphs,blockTableRecords,geotechTableRows,usable} from './intake-structure.js';
// Section boundaries come from the uploaded report, not keyword-matched paragraphs repeated across chapters.
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function sourceOrigin(source,locator){
 const p=/^提取段落 (\d+)$/.exec(locator||''),t=/^提取表 (\d+)(.*)$/.exec(locator||'');
 const origin=p?source.blocks?.paragraphMeta?.[Number(p[1])-1]?.sourceOrigin:t?source.blocks?.tableMeta?.[Number(t[1])-1]?.sourceOrigin:null;
 return origin?{sourceOrigin:{...origin,locator:origin.locator+(t?t[2]:'')}}:{};
}
export function detailedGeotech(source,unit='项目整体'){
 if(!source)return {text:'',tables:[],images:[],report:''};
 const ps=(source.blocks?.paras||source.fragments.filter(f=>!/提取表/.test(f.locator)).map(f=>f.text)).map(clean);
 const [terrain,strata,physics,seismic,site,liquid,soft,fracture,stability,suitability,engineering,water]=Array.from({length:12},()=>[]);
 const seenText=new Set(),tableText=new Set();
 // Identical measurements in different water/soil tables are separate evidence.
 // Keep their table context instead of removing the later occurrence globally.
 // Hierarchical prose has already been deduplicated as complete runs. A
 // repeated PDF line can qualify different soil layers; never remove it alone.
 const compact=parts=>parts.map(clean).filter(t=>t&&(numbered||tableText.has(t)||!seenText.has(proseIdentity(t))&&seenText.add(proseIdentity(t)))).join('\n');
 const tableList=(source.blocks?.tables||[]).map((rows,t)=>({rows,records:blockTableRecords(source.blocks,t)})).filter(t=>t.records.some(usable));
 const has=(table,re)=>table.records.some(r=>r.fields?.some(c=>re.test(c.label)));
 const strength=tableList.findLast(t=>has(t,/天然.*重度/)&&has(t,/承载力特征值/));
 const pile=tableList.find(t=>has(t,/土层名称/)&&has(t,/旋挖成孔/));
 const physical=tableList.find(t=>has(t,/室内土工试验/));
 const tables=[['physical',physical],['strength',strength],['pile',pile]].filter(([,t])=>t).map(([key,t])=>({key,rows:geotechTableRows(key,t.records)||t.rows,rawRows:t.rows,records:t.records,source_id:source.source_id}));
 // The reference template's fourth soil field is compression modulus, not c.
 for(const table of tables.filter(t=>t.key==='strength'))table.rows=table.rows.map((r,i)=>r.map((v,c)=>c===4?(i?'':'压缩模量Es0.1-0.2（MPa）'):v));
 const seen=new Set();const images=(source.blocks?.images||[]).filter(i=>/地貌|区域地质|地壳|构造分区|活动断[裂层]|钻孔|岩溶|岩芯|地震动/.test(i.caption)).filter(i=>{if(seen.has(i.data))return false;seen.add(i.data);return true;}).map(i=>({...i,source_id:source.source_id}));
 // Word often places two photo captions in one paragraph. Match them in image order.
 const groups=Map.groupBy(images,i=>i.caption);
 for(const [caption,group] of groups){const names=caption.split(/(?=(?:照片|图)\s*\d+\s*[:：])/).map(clean).filter(Boolean);if(names.length===group.length&&names.length>1)group.forEach((im,i)=>im.caption=names[i]);}
 const title=ps.findIndex(t=>/场地岩土工程详细勘察报告/.test(t));
 const report=title>=0?ps.slice(Math.max(0,title-1),title+1).join(''):String(source.name||'').replace(/\.(docx?|pdf)$/i,'');
 const allowed=sourceParagraphs(source).filter(f=>!f.unit||unit==='项目整体'||f.unit===unit);
 const accepted=new Set(allowed.map(f=>clean(f.text)));
 const buckets=[terrain,strata,physics,seismic,site,liquid,soft,fracture,stability,suitability,engineering,water];
 const numbered=numberedGeotechSections(source,unit);
 if(numbered)numbered.buckets.slice(0,12).forEach((parts,i)=>buckets[i].splice(0,buckets[i].length,...uniqueGeotechProse(parts)));
 const structured=geotechTables(source,numbered,unit);
 const siteProjection=geotechSiteTable(source,structured.tables,unit)||geotechSiteProseTable(source,numbered,unit);
 if(siteProjection)tables.push(siteProjection);
 structured.texts.flat().forEach(t=>tableText.add(clean(t)));
 structured.texts.slice(0,12).forEach((parts,i)=>buckets[i].push(...parts));
 for(const table of structured.tables){const old=tables.findIndex(t=>t.key===table.key);if(old<0)tables.push(table);else tables[old]=table;}
 for(const bucket of numbered?[]:buckets){const kept=bucket.filter(t=>accepted.has(clean(t)));bucket.splice(0,bucket.length,...kept);}
 // Reports with different numbering still feed the actual reference-report/Word chapter chain.
 const present=new Set(buckets.flat().map(clean));
 for(const f of numbered?[]:allowed){
  const whole=clean(f.text);if(present.has(whole))continue;
  let previousBucket;
  for(const t of whole.split(/(?<=[。])/).map(clean).filter(Boolean)){
  if(present.has(t))continue;
  let bucket;
  if(/基础.*建议|建议.*基础|持力层|桩长|抗浮/.test(t)){previousBucket=null;continue;}
  if(/腐蚀|地下水|水位埋深/.test(t))bucket=water;
  else if(/液化/.test(t))bucket=liquid;
  else if(/剪切波速|覆盖层厚度|场地类别/.test(t))bucket=site;
  else if(/地层|粉质黏土|砂岩|填土层/.test(t))bucket=strata;
  else if(/地貌|地形/.test(t))bucket=terrain;
  else if(/场地.*稳定|建筑适宜性/.test(t))bucket=stability;
  if(!bucket)bucket=previousBucket;
  if(bucket){bucket.push(t);present.add(t);previousBucket=bucket;}
  }
 }
 const text=[['4.1 场地地形及地貌',terrain],['4.2 场地地层岩性构成',strata],['4.3 地基土层物理力学参数',physics],['4.4 场地地震效应评价',[]],['4.4.1 抗震地段的划分',seismic],['4.4.2 场地类别',site],['4.4.3 场地地震液化判定',liquid],['4.4.4 软土震陷',soft],['4.4.5 断裂带',fracture],['4.5 岩土工程评价',[...stability,...suitability,...engineering]],['4.6 水文地质与腐蚀性',water]].map(([h,parts])=>h+'\n'+compact(parts)).join('\n\n');
 return {text,tables,images,report,sections:numbered?.sections||[],foundationText:[...(numbered?.buckets[12]||[]),...structured.texts[12]].join('\n'),antifloatText:[...(numbered?.buckets[13]||[]),...structured.texts[13]].join('\n'),source_id:source.source_id,evidence:[...(numbered?numbered.evidence:allowed.filter(f=>text.includes(clean(f.text))||clean(f.text).split(/(?<=[。])/).some(t=>text.includes(t.trim())&&t.trim()))),...structured.evidence].map(f=>({source_id:source.source_id,fragment_id:f.id,locator:f.locator,quote:f.text,...sourceOrigin(source,f.locator)}))};
}
