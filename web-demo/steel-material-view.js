// Presentation derived from the current project's materialSummary, never seed data.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
const GROUPS=[['beam','梁'],['column','柱'],['wall','墙'],['slab','板'],['other','其他 / 未归类']];
export function rebarGroup(name){
  const n=String(name||'').replace(/\s+/g,'');
  if(/^(梁|墙梁|框架梁|连梁)$/.test(n))return 'beam';
  if(/^(柱|框架柱)$/.test(n))return 'column';
  if(/^(墙|墙身|剪力墙|边缘构件|约束边缘构件|构造边缘构件)$/.test(n))return 'wall';
  if(/^(板|楼板|悬挑板)$/.test(n))return 'slab';
  return 'other';
}
export function steelPresentation(summary){
  const floors=summary.floors.filter(f=>f.kg!==null).map(f=>{
    const mass=Object.fromEntries(GROUPS.map(([key])=>[key,null]));
    for(const c of f.components){const key=rebarGroup(c.cat);mass[key]=(mass[key]??0)+Number(c.total||0);}
    const rates=Object.fromEntries(GROUPS.map(([key])=>[key,mass[key]!==null&&f.areaR>0?mass[key]/f.areaR:null]));
    return {...f,mass,rates};
  });
  const groups=GROUPS.filter(([key])=>key!=='other'||floors.some(f=>f.mass.other!==null));
  const components=groups.map(([key,label])=>{
    const reported=floors.filter(f=>f.mass[key]!==null);
    const kg=reported.length?reported.reduce((s,f)=>s+f.mass[key],0):null;
    return {key,label,kg,rate:kg!==null&&summary.steelRate!==null?kg/summary.areaR:null,share:kg!==null&&summary.kg>0?kg/summary.kg:null};
  });
  return {floors,groups,components};
}
function table(headers,rows,footer){
  const cells=(row,tag)=>row.map(v=>`<${tag}>${esc(v)}</${tag}>`).join('');
  return '<div class="im-scroll"><table class="im-material-table"><thead><tr>'+cells(headers,'th')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cells(r,'td')+'</tr>').join('')+'</tbody>'+(footer?'<tfoot><tr>'+cells(footer,'td')+'</tr></tfoot>':'')+'</table></div>';
}
export function renderMaterialTables(t){
  const p=steelPresentation(t);
  let charts='';
  if(p.floors.length){
    const maxRate=Math.max(10,...p.floors.map(f=>f.steelRate??0)),top=Math.ceil(maxRate/10)*10;
    const bars=p.components.map(c=>'<div class="im-component-row"><span>'+esc(c.label)+'</span><div class="im-component-track"><i style="width:'+((c.share??0)*100)+'%"></i></div><b>'+fmt(c.rate)+'</b><small>'+(c.share===null?'—':fmt(c.share*100,1)+'%')+'</small></div>').join('');
    const floors=p.floors.map(f=>'<div class="im-floor-column" title="'+esc(f.floor)+'层：'+fmt(f.steelRate)+' kg/m²"><div class="im-floor-track"><b style="bottom:'+((f.steelRate??0)/top*100)+'%">'+fmt(f.steelRate,1)+'</b><i style="height:'+((f.steelRate??0)/top*100)+'%"></i></div><span>'+esc(f.floor)+'层</span></div>').join('');
    charts='<div class="im-material-charts"><section><h4>钢筋构件单方量 <small>kg/m² / 占比</small></h4>'+bars+'</section><section><h4>楼层钢筋单方量 <small>kg/m² · 纵轴 0–'+top+'</small></h4><div class="im-floor-scroll"><div class="im-floor-chart">'+floors+'</div></div></section></div>';
  }
  const rebarRows=p.floors.map(f=>[f.floor+'层',fmt(f.areaR>0?f.areaR:null),...p.groups.map(([key])=>fmt(f.rates[key])),fmt(f.steelRate),fmt(f.kg/1000,3)]);
  const rebarTotal=['汇总',fmt(t.areaR>0?t.areaR:null),...p.components.map(c=>fmt(c.rate)),fmt(t.steelRate),fmt(t.tonnes,3)];
  const rebar='<details class="im-material-section" open><summary>楼层钢筋</summary>'+charts+(p.floors.length?table(['楼层','楼面面积(m²)',...p.groups.map(([,label])=>label+'(kg/m²)'),'合计(kg/m²)','钢筋总量(t)'],rebarRows,rebarTotal):'<p class="im-muted">尚未导入</p>')+'</details>';
  const concrete=t.floors.filter(f=>f.volume!==null);
  const concreteRows=concrete.map(f=>[f.floor+'层',fmt(f.concreteRate,3)]);
  return rebar+'<details class="im-material-section" open><summary>上部混凝土单方量</summary>'+(concrete.length?table(['楼层','单方量(m³/m²)'],concreteRows,['汇总',fmt(t.concreteRate,3)]):'<p class="im-muted">尚未导入</p>')+'</details><details class="im-material-section" open><summary>基础混凝土</summary>'+(t.base.length?table(['基础构件','混凝土量(m³)'],t.base.map(r=>[r.name,fmt(Number(r.sum),3)]),['合计',fmt(t.foundation,3)]):'<p class="im-muted">尚未导入</p>')+'</details>';
}
export function materialCsvRows(summary,unit){
  const p=steelPresentation(summary);
  const byFloor=new Map(p.floors.map(f=>[f.floor,f]));
  return [['单体','楼层','钢筋面积(m²)',...p.groups.map(([,label])=>label+'(kg/m²)'),'钢筋合计(kg/m²)','钢筋总量(t)','上部混凝土单方量(m³/m²)','基础混凝土量(m³)','首层面积(m²)','基础混凝土单方量(m³/m²)'],...summary.floors.map(f=>[unit,f.floor,f.kg!==null&&f.areaR>0?f.areaR:null,...p.groups.map(([key])=>byFloor.get(f.floor)?.rates[key]??null),f.steelRate,f.kg===null?null:f.kg/1000,f.concreteRate,null,null,null]),[unit,'汇总',summary.areaR||null,...p.components.map(c=>c.rate),summary.steelRate,summary.tonnes,summary.concreteRate,summary.foundation,summary.firstFloorArea,summary.foundationRate]];
}
