import {selectedRegulations,regulationNote} from './regulation-document.js';
import {irregularityCategories,irregularityAnswer,irregularityMeasureBlocks} from './irregularity-library.js';
import {REFERENCE_TABLES as T} from './reference-template-data.js';
export const referenceSections=[
 ['overview','1 工程概况'],['basis','2 设计依据'],['criteria','3 设计控制标准与等级'],['ground','4 工程地质'],['loads','5 荷载与作用'],['materials','6 主要结构材料'],['review','7 装配式'],['foundation','8 结构设计'],['selection','8.2 地下室及上部结构'],['model','9 结构计算分析'],['special','10 结构规则性判断与应对措施']
];
export const isoEnabled=s=>['是','有','采用','1','true'].includes(String(s.parameters?.has_iso))||['是','有','采用','1','true'].includes(String(s.parameters?.has_damp));
const aliases={found_gamma0:'gamma0_found',pile_grade:'pile',pile_gamma0:'pile_gamma',fire_class:'fire',period_factor:'period_reduce',eccentricity:'ecc_ratio',bidirectional:'bidir_eq',vertical_eq:'vert_eq',oblique_angle:'skew_angle',mode_method:'modal_combo',beam_stiffness:'stiff_amp'};
const value=(s,k)=>String(s.parameters?.[k]||s.parameters?.[aliases[k]]||s.document?.parameters?.[k]||'');
const tok=(s,k)=>s.parameters?.[k]?`{{p:${k}}}`:s.document?.parameters?.[k]||'';
const marker=k=>'[[table:'+k+']]';
const image=k=>'[[image:'+k+']]';
export function imageSlots(s){return [
 {id:'site-plan',caption:'图1.1 各层总平面图',section:'overview'},
 {id:'site-bird',caption:'图1.2 项目总体鸟瞰图',section:'overview'},
 ...(s.document?.units||[]).map((u,i)=>({id:'bird-'+u.name,caption:`图1.${i+3} ${u.name}总体鸟瞰图`,section:'overview'})),
 {id:'foundation-plan',caption:'图8.1 地基基础布置图',section:'foundation'},
 {id:'basement-model',caption:'图8.2 地下室整体结构计算模型',section:'selection'},
 ...(s.document?.units||[]).map((u,i)=>({id:'model-'+u.name,caption:`图8.3.${i+1} ${u.name}结构计算模型`,section:'selection'})),
 ...(s.document?.geotech?.images||[]).map(i=>({id:'geo-'+i.id,caption:i.caption,section:'ground',data:i.data,source_id:i.source_id}))
 ];}
export function referenceText(s,id){
 const d=s.document||{},p=k=>tok(s,k),units=d.units||[],figs=section=>imageSlots(s).filter(x=>x.section===section).map(x=>image(x.id)).join('\n');
 const tables=keys=>keys.map(marker).join('\n');
 const mainUnits=units.filter(u=>u.floors||u.structuralType||/连廊/.test(u.name));
 const geoImages=kind=>imageSlots(s).filter(x=>x.section==='ground'&&(kind==='terrain'?/地貌/.test(x.caption):kind==='strata'?/岩芯/.test(x.caption):!/地貌|岩芯/.test(x.caption))).map(x=>image(x.id)).join('\n');
 const texts={
 overview:[d.projectName?`本工程为${d.projectName}。`:'',d.location?`本项目建设地点位于${d.location}。`:'',d.totals?.total?`总建筑面积${d.totals.total}㎡，地上建筑面积${d.totals.above||''}㎡，地下建筑面积${d.totals.below||''}㎡。`:'','各单体性质和基本信息见表1。',marker('units'),'各单体建筑面积（㎡）：'+units.map(u=>u.name+' '+u.area).join('；')+'。',figs('overview')].join('\n\n'),
 basis:['2.1 国家设计标准与规范',marker('national'),'2.2 地方设计标准与规范',marker('local'),'2.3 岩土勘察报告',d.geotech?.report?`《${d.geotech.report}》。`:'','2.4 相关资料','建设单位提供的设计任务书及建筑专业提供的设计资料。'].join('\n\n'),
 criteria:['3.1 建筑结构分类等级',p('design_life')?`本项目结构设计工作年限为${p('design_life')}年。`:'',marker('classification'),'3.2 结构耐久性','3.2.1 混凝土结构耐久性设计',s.templateText?.durability||'',marker('durability'),'3.3 抗震设计控制标准',...(isoEnabled(s)?['减隔震设计要求：'+(p('isolation_requirement')||''),'3.3.1 地震作用',marker('earthquake'),'3.3.2 地震作用下结构侧移控制标准',marker('drift'),'3.3.3 抗震性能目标',marker('performance')]:['3.3.1 地震作用',marker('earthquake')]),'3.3.4 抗震等级',marker('grades'),'3.4 楼盖舒适度控制标准',marker('comfort')].join('\n\n'),
 ground:(d.geotech?.text||'4.1 场地地形及地貌\n\n4.2 场地地层岩性构成\n\n4.3 地基土层物理力学参数\n\n4.4 场地地震效应评价\n\n4.5 岩土工程评价').replace('4.2 场地地层岩性构成',geoImages('terrain')+'\n\n4.2 场地地层岩性构成').replace('4.3 地基土层物理力学参数',geoImages('strata')+'\n\n4.3 地基土层物理力学参数').replace('4.5 岩土工程评价',geoImages('seismic')+'\n\n4.5 岩土工程评价').replace('4.4 场地地震效应评价',marker('soil')+'\n\n4.4 场地地震效应评价').replace('4.4.3 场地地震液化判定',marker('site')+'\n\n4.4.3 场地地震液化判定'),
 loads:['5.1 楼屋面荷载','{{t:permanent}}',tables(['floor','roof','equipment']),'5.2 风荷载',`基本风压：${p('wind')}kN/㎡；地面粗糙度：${p('wind_rough')}。`,'5.3 温度作用',`基本气温最低${p('temp_low')}℃，最高${p('temp_high')}℃。`,'5.4 地下水位',d.waterText||'','5.5 填充墙荷载','{{t:wall}}'].join('\n\n'),
 materials:['6.1 混凝土',marker('concrete'),'6.2 钢筋','{{t:reinforcement}}','6.3 钢材','{{t:steel}}','6.4 填充墙体','{{t:masonry}}'].join('\n\n'),
 review:'7.1 装配式要求\n'+(s.facts||[]).filter(f=>f.origin==='decisions'&&f.status==='confirmed'&&/装配/.test(f.value)).map(f=>`{{f:${f.id}}}`).join('\n'),
 foundation:'8.1 地基基础\n'+(d.foundation||'').replace(/^5\.3[^\n]*\n/,'').replace(/\n\n5\.4[\s\S]*$/,'')+'\n'+units.filter(u=>/连廊/.test(u.name)).map((u,i)=>`8.1.${i+1} ${u.name}基础\n`).join('\n')+'\n'+figs('foundation'),
 selection:'8.2 地下室结构\n'+(p('basement_description')||'')+'\n'+image('basement-model')+'\n\n8.3 上部结构\n'+mainUnits.map((u,i)=>`8.3.${i+1} ${u.name}\n`+[u.floors?`${u.name}层数为${u.floors}。`:'',u.height?`建筑高度${u.height}m。`:'',u.use?`主要功能为${u.use}。`:'',`结构类型：${s.unitParameters?.[u.name]?.struct_sys||u.structuralType||p('struct_sys')}。`].join('')+'\n'+image('model-'+u.name)).join('\n\n'),
 model:['9.1 计算程序',p('software')?`结构计算分析与设计采用${p('software')}。`:'','9.2 计算分析主要参数',`抗震设防烈度${p('intensity')}度，设计基本地震加速度${p('pga')}，设计地震分组${p('eq_group')}，场地类别${p('site_class')}，特征周期${p('tg')}s。`,marker('parameters'),'9.3 主要计算结果汇总',marker('metrics')].join('\n\n'),
 special:'10.1 多层建筑规则性判断\n'+marker('regularity')+'\n'+(s.facts||[]).filter(f=>f.origin==='decisions'&&f.status==='confirmed'&&!/装配/.test(f.value)).map(f=>`{{f:${f.id}}}`).join('\n')+'\n\n10.2 结构不规则应对措施\n[[measures:regularity]]'
 };
 return texts[id]||'';
}
const base=(id,title)=>({kind:'table',template:id,title,rows:T[id].rows.map((r,i)=>({source:i,values:r.map(c=>c.text)}))});
const repeated=(id,title,heads,data,row)=>({...base(id,title),rows:[...base(id,title).rows.slice(0,heads),...data.map(v=>({source:row,values:v}))]});
export function reportTable(s,key){
 const v=k=>value(s,k),u=s.document?.units||[];
 if(key==='regularity'){
  const t=base(20,'表10.1-1 多层建筑不规则超限判定');
  t.rows[0].values[3]=s.regularity?.unit||(s.identity?.unit&&s.identity.unit!=='项目整体'?s.identity.unit:u[0]?.name)||'单体名称';
  t.rows=t.rows.map((r,i)=>{if(!i)return r;const prior=s.regularity?.rows?.find(x=>x.source===r.source);const category=irregularityCategories.find(c=>c.rowSource===r.source);const answer=irregularityAnswer(s,category.id);return {...r,values:[...(prior?.values||r.values).slice(0,3),answer==='yes'?'有':answer==='no'?'无':'']};});
  return t;
 }
 if(key==='units'){
  const t=repeated(1,'表1 结构单体性质和基本信息',2,u.map(x=>[x.name,x.floors,x.length||'',x.width||'',x.height||[x.planningHeight?x.planningHeight+'（规划）':'',x.fireHeight?x.fireHeight+'（消防）':''].filter(Boolean).join('\n'),x.span||'',x.basementStorey||'',(x.storeys||'').replace(/^共\d+层[，,]/,'').replace(/隔震层[^；。]*[；。]?/g,''),x.nature||'']),2);
  t.rows=t.rows.map((r,i)=>{const unitKey=i<2?'header:'+i:u[i-2].name;const edits=s.unitTable?.cells?.[unitKey]||{};return {...r,unitKey,manual:r.values.map((_,j)=>Object.hasOwn(edits,j)),values:r.values.map((v,j)=>Object.hasOwn(edits,j)?edits[j]:v)};}).filter(r=>r.source<2||!s.unitTable?.deleted?.includes(r.unitKey));
  return t;
 }
 if(key==='national'||key==='local'){
  const id=key==='national'?2:3;
  const selected=selectedRegulations(s,key);
  const custom=s.referenceNorms?.[key];
  const data=custom!==undefined?custom:selected.length?selected.map(r=>[r.title,[r.code,r.version&&!r.code?.includes(r.version)?r.version:''].filter(Boolean).join(' ')]):key==='national'?T[2].rows.slice(1).map(r=>r.map(c=>c.text)):[['','']];
  return repeated(id,key==='national'?'表2.1 国家设计标准与规范':'表2.2 地方设计标准与规范',1,data,1);
 }
 if(key==='classification'){
  const t=base(21,'表3.1 建筑结构分类等级'),keys=['','safety_grade','gamma0','found_grade','found_safety','found_gamma0','pile_grade','pile_safety','pile_gamma0','seismic_cat','civil_grade','fire_class','fire_grade','waterproof'];
  t.rows.forEach((r,i)=>{if(i){r.values[1]=v(keys[i]);}});return t;
 }
 if(key==='durability'){
  const data=s.templateTables?.durability?.slice(1);return data?.length?repeated(5,'表3.2.1 混凝土构件的环境类别',1,data.map(r=>[r[0]||'',r[1]||'',r[2]||'']),1):{...base(5,'表3.2.1 混凝土构件的环境类别'),rows:[base(5,'').rows[0],{source:1,values:[v('environment_class'),'','']} ]};
 }
 if(key==='earthquake'||key==='parameters'){
  const t=base(key==='earthquake'?6:18,key==='earthquake'?'表3.3.1 地震作用设计参数':'表9.2 主要输入计算参数汇总表');
  const map={'抗震设防烈度':'intensity','基本地震加速度':'pga','设计地震分组':'eq_group','场地类别':'site_class','场地土类别':'site_class','设计地震特征周期':'tg','特征周期':'tg','水平地震影响系数最大值':'alpha_max','水平地震影响系数最大值（中震）':'alpha_max','抗震设防类别':'seismic_cat','结构安全等级':'safety_grade','结构重要性系数':'gamma0','结构阻尼比':'damping','地震作用放大系数':'eq_amplification','周期折减系数':'period_factor','是否考虑偶然偏心':'eccentricity','是否考虑双向地震作用':'bidirectional','是否考虑竖向地震作用':'vertical_eq','斜交抗侧力构件方向角度':'oblique_angle','振型组合方法':'mode_method','计算振型数':'mode_count','嵌固端':'fixed_end','梁刚度放大系数':'beam_stiffness','抗震等级':'g_frame'};
  t.rows.forEach((r,i)=>{if(i)r.values[1]=v(map[r.values[0]]);});
  if(key==='parameters'){const row=t.rows.find(r=>r.values[0]==='水平地震影响系数最大值（中震）');if(row)row.values[1]=v('alpha_m');}
  return t;
 }
 if(key==='grades'){const grade=(p,k,d)=>{const a=p[k]??v(k),b=p[d]??v(d);return a&&b&&a!==b?a+'（'+b+'）':a;};const gradeUnits=[...u,...Object.keys(s.unitParameters||{}).filter(n=>!u.some(x=>x.name===n)&&n!=='项目整体').map(name=>({name}))];return repeated(9,'表3.3.4 结构构件抗震等级',2,gradeUnits.map(x=>{const p=s.unitParameters?.[x.name]||{};return [x.name,p.struct_sys||x.structuralType||'',grade(p,'g_frame','g_frame_m'),p.g_bigspan??v('g_bigspan'),grade(p,'g_wall','g_wall_m')];}),2);}
 if(key==='comfort')return base(10,'表3.4 竖向振动舒适度限值');
 if(key==='drift'){const t=base(7,'地震作用下结构侧移控制标准');t.rows.slice(1).forEach((r,i)=>{r.values[0]=T[7].rows[i+1][0].text;r.values[1]=v('drift_fortification');r.values[2]=v('drift_rare');});return t;}
 if(key==='performance'){const t=base(8,'表3.3.3 结构构件抗震性能目标');t.rows.slice(1).forEach(r=>{r.values[r.values.length-2]=v('performance_fortification');r.values[r.values.length-1]=v('performance_rare');});return t;}
 if(['floor','roof','equipment'].includes(key)){
  const id={floor:22,roof:23,equipment:24}[key],rows=s.templateTables?.[key]?.slice(1)||[];
  return repeated(id,{floor:'表5.1-1 楼面活荷载标准值',roof:'表5.1-2 屋面活荷载标准值',equipment:'表5.1-3 设备用房活荷载标准值'}[key],1,rows.map(r=>r.length>2&&/^\d+$/.test(r[0])?[r[1],r[2]]:[r[0]||'',r[1]||'']),1);
 }
 if(key==='concrete'){
  const t=base(17,'表6.1 结构构件混凝土强度等级');let component='';
  const rows=(s.templateTables?.concrete||[]).slice(1).map(r=>{component=r[0]||component;return {name:component,where:r[1]||'',grade:r.find(c=>/^C\d/.test(c))||''};});
  const find=(name,where)=>rows.find(r=>name.test(r.name)&&(!where||where.test(r.where)))?.grade||'';
  const vals=[find(/灌注桩|桩身/),find(/筏板|承台|基础梁/),find(/楼盖|楼板/,/地下/),find(/地下室外墙/),[['柱',find(/框架柱/,/纯地下室/)],['墙',find(/地下室室内.*墙/)]].filter(x=>x[1]).map(x=>x.join('：')).join('；'),find(/框架柱/,/地上/),find(/楼盖|框架梁/,/地上/),find(/楼盖|楼板/,/地上/)];
  t.rows.slice(1).forEach((r,i)=>r.values[2]=vals[i]);t.rows[6].values[1]='框架柱';return t;
 }
 if(key==='soil'){
  const geo=s.document?.geotech?.tables||[],strength=geo.find(x=>x.key==='strength')?.rows||[],pile=geo.find(x=>x.key==='pile')?.rows||[];
  const table=repeated(11,'表4.3 地基土层物理力学参数',2,strength.slice(1).filter(r=>r[0]).map(r=>{const pr=pile.find(p=>p[0]===r[0]);return [r[0],r[1]||'',r.at(-1)||'',r[4]||'',pr?.[1]||'',pr?.[2]||''];}),2);
  table.rows[0].values[4]=pile[0]?.[1]||'桩基';return table;
 }
 if(key==='site'){
  const rows=s.document?.geotech?.tables?.find(x=>x.key==='site')?.rows||[];
  return repeated(12,'表4.4 场地土类型、建筑场地类别',1,rows.slice(1).map(r=>[r[1]||'',r[4]||'',r[5]||'','',r[7]||'']),1);
 }
 if(key==='metrics'){
  const t=base(19,`表9.3 ${s.identity?.unit||'当前单体'}主要技术指标`),raw=s.model?.metrics||{},m={...raw,overturn_wind_x:raw.over_wind_x??raw.overturn_wind_x,overturn_wind_y:raw.over_wind_y??raw.overturn_wind_y,overturn_eq_x:raw.over_eq_x??raw.overturn_eq_x,overturn_eq_y:raw.over_eq_y??raw.overturn_eq_y};
  const map={0:['mass'],1:['unit_weight'],9:['angle'],11:['mass_coef_x','mass_coef_y'],12:['shear_x','shear_y'],13:['drift_wind_x','drift_wind_y'],14:['drift_env_x','drift_env_y'],15:['disp_ratio_x','disp_ratio_y'],16:['stiff_x','stiff_y'],17:['vcap_x','vcap_y'],18:['frame_moment_x','frame_moment_y'],19:['wall_axial_x','wall_axial_y'],20:['gravity_ratio_x','gravity_ratio_y'],21:['overturn_wind_x','overturn_wind_y'],22:['overturn_eq_x','overturn_eq_y']};
  for(const [index,keys]of Object.entries(map)){const r=t.rows[+index];keys.forEach((k,i)=>r.values[r.values.length-keys.length+i]=String(m[k]??''));}
  for(let i=3;i<=8;i++){const r=t.rows[i],period=m.periods?.find(p=>p.n===i-2);r.values[2]=String(period?.T??m['T'+(i-2)]??'');r.values[3]=String(period?.tr??m['translation'+(i-2)]??'');r.values[4]=String(period?.tor??m['torsion'+(i-2)]??'');}
  for(const [index,axis] of [[12,'x'],[12,'y']]){const col=axis==='x'?2:3;t.rows[index].values[col]=[m['shear_'+axis],m['shear_'+axis+'_r']?m['shear_'+axis+'_r']+'%':''].filter(Boolean).join(' / ');}
  return t;
 }
 return null;
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function nativeTableHTML(t,options={}){
 const rows=t.rows.map(r=>({...r,cells:T[t.template].rows[r.source]}));
 const grid=T[t.template].grid,total=grid.reduce((a,b)=>a+b,0);
 return `<p class="ref-caption">${esc(t.title)}</p><table class="ev-table ref-native"><colgroup>${grid.map(w=>`<col style="width:${100*w/total}%">`).join('')}</colgroup><tbody>`+rows.map((r,ri)=>{let col=0;return '<tr>'+r.cells.map((c,ci)=>{const start=col;col+=c.span;if(c.merge==='continue')return '';let span=1;if(c.merge==='restart')for(let j=ri+1;j<rows.length;j++){let at=0;const next=rows[j].cells.find(x=>{const match=at===start;at+=x.span;return match;});if(next?.merge!=='continue')break;span++;}const source=options.source?.(r,ri,ci)||'';const edit=options.editUnits?` contenteditable="${options.editable!==false}" data-unit-cell="${esc(r.unitKey)}" data-unit-col="${ci}"`: '';return `<td${edit}${source?` data-source-kind="${source}"`: ''} colspan="${c.span}" rowspan="${span}">${esc(r.values[ci]).replace(/\n/g,'<br>')}</td>`;}).join('')+(options.editUnits?(ri===0?'<td rowspan="2"></td>':ri===1?'':`<td class="ev-row-action"><button data-ev-write data-unit-delete="${esc(r.unitKey)}" aria-label="删除${esc(r.values[0])}行">删除</button></td>`):'')+'</tr>';}).join('')+'</tbody></table>';
}
export function sectionBlocks(s,id,resolved){
 const result=[];
 for(const line of resolved.split(/\n+/).filter(Boolean)){
  if(line==='[[measures:regularity]]'){result.push(...irregularityMeasureBlocks(s));continue;}
  const tm=/^\[\[table:([^\]]+)\]\]$/.exec(line),im=/^\[\[image:([^\]]+)\]\]$/.exec(line);
  if(tm){const t=reportTable(s,tm[1]);if(t){result.push({kind:'caption',text:t.title},t);if(['national','local'].includes(tm[1]))result.push({kind:'p',text:regulationNote(s,tm[1])});}continue;}
  if(im){const slot=imageSlots(s).find(x=>x.id===im[1]);if(slot){const upload=s.reportImages?.[slot.id];const data=upload?.data||slot.data;if(data){result.push({kind:'image',data});result.push({kind:'caption',text:upload?.caption||slot.caption});}}continue;}
  result.push({kind:/^\d+\.\d+\.\d+\s/.test(line)?'h3':/^\d+\.\d+\s/.test(line)?'h2':'p',text:line});
 }
 return result;
}
export function blocksHTML(blocks){return blocks.map(b=>b.kind==='table'?nativeTableHTML({...b,title:''}):b.kind==='image'?`<p class="ref-image"><img src="${b.data}" style="max-width:100%;max-height:420px" alt="项目插图"></p>`:`<${['h1','h2','h3'].includes(b.kind)?b.kind:'p'}>${esc(b.text)}</${['h1','h2','h3'].includes(b.kind)?b.kind:'p'}>`).join('');}
