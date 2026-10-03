import {cafeteriaTemplate} from '../../ppt-template/cafeteria-template.js';
import {reportTable} from '../../../reference-report.js';
import {resolveText} from '../../../expansion-core.js';

export const templatePages=cafeteriaTemplate.pages;
export const templateVersion=cafeteriaTemplate.version;
const clean=v=>String(v??'').replace(/\[\[(?:table|image|measures):[^\]]+\]\]/g,'').replace(/【待核(?:引用)?】/g,'').trim();
const val=(p,...keys)=>String(keys.map(k=>p?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')??'');
const unitValue=(value,unit)=>value?value.endsWith(unit)?value:value+unit:'';
function fitText(text,width,height,size){
  const lines=String(text).split('\n');
  const fits=n=>lines.reduce((total,line)=>total+Math.max(1,Math.ceil([...line].reduce((a,c)=>a+(/[\u0000-\u007f]/.test(c)?.55:1),0)*n/Math.max(1,width-18))),0)*n*1.25<=height-8;
  while(size>10&&!fits(size))size-=.5;
  return Math.max(10,size);
}
export function pptExpansionData(state,templateContent={}){
  if(!state)return null;
  const s={...state,...templateContent};
  const units=reportTable(s,'units').rows.slice(2).map(row=>{const raw=s.document?.units?.find(u=>u.name===row.unitKey)||{};return {key:row.unitKey,name:row.values[0],floors:row.values[1],length:row.values[2],width:row.values[3],height:row.values[4],area:raw.area||'',nature:row.values[8]||raw.nature||'',structuralType:raw.structuralType||'',parameters:s.unitParameters?.[row.unitKey]||{}};});
  const section=id=>s.sections?.[id]?.hidden?'':clean(resolveText(s.sections?.[id]?.text||'',{facts:[],regulations:[],parameters:{},...s}));
  return {units,overview:section('overview'),selection:section('selection'),projectName:s.document?.projectName||s.identity?.projectName||'',location:s.document?.location||'',concrete:reportTable(s,'concrete').rows.slice(1).map(r=>r.values),concreteMeasures:s.templateTables?.concrete||[],templateText:s.templateText||{},source_id:'workbuddy:expansion:'+s.identity?.unit};
}
function summary(report,units,p){
  // Preserve manually authored overview paragraphs; omit figure/table captions and lists repeated by the table.
  const prose=report?.overview?.split(/\n+/).filter(x=>x&&!/^各单体.*(?:见表|面积|鸟瞰)|^图\d|^表\d/.test(x)).join('\n');
  if(prose)return prose;
  return [report?.location||p.region?`项目地点：${report?.location||p.region}`:'',...units.map(u=>[u.name,u.floors&&`层数${u.floors}`,u.height&&`高度${u.height}m`,u.area&&`面积${u.area}㎡`,u.nature].filter(Boolean).join('，'))].filter(Boolean).join('\n');
}
export function buildCafeteriaSlides(snapshot={},unitName='',edits={}){
  const chosen=snapshot.units?.find(u=>u.name===unitName);
  const p={...snapshot.params,...chosen?.parameters};
  const report=chosen?.report||snapshot.report;
  const units=(report?.units||[]).filter(u=>!unitName||unitName==='项目整体'||u.key===unitName||u.name===unitName);
  const source=report?.source_id||'workbuddy:expansion';
  const caption=unitName&&unitName!=='项目整体'?unitName+'结构设计':'结构设计';
  const spectrum=(keys,aggregate)=>keys.some(([,k])=>val(p,k))?keys.map(([name,k])=>{const v=val(p,k);return v?name+v:'';}).filter(Boolean).join('；'):val(p,aggregate);
  const rows7=[['建筑单体','结构体系','层数','减隔震','抗震缝'],...units.map(u=>{const up={...p,...u.parameters};return [u.name,up.struct_sys||u.structuralType||'',u.floors,up.has_iso==='true'?'隔震':up.has_damp==='true'?'减震':up.has_iso==='false'&&up.has_damp==='false'?'抗震':'',val(up,'seismic_joint')];})];
  const rows9=[['单体名称','结构类型','抗震等级',''],['','','框架','剪力墙'],...units.map(u=>{const up={...p,...u.parameters};return [u.name,up.struct_sys||u.structuralType||'',val(up,'g_frame'),val(up,'g_wall')];})];
  const grade=(pattern)=>report?.concrete?.filter(r=>pattern.test(r[1])).map(r=>r[2]).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('；')||'';
  let component='';const concrete=(report?.concreteMeasures||[]).slice(1).map(r=>{component=r[0]||component;return {name:component,where:r[1]||'',grade:r.find(v=>/^C\d/.test(v))||''};});
  const concreteGrade=(name,where)=>concrete.find(r=>name.test(r.name)&&(!where||where.test(r.where)))?.grade||'';
  const tableValues={
    '8:12':['',unitValue(val(p,'design_life'),'年'),val(p,'safety_grade'),val(p,'gamma0'),val(p,'seismic_cat'),val(p,'found_grade'),val(p,'anti_float')],
    '8:10':['',[unitValue(val(p,'intensity'),'度'),val(p,'pga')&&'（'+val(p,'pga')+'）'].join(''),val(p,'eq_group'),val(p,'site_class'),unitValue(val(p,'tg'),'s'),spectrum([['多遇地震','alpha_f'],['设防地震','alpha_m'],['罕遇地震','alpha_r']],'alpha_max'),spectrum([['多遇地震','th_f'],['设防地震','th_m'],['罕遇地震','th_r']],'timehist')],
    // Read component-specific measures, keeping underground and above-ground grades separate.
    '11:3':['',concreteGrade(/垫层/)||val(p,'concrete_cushion'),[grade(/筏板|承台|基础梁/)&&'底板、基础梁、承台：'+grade(/筏板|承台|基础梁/),grade(/地下室楼板/)&&'顶板：'+grade(/地下室楼板/)].filter(Boolean).join('\n'),grade(/地下室外墙/),concreteGrade(/框架柱/,/投影|主楼/),grade(/地下框架/),concreteGrade(/楼盖|框架梁|楼板/,/地上/),grade(/^框架柱$/)]
  };
  return templatePages.map(page=>({...page,shapes:page.shapes.map(original=>{
    const item=structuredClone(original);item.editId=`${templateVersion}:${page.number}:${item.id}`;
    if(item.kind==='image'){item.box[0]=Math.max(0,item.box[0]);item.box[1]=Math.max(65,item.box[1]);item.box[2]=Math.min(item.box[2],1280-item.box[0]);item.box[3]=Math.min(item.box[3],680-item.box[1]);}
    if(item.kind==='text'){
      if(item.id==='9'&&page.number>=7)item.box=[0,0,1200,61.394];
      if(item.field==='project'){item.text=val(p,'project_name')||report?.projectName||'';item.linked=true;}
      if(item.field==='overview'){item.text=summary(report,units,p);item.source=source;item.ai=true;}
      if(item.field==='materials'){item.text=[report?.templateText?.reinforcement&&'钢筋：\n'+report.templateText.reinforcement,report?.templateText?.steel&&'钢材：\n'+report.templateText.steel].filter(Boolean).join('\n\n');item.linked=true;}
      if(page.number>=12&&item.id==='9')item.text=page.number===18?'03  特殊转换':'02  '+caption;
      item.editable=Boolean(item.field&&!item.linked)||!item.field&&item.id!=='4';
      if(item.editable&&Object.hasOwn(edits,item.editId))item.text=edits[item.editId];
      if(item.field==='materials')item.box=[80,440,1112,245];
      item.style.size=fitText(item.text,item.box[2],item.box[3],item.style.size);
      return item;
    }
    if(item.kind==='table'){
      const dynamic=page.number===7?rows7:page.number===9?rows9:null;
      const data=dynamic?.length>(page.number===9?2:1)?dynamic:dynamic?[...dynamic,Array(item.cols.length).fill('')]:null;
      if(data){const headerCount=page.number===9?2:1;item.rows=data.map((row,i)=>{const proto=original.rows[i<headerCount?i:headerCount];return proto.map((cell,j)=>({...structuredClone(cell),text:row[j]||'',linked:i>=headerCount}));});item.heights=item.rows.map((r,i)=>original.heights[Math.min(i,original.heights.length-1)]);}
      const values=tableValues[`${page.number}:${item.id}`];
      if(page.number===11&&item.id==='3'){item.rows[4][1].text='主楼投影范围内地下室框架柱';item.rows[7][1].text='框架柱';}
      if(dynamic){const height=item.heights.reduce((a,b)=>a+b,0),scale=Math.min(1,item.box[3]/height);item.heights=item.heights.map(h=>h*scale);}
      item.rows.forEach((r,i)=>r.forEach((c,j)=>{
        if(values&&i>0&&j===r.length-1){c.text=values[i]||'';c.linked=true;}
        c.editId=`${item.editId}:${i}:${j}`;
        // Linked tables are read-only. The displacement comparison remains a blank manual table.
        c.editable=page.number===15&&i>0;
        if(c.editable&&Object.hasOwn(edits,c.editId))c.text=edits[c.editId];
        if(!c.skip)c.style.size=fitText(c.text,item.cols.slice(j,j+c.colSpan).reduce((a,b)=>a+b,0),item.heights.slice(i,i+c.rowSpan).reduce((a,b)=>a+b,0),c.style.size);
      }));
    }
    return item;
  })}));
}
