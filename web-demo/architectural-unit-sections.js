// Read explicitly bounded building sections; do not infer structural height from architectural heights.
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const title=t=>/^(?:\d+(?:\.\d+)*[.、．]?|[一二三四五六七八九十]+、)\s*([^，。；：:]{2,45})$/.exec(t)?.[1];
// Keep distinct measurement meanings. An elevation is never a building height.
export const architecturalGeometryFields={
 height:{label:'建筑高度',fact:'height_arch_m'},
 planningHeight:{label:'规划高度',fact:'height_planning_m'},
 fireHeight:{label:'消防高度',fact:'height_fire_m'},
 structuralHeight:{label:'结构高度',fact:'height_m'},
 seismicHeight:{label:'抗震计算高度',fact:'height_seismic_m'},
 zeroElevation:{label:'±0.000对应绝对标高',fact:'elevation_zero_m'},
 absoluteElevation:{label:'绝对标高',fact:'elevation_absolute_m'},
 roofElevation:{label:'屋面结构标高',fact:'elevation_roof_m'},
};
const num='([+-]?\\d+(?:\\.\\d+)?)';
const metre='\\s*(?:m(?![a-z²2])|米)';
const join='\\s*(?:[（(][^（）()]{1,16}[）)])?\\s*(?:为|是|约为|约|取|[:：])?\\s*';
export function architecturalGeometry(text){
 const result=[];
 const patterns={height:'(?:^|[，,。；;：:\\s])建筑高度',planningHeight:'(?:建筑)?规划(?:建筑)?高度',fireHeight:'(?:建筑)?消防(?:建筑)?高度',structuralHeight:'结构(?:高度|总高)',seismicHeight:'(?:抗震计算|抗震查表|抗震设计)高度',roofElevation:'屋面(?:结构|板顶)标高'};
 for(const [key,label] of Object.entries(patterns))for(const m of text.matchAll(new RegExp(label+join+num+metre,'gi')))result.push({key,value:m[1],unit:'m',quote:m[0].trim()});
 // Explicit zero datum mapping only; standalone absolute levels keep their own meaning.
 const zero=/(?:±\s*0(?:\.0+)?|正负零)(?:[^。；;]{0,35}?)(?:相当于|对应|为|=|等于)\s*(?:绝对标高|绝对高程|黄海高程|黄海标高)?\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)\s*(?:m(?![a-z²2])|米)/gi;
 for(const m of text.matchAll(zero))result.push({key:'zeroElevation',value:m[1],unit:'m',quote:m[0]});
 if(!result.some(x=>x.key==='zeroElevation'))for(const m of text.matchAll(new RegExp('绝对(?:标高|高程)'+join+num+metre,'gi')))result.push({key:'absoluteElevation',value:m[1],unit:'m',quote:m[0]});
 return result;
}
export function applyArchitecturalGeometry(unit,items,source){
 unit.geometryEvidence||={};unit.geometryConflicts||={};
 for(const item of items){
  const {key,value}=item;
  const evidence={...item,source_id:source.source_id,locator:item.locator||unit.locator};
  const prior=unit.geometryEvidence[key]||[];
  if(!prior.some(p=>p.value===value&&p.locator===evidence.locator))prior.push(evidence);
  unit.geometryEvidence[key]=prior;
  const values=[...new Set([unit[key],...prior.map(p=>p.value)].filter(v=>v!==''&&v!==undefined))];
  if(values.length>1){unit[key]='';unit.geometryConflicts[key]=values;}
  else if(!unit.geometryConflicts[key])unit[key]=value;
 }
}
export function architecturalUnitSections(source){
 const ps=(source.blocks?.paras||[]).map(clean),out=[];
 for(let i=0;i<ps.length;i++){
  const name=title(ps[i]);if(!name)continue;
  let end=i+1;while(end<ps.length&&!title(ps[end]))end++;
  const own=ps.slice(i+1,end);
  // Both labels distinguish a building description from general design or code sections.
  const area=own.find(t=>/^(?:总建筑面积|建筑总面积|建筑面积)\s*[:：]/.test(t));
  const floor=own.find(t=>/^建筑层数\s*[:：]/.test(t));
  if(!area||!floor)continue;
  const u={name,area:/(?:面积)\s*[:：]\s*([\d,]+(?:\.\d+)?)\s*(?:㎡|m[²2]|平方米)/i.exec(area)?.[1]||'',floors:'',planningHeight:'',fireHeight:'',storeys:'',use:'',locator:'提取段落 '+(i+1)};
  const above=/地上\s*(\d+)\s*层/.exec(floor)?.[1],below=/地下\s*(\d+)\s*层/.exec(floor)?.[1];
  u.floors=(above||'')+(below?'；地下'+below:'');
  for(const t of own){
   if(/^层高\s*[:：]/.test(t))u.storeys=t.replace(/^层高\s*[:：]/,'').replace(/[；;]$/,'');
   for(const [key,re] of [['planningHeight',/^规划(?:建筑)?高度\s*[:：]\s*([\d.]+)\s*(?:m|米)/i],['fireHeight',/^消防(?:建筑)?高度\s*[:：]\s*([\d.]+)\s*(?:m|米)/i]])if(re.test(t))u[key]=re.exec(t)[1];
   if(t.startsWith(name)&&/设置|功能|用作|用途/.test(t))u.use=t.split(/(?<=[。])/).filter(x=>/设置|功能|用作|用途/.test(x)).join('');
   applyArchitecturalGeometry(u,architecturalGeometry(t).map(x=>({...x,locator:'提取段落 '+(ps.indexOf(t)+1)})),source);
  }
  const evidence=ps.slice(i,end).map((text,j)=>source.fragments?.find(f=>f.locator==='提取段落 '+(i+j+1))||{id:'SECTION-P'+(i+j+1),locator:'提取段落 '+(i+j+1),text});
  out.push({unit:u,evidence});i=end-1;
 }
 return out;
}

// Single named descriptions also occur in prose, without a numbered schedule.
// Require a named subject and its own dimensions; never enumerate planning neighbours.
export function architecturalNarrativeUnits(source){
 const out=[];
 for(const [i,p] of (source.blocks?.paras||[]).entries()){
  const text=clean(p);
  for(const sentence of text.split(/(?<=[。；])/)){
   const m=/^([^，。；：:]{1,24}?(?:楼|馆|中心|单体))\s*(?:位于|为|：|:)/.exec(sentence.trim());
   if(!m||!/建筑面积|层数|地上.{0,12}层|建筑高度|消防高度|结构高度|抗震计算高度/.test(sentence))continue;
   const name=m[1].replace(/^(?:本项目|本工程|其中|新建)/,'');
   if(/规划为|现状|原有|北侧|南侧|东侧|西侧/.test(m[1]))continue;
   let u=out.find(x=>x.name===name);
   if(!u){u={name,area:'',floors:'',use:'',source_id:source.source_id,locator:'提取段落 '+(i+1)};out.push(u);}
   const above=/地上\s*([\d、，,]+)\s*层/.exec(sentence)?.[1];
   const below=/地下\s*([一二三四五六七八九十两\d]+)\s*层/.exec(sentence)?.[1];
   const nums={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
   if(above||below)u.floors=(above||'')+(below?'；地下'+(nums[below]||below):'');
   // A following measurement sentence in the same paragraph keeps this subject
   // only if the paragraph contains no other measured building.
   const measured=text.split(/(?<=[。；])/).filter(t=>/^[^，。；]{1,24}(?:楼|馆|中心)\s*(?:位于|为|：|:)/.test(t.trim())&&/层数|建筑高度|消防高度/.test(t));
   applyArchitecturalGeometry(u,architecturalGeometry(measured.length===1?text.slice(text.indexOf(sentence)):sentence).map(x=>({...x,locator:'提取段落 '+(i+1)})),source);
  }
 }
 for(const u of out){
  const alias=u.name.replace(/楼$/,'');
  if(out.filter(x=>x.name.replace(/楼$/,'')===alias).length!==1)continue;
  for(const [i,p] of (source.blocks?.paras||[]).entries()){
   const text=clean(p),safe=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const area=new RegExp('^'+safe+'(?:楼)?(?:总建筑面积|建筑面积)\\s*(?:约为|约|为)?\\s*[:：]?\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:㎡|m[²2]|平方米)','i').exec(text);
   if(area){u.area=area[1];u.areaEvidence={source_id:source.source_id,locator:'提取段落 '+(i+1),quote:text,unit:'㎡'};}
   if(new RegExp('^(?:本(?:学生)?)?'+safe+'(?:楼)?为').test(text))u.use=text.split('。')[0].replace(/^.*?为/,'');
  }
 }
 return out;
}
