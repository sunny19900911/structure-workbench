import {sourceParagraphs,blockTableRecords,usable,projectName} from './intake-structure.js';
import {architecturalUnitSections,architecturalNarrativeUnits,architecturalGeometry,architecturalGeometryFields,applyArchitecturalGeometry} from './architectural-unit-sections.js';
import {detailedGeotech} from './geotech-document.js';
// Direct document composition from this project's uploaded sources, without
// promoting extracted text to signed engineering decisions or model results.
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
const clean=s=>tidy(s).replace(/^[（(][一二三四五六七八九十\d]+[）)]\s*/,'');
const unique=a=>[...new Set(a.filter(Boolean))];
const sentences=s=>clean(s).split(/(?<=[。；])/).map(tidy).filter(Boolean);
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const number=s=>/^\d[\d,]*(?:\.\d+)?$/.test(tidy(s));
function rows(source){
 // Fact fragments deliberately omit headers. The original table retains them,
 // so document composition must use that table before falling back to old data.
 if(source.blocks?.tables?.length){
  const byLocator=new Map((source.fragments||[]).map(f=>[f.locator,f]));
  return source.blocks.tables.flatMap((table,t)=>(Array.isArray(table)?table:[]).map((cells,r)=>{
   const locator='提取表 '+(t+1)+' 行 '+(r+1),fragment=byLocator.get(locator);
   return {...(fragment||{id:'TABLE-'+(t+1)+'-ROW-'+(r+1),text:cells.map(c=>String(c??'')).join('；'),locator}),cells};
  }));
 }
 return source.fragments.filter(f=>/表\s*\d+/.test(f.locator||'')).map(f=>({...f,cells:f.cells||f.text.split('；').map(c=>c.replace(/^[^：]*：/,''))}));
}
function paragraphSource(source){return sourceParagraphs(source);}
export function composeDocument(sources=[],unit='项目整体'){
 const docs=sources.filter(s=>['bldg','geo'].includes(s.slot)&&s.fragments?.length);
 const result={version:2,units:[],notes:[],parameters:{},sourceIds:docs.map(s=>s.source_id),evidence:[],overview:'',ground:'',foundation:''};
 const remember=(source,f)=>{if(source&&f&&!result.evidence.some(x=>x.source_id===source.source_id&&x.fragment_id===f.id))result.evidence.push({source_id:source.source_id,fragment_id:f.id,locator:f.locator,quote:f.text});};
 // Distinct versions remain stored; do not silently mix their geometry.
 const choose=slot=>{const selected=docs.filter(s=>s.slot===slot);if(selected.length>1){result.notes.push(`${slot==='bldg'?'建筑':'地勘'}资料有${selected.length}份，正文按最后导入的文件编排，原文件均保留。`);}return selected.at(-1);};
 const arch=choose('bldg'),geo=choose('geo');
 if(arch){
  const paras=paragraphSource(arch),tableRows=rows(arch);
  const find=re=>paras.find(f=>re.test(f.text));
  const read=(re,group=1)=>{const f=find(re);if(!f)return '';remember(arch,f);return tidy(re.exec(f.text)?.[group]);};
  result.projectName=projectName(read(/(?:项目名称|工程名称)\s*[:：]\s*(.+?)(?=\s+设计证书|\s+项目编号|$)/).replace(/[。；].*$/,''));
  result.location=read(/(?:建设地点|项目地点|工程地点)\s*[:：]\s*([^。；]+)/);
  if(!result.projectName){
   const heading=(arch.blocks?.paras||[]).slice(0,8).map(tidy).find(t=>/^[^《》\n]{3,80}(?:项目|工程)(?:初步)?设计说明$/.test(t));
   if(heading){result.projectName=heading.replace(/(?:初步)?设计说明$/,'');remember(arch,paras.find(f=>tidy(f.text)===heading));}
  }
  if(!result.location)result.location=read(/(?:本项目|本工程|项目|工程)(?:建设地点)?位于\s*([^。；]+)/);
  const tableId=f=>/表\s*(\d+)/.exec(f.locator||'')?.[1];
  const header=tableRows.find(f=>/栋号|单体名称|建筑名称/.test(f.cells.join('|'))&&/建筑面积/.test(f.cells.join('|')));
  if(header){
   const nameIndex=header.cells.findIndex(c=>/^(栋号|单体名称|建筑名称)$/.test(tidy(c)));
   const areaIndex=header.cells.findIndex(c=>/^建筑面积/.test(tidy(c))&&!/万|亩|公顷/.test(c));
   for(const row of tableRows.filter(f=>tableId(f)===tableId(header))){
    const name=tidy(row.cells[nameIndex]),area=tidy(row.cells[areaIndex]);
    if(!name||/合计|总计/.test(name)||!number(area)||result.units.some(u=>u.name===name))continue;
    const u={name,area,aboveArea:'',belowArea:'',floors:'',planningHeight:'',fireHeight:'',use:'',storeys:'',source_id:arch.source_id,locator:row.locator};
    const aboveIndex=header.cells.findIndex(c=>/^地上建筑面积/.test(tidy(c)));if(aboveIndex>=0&&number(row.cells[aboveIndex]))u.aboveArea=tidy(row.cells[aboveIndex]);
    const levelRow=tableRows.find(f=>tableId(f)===tableId(header)&&f.cells.some(c=>/^-1F$/i.test(tidy(c))));
    const belowIndex=levelRow?.cells.findIndex(c=>/^-1F$/i.test(tidy(c)));if(belowIndex>=0&&number(row.cells[belowIndex]))u.belowArea=tidy(row.cells[belowIndex]);
    const own=paras.filter(f=>new RegExp('^'+escape(name)+'\\s*[:：—]').test(f.text));
    const floor=own.find(f=>/共\s*\d+层|（\d+层）/.test(f.text));
    if(floor){u.floors=/(?:共\s*|（)(\d+)层/.exec(floor.text)?.[1]||'';remember(arch,floor);}
    const heights=own.find(f=>/消防高度|规划高度/.test(f.text));
    if(heights){u.planningHeight=/(?:建筑)?规划高度\s*([\d.]+)/.exec(heights.text)?.[1]||'';u.fireHeight=/消防高度\s*([\d.]+)/.exec(heights.text)?.[1]||'';remember(arch,heights);}
    const storeys=own.find(f=>/层高/.test(f.text));if(storeys){u.storeys=storeys.text.replace(new RegExp('^'+escape(name)+'[:：]'),'');remember(arch,storeys);}
    const use=own.find(f=>/功能|以.+为主|首层以/.test(f.text)&&! /交通功能/.test(f.text));
    if(use){u.use=sentences(use.text.replace(new RegExp('^'+escape(name)+'[:：]'),''))[0].replace(/；.*$/,'').replace(/。$/,'');remember(arch,use);}
    if(u.name==='地下室'&&!u.floors){const f=find(/一层地下室|地下室.*地下一层/);if(f){u.floors='地下1';remember(arch,f);}u.use='';}
    if(/局部夹层/.test(u.storeys))u.floors+='（局部夹层）';
    if(u.belowArea&&u.aboveArea)u.floors+='；地下1';
    remember(arch,row);result.units.push(u);
   }
  }
  // Fill only from this version of the architectural source; never from geotechnical quotations.
  const structured=(arch.blocks?.tables||[]).flatMap((table,t)=>blockTableRecords(arch.blocks,t).map(r=>({...r,locator:'提取表 '+(t+1)+' 行 '+(r.index+1),id:arch.fragments.find(f=>f.locator==='提取表 '+(t+1)+' 行 '+(r.index+1))?.id||'TABLE-'+t+'-'+r.index})));
  for(const row of structured.filter(r=>usable(r)&&r.unit)){
   let u=result.units.find(u=>u.name===row.unit);
   if(!u){u={name:row.unit,area:'',aboveArea:'',belowArea:'',floors:'',planningHeight:'',fireHeight:'',use:'',storeys:'',source_id:arch.source_id,locator:row.locator};result.units.push(u);}
   for(const [key,re] of Object.entries({area:/^建筑面积/,aboveArea:/^地上建筑面积/,belowArea:/^地下建筑面积/,floors:/^地上层数$/,planningHeight:/规划高度/,fireHeight:/消防高度/,height:/^建筑高度/,structuralHeight:/^结构高度/,use:/主要功能|使用功能|建筑用途/,structuralType:/结构类型|结构形式/})){
    const cells=row.fields.filter(c=>c.path.some(p=>re.test(p)));const cell=cells.length===1?cells[0]:null;
    const wrongUnit=cell&&(/height/i.test(key)&&/mm|cm|毫米|厘米/i.test(cell.label)||/area/i.test(key)&&/公顷|亩|万/.test(cell.label));
    if(cell?.value&&!wrongUnit&&!u[key])u[key]=cell.value;
   }
   for(const [key,field] of Object.entries(architecturalGeometryFields)){
    const cell=row.fields.find(c=>c.path.some(p=>p.replace(/\s/g,'').replace(/[（(](?:m|米)[）)]/gi,'')===field.label));
    if(cell&&/^[+-]?\d+(?:\.\d+)?$/.test(cell.value)&&!/mm|cm|毫米|厘米/i.test(cell.label))applyArchitecturalGeometry(u,[{key,value:cell.value,unit:'m',quote:cell.label+'：'+cell.value,locator:row.locator}],arch);
   }
   const floor=row.fields.find(c=>/地上\s*[/／]\s*地下层数/.test(c.label));
   if(!u.floors&&floor&&/^\d+[/／]\d+$/.test(floor.value)){const [above,below]=floor.value.split(/[/／]/);u.floors=above+(Number(below)?'；地下'+below:'');}
   remember(arch,row);
  }
  // Numbered unit sections are an independent source of geometry, even without a schedule.
  for(const section of architecturalUnitSections(arch)){
   let u=result.units.find(u=>u.name===section.unit.name);
   if(!u){u={...section.unit,source_id:arch.source_id};result.units.push(u);}
   else for(const [key,value] of Object.entries(section.unit))if(value&&!u[key])u[key]=value;
   section.evidence.forEach(f=>remember(arch,f));
  }
  for(const candidate of architecturalNarrativeUnits(arch)){
   const existing=result.units.find(u=>u.name===candidate.name);
   if(!existing)result.units.push(candidate);
   else{
    for(const [key,value] of Object.entries(candidate))if(value&&!existing[key]&&!architecturalGeometryFields[key]&&!['geometryEvidence','geometryConflicts'].includes(key))existing[key]=value;
    applyArchitecturalGeometry(existing,Object.values(candidate.geometryEvidence||{}).flat(),arch);
   }
  }
  for(const u of result.units){
   for(const f of paras.filter(f=>f.unit===u.name||new RegExp('^'+escape(u.name)+'\\s*[:：]').test(f.text))){
    const values=architecturalGeometry(f.text).map(v=>({...v,locator:f.locator}));
    applyArchitecturalGeometry(u,values,arch);if(values.length)remember(arch,f);
   }
   for(const evidence of Object.values(u.geometryEvidence||{}).flat())remember(arch,arch.fragments.find(f=>f.locator===evidence.locator));
   if(u.areaEvidence)remember(arch,arch.fragments.find(f=>f.locator===u.areaEvidence.locator));
   for(const [key,values] of Object.entries(u.geometryConflicts||{}))result.notes.push(`${u.name}的${architecturalGeometryFields[key].label}有不同取值：${values.join('、')}m，未自动选择。`);
  }
  // Header-only cells and feasibility-study columns are not project values.
  const totals={};for(const row of tableRows){for(const [key,label]of [['total','总建筑面积'],['above','地上建筑面积'],['below','地下建筑面积']]){const at=row.cells.findIndex(c=>tidy(c)===label);if(at>=0&&number(row.cells[at+1])&&!totals[key]){totals[key]=tidy(row.cells[at+1]);remember(arch,row);}}}
  result.totals=totals;
  result.overview='1.1 工程建设地点\n'+[result.projectName?'本工程为'+result.projectName+'。':'',result.location?'建设地点位于'+result.location+'。':''].join('')+'\n\n1.2 建筑设计概况\n'+(totals.total?'总建筑面积'+totals.total+'㎡'+(totals.above?'，地上建筑面积'+totals.above+'㎡':'')+(totals.below?'，地下建筑面积'+totals.below+'㎡':'')+'。':'')+'\n各单体建筑规模及主要功能见下表。';
  for(const u of result.units){if(u.planningHeight&&u.fireHeight&&u.planningHeight!==u.fireHeight)result.notes.push(`${u.name}分别列出规划高度${u.planningHeight}m、消防高度${u.fireHeight}m，不作为结构计算高度。`);}
 }
 if(geo){
  const paras=paragraphSource(geo).filter(f=>!f.unit||unit==='项目整体'||f.unit===unit);
  const pick=re=>{const f=paras.filter(f=>re.test(f.text)).at(-1);remember(geo,f);return f?.text||'';};
  result.ground='';
  const foundations=paras.filter(f=>/可供选择的桩型|建议.*基础|桩端持力层/.test(f.text)&&!/抗浮/.test(f.text));
  foundations.forEach(f=>remember(geo,f));
  const foundationText=unique(foundations.map(f=>clean(f.text))).join('\n');
  const karstSource=clean(pick(/岩溶.*一桩一孔/));const karst=foundationText.includes(karstSource)?'':karstSource;
  const antifloat=pick(/抗浮设计水位按/);
  result.waterText=sentences(antifloat).filter(t=>/抗浮设计水位按|场地整平标高.*复核/.test(t)).join('');
  result.foundation='5.3 地基基础方案\n勘察报告提出如下基础建议：'+foundationText+'\n'+karst+'\n\n5.4 地下结构抗浮\n'+(result.waterText?'考虑雨季滞水及基坑积水作用，勘察报告建议的抗浮水位如下：\n'+result.waterText:'');
  if(/附图|分区/.test(result.waterText))result.notes.push('抗浮水位按报告部位分别列示，范围值保留分区条件，不合并成全项目统一水位。');
 }
 if(geo){
  const records=(geo.blocks?.tables||[]).flatMap((table,t)=>blockTableRecords(geo.blocks,t).map(r=>({...r,locator:'提取表 '+(t+1)+' 行 '+(r.index+1),id:geo.fragments.find(f=>f.locator==='提取表 '+(t+1)+' 行 '+(r.index+1))?.id||'GEO-TABLE-'+t+'-'+r.index})));
  const suggestions=records.filter(r=>usable(r)&&r.unit&&(unit==='项目整体'||r.unit===unit)&&r.fields.some(c=>/基础|持力层/.test(c.label)));
  const texts=[];
  for(const row of suggestions){
   const text=row.unit+'：'+row.fields.filter(c=>/基础|持力层/.test(c.label)&&c.value).map(c=>c.label+'：'+c.value).join('；');
   texts.push(text);remember(geo,row);
  }
  if(texts.length){
   for(const note of records.filter(r=>r.kind==='table_note'&&suggestions.some(s=>s.locator.split(' 行 ')[0]===r.locator.split(' 行 ')[0]))){texts.push(note.text);remember(geo,note);}
   result.foundationTableText=unique(texts).join('\n');
   result.foundation=result.foundation.replace('\n\n5.4', '\n'+unique(texts).join('\n')+'\n\n5.4');
  }
 }
 result.geotech=detailedGeotech(geo,unit);
 if(geo){
  const g=result.geotech;
  result.ground=g.text;
  if(g.foundationText)result.foundation='5.3 地基基础方案\n勘察报告提出如下基础建议：\n'+g.foundationText+(result.foundationTableText?'\n'+result.foundationTableText:'')+'\n\n5.4 地下结构抗浮\n'+(g.antifloatText||result.waterText||'');
  if(g.antifloatText){result.waterText=g.antifloatText;if(!g.foundationText)result.foundation=result.foundation.split('\n\n5.4')[0]+'\n\n5.4 地下结构抗浮\n'+g.antifloatText;}
  // Only unambiguous report values; retain differing zones in prose, not a single parameter.
  const uniqueValue=re=>{const values=[...g.text.matchAll(re)].map(m=>m[1]);const distinct=[...new Set(values)];return distinct.length===1?distinct[0]:'';};
  result.parameters.site_class=uniqueValue(/(?:建筑)?场地类别(?:划分为|为|属于|属)\s*([ⅠⅡⅢⅣIV]+类)(?![、～~])/g);
  result.parameters.pga=uniqueValue(/(?:地震动峰值加速度|设计基本地震加速度)(?:值)?(?:为|取|采用|：|:)?\s*([\d.]+g)/g);
  result.parameters.eq_group=uniqueValue(/设计地震分组(?:为|属于|：|:)?\s*(第[一二三]组)/g);
  const intensity=uniqueValue(/(?:抗震设防烈度|地震烈度)(?:值)?(?:为|：|:)?\s*([ⅥⅦⅧⅨ6-9]+)\s*度/g);
  result.parameters.intensity=({'Ⅵ':'6','Ⅶ':'7','Ⅷ':'8','Ⅸ':'9'})[intensity]||intensity;
 }

 for(const evidence of result.geotech.evidence||[])if(!result.evidence.some(e=>e.source_id===evidence.source_id&&e.fragment_id===evidence.fragment_id))result.evidence.push(evidence);
 if(arch){
  for(const u of result.units){
   const own=paragraphSource(arch).filter(f=>new RegExp('^'+escape(u.name)+'\\s*[:：—]').test(f.text)).map(f=>f.text).join(' ');
   for(const [key,re] of Object.entries({length:/(?:建筑)?长度(?:为|约|：)?\s*([\d.]+)m(?![a-z²2])/i,width:/(?:建筑)?宽度(?:为|约|：)?\s*([\d.]+)m(?![a-z²2])/i,span:/主要跨度(?:为|约|：)?\s*([\d.]+)m(?![a-z²2])/i,height:/建筑高度(?:为|约|：)?\s*([\d.]+)m(?![a-z²2])/i}))u[key]=u[key]||re.exec(own)?.[1]||'';
  }
 }
 result.allUnitNames=result.units.map(u=>u.name);
 if(unit!=='项目整体')result.units=result.units.filter(u=>u.name===unit);
 result.notes=unique(result.notes);return result;
}

// Editorial output suppresses workflow labels; source status remains in state.
export function cleanDocumentText(text){return String(text).replace(/【待核】/g,'').replace(/【[^】]*(?:待补|待核|导入)[^】]*】/g,'—');}

// Imported source content is immutable: replacement/reclassification creates a
// new source. Reuse the derived document across readers without hashing images
// or rescanning all paragraphs every time a unit picker or grade table renders.
export function createDocumentComposer(){
 let previous=[],document;const unitDocuments=new Map();
 return (sources=[],unit='项目整体')=>{
  const inputs=sources.map(s=>[s,s.slot,s.hash,s.fragments,s.blocks]);
  if(!document||inputs.length!==previous.length||inputs.some((row,i)=>row.some((v,j)=>v!==previous[i][j]))){
   document=composeDocument(sources);previous=inputs;unitDocuments.clear();
  }
  if(unit==='项目整体')return document;
  if(!unitDocuments.has(unit))unitDocuments.set(unit,composeDocument(sources,unit));
  return unitDocuments.get(unit);
 };
}
