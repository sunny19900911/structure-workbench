import {detailedGeotech} from './geotech-document.js';
// Direct document composition from this project's uploaded sources, without
// promoting extracted text to signed engineering decisions or model results.
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
const clean=s=>tidy(s).replace(/^[（(][一二三四五六七八九十\d]+[）)]\s*/,'');
const unique=a=>[...new Set(a.filter(Boolean))];
const sentences=s=>clean(s).split(/(?<=[。；])/).map(tidy).filter(Boolean);
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const number=s=>/^\d[\d,]*(?:\.\d+)?$/.test(tidy(s));
function rows(source){return source.fragments.filter(f=>/表\s*\d+/.test(f.locator||'')).map(f=>({...f,cells:f.cells||f.text.split('；').map(c=>c.replace(/^[^：]*：/,''))}));}
function paragraphSource(source){return (source?.fragments||[]).filter(f=>! /表\s*\d+/.test(f.locator||'')&&f.text.length>15);}
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
  result.projectName=read(/(?:项目名称|工程名称)\s*[:：]\s*(.+?)(?=\s+设计证书|\s+项目编号|$)/).replace(/[。；].*$/,'');
  result.location=read(/(?:建设地点|项目地点|工程地点)\s*[:：]\s*([^。；]+)/);
  const tableId=f=>/表\s*(\d+)/.exec(f.locator||'')?.[1];
  const header=tableRows.find(f=>/栋号|单体名称|建筑名称/.test(f.cells.join('|'))&&/建筑面积/.test(f.cells.join('|')));
  if(header){
   const nameIndex=header.cells.findIndex(c=>/^(栋号|单体名称|建筑名称)$/.test(tidy(c)));
   const areaIndex=header.cells.findIndex(c=>/^建筑面积/.test(tidy(c)));
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
  // Header-only cells and feasibility-study columns are not project values.
  const totals={};for(const row of tableRows){for(const [key,label]of [['total','总建筑面积'],['above','地上建筑面积'],['below','地下建筑面积']]){const at=row.cells.findIndex(c=>tidy(c)===label);if(at>=0&&number(row.cells[at+1])&&!totals[key]){totals[key]=tidy(row.cells[at+1]);remember(arch,row);}}}
  result.totals=totals;
  result.overview='1.1 工程建设地点\n'+[result.projectName?'本工程为'+result.projectName+'。':'',result.location?'建设地点位于'+result.location+'。':''].join('')+'\n\n1.2 建筑设计概况\n'+(totals.total?'总建筑面积'+totals.total+'㎡'+(totals.above?'，地上建筑面积'+totals.above+'㎡':'')+(totals.below?'，地下建筑面积'+totals.below+'㎡':'')+'。':'')+'\n各单体建筑规模及主要功能见下表。';
  for(const u of result.units){if(u.planningHeight&&u.fireHeight&&u.planningHeight!==u.fireHeight)result.notes.push(`${u.name}分别列出规划高度${u.planningHeight}m、消防高度${u.fireHeight}m，不作为结构计算高度。`);}
 }
 if(geo){
  const paras=paragraphSource(geo).filter(f=>f.text.length>35);
  const pick=re=>{const f=paras.filter(f=>re.test(f.text)).at(-1);remember(geo,f);return f?.text||'';};
  const summary=pick(/地貌上处于.*(?:建筑适宜性|基本适宜)/)||pick(/场地.*(?:基本稳定|建筑适宜性)/);
  const land=sentences(summary).filter(t=>/地貌|特殊性岩土|不良地质|基本稳定|建筑适宜性/.test(t)).join('').replace('有：为','为').replace('地形坡度约为地形坡度约为','地形坡度约为');
  const site=pick(/本工程建筑场地类别划分为/);result.parameters.site_class=/(?:本工程)?建筑场地类别划分为\s*([ⅠⅡⅢⅣIV]+类)/.exec(site)?.[1]||'';
  const adverse=sentences(site).find(t=>/抗震不利地段/.test(t))||'';
  const liquefaction=pick(/无饱和.*(?:粉土|砂).*液化/),subsidence=pick(/③2.*(?:存在震陷|需考虑震陷)/);
  const collapse=sentences(subsidence).filter(t=>/③2.*软塑/.test(t)).join('')+(subsidence.match(/③2黏土亦?存在震陷的可能[^。]*。/)?.[0]||'');
  const water=pick(/所有.*钻孔.*(?:未测到地下水|未见到稳定.*地下水)/);
  const waterText=sentences(water).filter(t=>/未测到地下水|未见到稳定.*地下水/.test(t)).join('');
  const corrosion=pick(/综合评定.*腐蚀性/);const corrosionText=sentences(corrosion).filter(t=>/综合评定|钢筋具|钢结构具/.test(t)).map(t=>t.includes('综合评定')?t.slice(t.indexOf('综合评定')):t).join('');
  result.ground='5.1 场地与工程地质\n根据岩土工程勘察报告，'+land+'\n'+[result.parameters.site_class?'建筑场地类别为'+result.parameters.site_class+'。':'',adverse,liquefaction,collapse].filter(Boolean).join('')+'\n\n5.2 水文地质与腐蚀性\n'+waterText+corrosionText;
  const foundation=pick(/可供选择的桩型|建议采用桩基础/);
  const foundationText=sentences(foundation).filter(t=>/建议采用桩基础|可供选择的桩型|桩端持力层/.test(t)).join('');
  const karst=clean(pick(/岩溶.*一桩一孔/));
  const antifloat=pick(/抗浮设计水位按/);
  result.waterText=sentences(antifloat).filter(t=>/抗浮设计水位按|场地整平标高.*复核/.test(t)).join('');
  result.foundation='5.3 地基基础方案\n勘察报告提出如下基础建议：'+foundationText+'\n'+karst+'\n\n5.4 地下结构抗浮\n'+(result.waterText?'考虑雨季滞水及基坑积水作用，勘察报告建议的抗浮水位如下：\n'+result.waterText:'');
  const quake=pick(/地震动峰值加速度.*第三组/);
  result.parameters.pga=/(?:地震动峰值加速度为|地震动峰值加速度为)\s*([\d.]+g)/.exec(quake)?.[1]||'';
  result.parameters.eq_group=/设计地震分组为\s*(第[一二三]组)/.exec(quake)?.[1]||'';
  const intensity=/地震烈度(?:值)?为\s*([ⅥⅦⅧⅨ6-9]+)度/.exec(quake)?.[1];result.parameters.intensity=({'Ⅵ':'6','Ⅶ':'7','Ⅷ':'8','Ⅸ':'9'})[intensity]||intensity||'';
  if(/附图|分区/.test(result.waterText))result.notes.push('抗浮水位按报告部位分别列示，范围值保留分区条件，不合并成全项目统一水位。');
 }
 result.geotech=detailedGeotech(geo);
 if(geo){
  const designRows=rows(geo).filter(f=>/建筑物名称：|建（构）筑物名称：/.test(f.text)&&/结构类型：/.test(f.text));
  for(const u of result.units){
   const row=designRows.find(f=>f.text.includes('建筑物名称：'+u.name+'；'));
   u.structuralType=row?.text.match(/结构类型：([^；]+)/)?.[1]||'';
   const own=paragraphSource(arch).filter(f=>new RegExp('^'+escape(u.name)+'\\s*[:：—]').test(f.text)).map(f=>f.text).join(' ');
   for(const [key,re] of Object.entries({length:/(?:建筑)?长度(?:为|约|：)?\s*([\d.]+)m/,width:/(?:建筑)?宽度(?:为|约|：)?\s*([\d.]+)m/,span:/主要跨度(?:为|约|：)?\s*([\d.]+)m/,height:/建筑高度(?:为|约|：)?\s*([\d.]+)m/}))u[key]=re.exec(own)?.[1]||'';
  }
 }
 result.allUnitNames=result.units.map(u=>u.name);
 if(unit!=='项目整体')result.units=result.units.filter(u=>u.name===unit);
 result.notes=unique(result.notes);return result;
}

// Editorial output suppresses workflow labels; source status remains in state.
export function cleanDocumentText(text){return String(text).replace(/【待核】/g,'').replace(/【[^】]*(?:待补|待核|导入)[^】]*】/g,'—');}
