(function(){
  'use strict';

  const REBAR_ROWS=[
    ['第1层',5172.58,129.739482,26.496951,66.888256,57.159059],
    ['第2层',5316.43,131.816725,39.603720,22.905579,52.689400],
    ['第3层',3644.74,85.010335,23.031753,16.050943,27.629750],
    ['第4层',3566.08,78.183146,18.752625,13.534346,26.699850],
    ['第5层',4030.40,92.643019,18.122747,8.523769,31.083160],
    ['第6层',3557.61,76.059826,16.135404,8.392113,26.665220],
    ['第7层',4030.40,91.885007,15.069824,8.348592,30.461770],
    ['第8层',3566.08,77.965220,11.560660,8.326150,26.764010],
    ['第9层',4030.40,114.725359,16.244305,9.032581,29.689270],
    ['第10层',3562.17,74.843387,9.632854,8.116605,21.443769],
    ['第11层',3562.17,81.292013,8.537683,8.205057,20.957979],
    ['第12层',3562.17,71.679433,8.672335,8.399154,25.372000],
    ['第13层',3562.17,31.676971,8.292784,7.124235,3.426130]
  ].map(function(r){return {floor:r[0],area:r[1],beam:r[2],column:r[3],wall:r[4],slab:r[5]};});

  const CONCRETE_ROWS=[
    {floor:'第1自然层',wall:5164.440,beam:2899.083,column:2063.040,slab:5835.177,cantilever:28.459,area:26710.166}
  ];
  const FOUNDATION_ROWS=[
    {name:'承台',value:3715.665},
    {name:'承台桩',value:19881.098},
    {name:'基础梁',value:2.638},
    {name:'底板 / 筏板',value:14286.841},
    {name:'板桩（梁下桩）',value:75.430},
    {name:'下探柱',value:47.594},
    {name:'下探墙',value:170.172}
  ];

  function cloneRows(rows){return rows.map(function(r){return Object.assign({},r);});}
  function scaledRows(rows,factor,areaFactor){
    return rows.map(function(r){
      const o=Object.assign({},r);
      Object.keys(o).forEach(function(k){if(typeof o[k]==='number') o[k]*=(k==='area'?(areaFactor||factor):factor);});
      return o;
    });
  }
  const UNIT_A={
    id:'A',name:'单体 A · 主楼',meta:'13 层 · 当前演示绑定三类样本',scope:'真实钢筋表 + 105 样本混凝土 / 基础',
    rebar:cloneRows(REBAR_ROWS),concrete:cloneRows(CONCRETE_ROWS),foundation:cloneRows(FOUNDATION_ROWS),foundationArea:26710.166,
    sources:{concrete:'上部结构工程量（地下室顶板）.txt',rebar:'主楼钢筋用量.xls',foundation:'基础混凝土用量.txt'},
    sourceIds:{concrete:'LEGACY-105-UPPER',rebar:'LEGACY-105-MAIN-REBAR',foundation:'LEGACY-105-BASE'},
    warning:'第1层板的来源合计为 21 kg，与直径分项求和 57,159.059 kg 不一致；当前按分项求和，待负责人确认。',
    status:'待复核'
  };
  const UNIT_B={
    id:'B',name:'单体 B · 演示单体',meta:'6 层 · 演示构造数据',scope:'仅演示项目—单体—材料表交互，不进入正式汇总',
    rebar:scaledRows(REBAR_ROWS.slice(0,6),.43,.52),concrete:scaledRows(CONCRETE_ROWS,.41,.52),foundation:scaledRows(FOUNDATION_ROWS,.38),foundationArea:13889.286,
    sources:{concrete:'DEMO-B_上部混凝土.xlsx',rebar:'DEMO-B_钢筋用量.xlsx',foundation:'DEMO-B_基础混凝土.xlsx'},
    sourceIds:{concrete:'DEMO-SRC-B-CONC',rebar:'DEMO-SRC-B-REBAR',foundation:'DEMO-SRC-B-BASE'},
    warning:'单体 B 为界面演示构造数据，不进入项目统计或横向比较。',status:'演示数据'
  };
  const project={name:'演示项目',units:[UNIT_A,UNIT_B],updated:'2026-09-25 16:30'};
  const UNIT_C={
    id:'C',name:'单体 C · 演示单体',meta:'10 层 · 负责人端演示数据',scope:'仅用于演示多单体材料总览，不进入正式项目统计',
    rebar:scaledRows(REBAR_ROWS.slice(0,10),.72,.78),concrete:scaledRows(CONCRETE_ROWS,.69,.76),foundation:scaledRows(FOUNDATION_ROWS,.66),foundationArea:20299.726,
    sources:{concrete:'',rebar:'',foundation:''},sourceIds:{concrete:'',rebar:'',foundation:''},warning:'',status:'演示数据'
  };
  const UNIT_D={
    id:'D',name:'单体 D · 演示单体',meta:'8 层 · 负责人端演示数据',scope:'仅用于演示多单体材料总览，不进入正式项目统计',
    rebar:scaledRows(REBAR_ROWS.slice(0,8),.55,.61),concrete:scaledRows(CONCRETE_ROWS,.58,.64),foundation:scaledRows(FOUNDATION_ROWS,.51),foundationArea:17094.506,
    sources:{concrete:'',rebar:'',foundation:''},sourceIds:{concrete:'',rebar:'',foundation:''},warning:'',status:'演示数据'
  };
  project.units.push(UNIT_C,UNIT_D);
  const state={
    view:'designer',
    openUnits:{A:true,B:false,C:false,D:false},
    openMaterials:{
      A:{concrete:true,rebar:true,foundation:true},
      B:{concrete:true,rebar:true,foundation:true},
      C:{concrete:true,rebar:true,foundation:true},
      D:{concrete:true,rebar:true,foundation:true}
    }
  };

  function nsum(list,key){return list.reduce(function(s,r){return s+(Number(r[key])||0);},0);}
  function fmt(n,d){return Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function materialName(k){return {concrete:'上部混凝土',rebar:'钢筋',foundation:'基础混凝土'}[k]||k;}
  function totals(unit){
    const rebar={beam:nsum(unit.rebar,'beam'),column:nsum(unit.rebar,'column'),wall:nsum(unit.rebar,'wall'),slab:nsum(unit.rebar,'slab')};
    rebar.total=rebar.beam+rebar.column+rebar.wall+rebar.slab;
    const concrete={wall:nsum(unit.concrete,'wall'),beam:nsum(unit.concrete,'beam'),column:nsum(unit.concrete,'column'),slab:nsum(unit.concrete,'slab')+nsum(unit.concrete,'cantilever')};
    concrete.total=concrete.wall+concrete.beam+concrete.column+concrete.slab;
    const foundation=unit.foundation.reduce(function(s,r){return s+r.value;},0);
    return {rebar:rebar,concrete:concrete,foundation:foundation,area:nsum(unit.rebar,'area')};
  }

  function donut(title,items,total,unit){
    const colors=['#367de7','#ef9a3a','#48ad78','#8266d9','#6f93b8'];
    let offset=0;
    const circles=items.map(function(item,i){
      const pct=total?item.value/total*100:0;
      const out='<circle cx="52" cy="52" r="37" pathLength="100" fill="none" stroke="'+colors[i]+'" stroke-width="14" stroke-linecap="butt" stroke-dasharray="'+pct+' '+(100-pct)+'" stroke-dashoffset="-'+offset+'" transform="rotate(-90 52 52)"></circle>';
      offset+=pct; return out;
    }).join('');
    const legend=items.map(function(item,i){const pct=total?item.value/total*100:0;return '<li><i style="background:'+colors[i]+'"></i><span>'+esc(item.label)+'</span><b>'+pct.toFixed(1)+'%</b><em>'+fmt(item.value,3)+' '+unit+'</em></li>';}).join('');
    return '<section class="steel-donut-card"><div class="steel-chart-title"><strong>'+esc(title)+'</strong><span>按构件分类</span></div><div class="steel-donut-layout"><svg viewBox="0 0 104 104" role="img" aria-label="'+esc(title)+'">'+circles+'<text x="52" y="47" text-anchor="middle">合计</text><text class="total" x="52" y="62" text-anchor="middle">'+fmt(total,3)+'</text></svg><ul>'+legend+'</ul></div></section>';
  }

  function charts(unit){
    const t=totals(unit);
    return '<div class="steel-chart-grid">'
      +donut('钢筋构件占比',[{label:'梁',value:t.rebar.beam},{label:'柱',value:t.rebar.column},{label:'墙',value:t.rebar.wall},{label:'板',value:t.rebar.slab}],t.rebar.total,'t')
      +donut('混凝土构件占比',[{label:'墙',value:t.concrete.wall},{label:'梁',value:t.concrete.beam},{label:'柱',value:t.concrete.column},{label:'楼板',value:t.concrete.slab}],t.concrete.total,'m³')
      +'</div>';
  }

  function rebarTable(unit){
    function intensity(value,area){return area>0?fmt(value*1000/area,2):'—';}
    let totalArea=0,totalBeam=0,totalColumn=0,totalWall=0,totalSlab=0;
    const rows=unit.rebar.map(function(r){
      const total=r.beam+r.column+r.wall+r.slab,ratio=r.area?total*1000/r.area:0;
      totalArea+=r.area;totalBeam+=r.beam;totalColumn+=r.column;totalWall+=r.wall;totalSlab+=r.slab;
      return '<tr><td>'+esc(r.floor)+'</td><td class="num">'+fmt(r.area,2)+'</td><td class="num">'+intensity(r.beam,r.area)+'</td><td class="num">'+intensity(r.column,r.area)+'</td><td class="num">'+intensity(r.wall,r.area)+'</td><td class="num">'+intensity(r.slab,r.area)+'</td><td class="num strong">'+intensity(total,r.area)+'</td><td class="num">'+fmt(total*1000,3)+'</td></tr>';
    }).join('');
    const total=totalBeam+totalColumn+totalWall+totalSlab;
    return '<div class="steel-table-head"><div><strong>各层钢筋用量表</strong><span>'+esc(unit.name)+'</span></div><span>构件单方：kg/m²；汇总按总楼面面积加权</span></div><div class="steel-table-wrap"><table class="steel-data-table"><thead><tr><th>楼层</th><th>楼面面积(m²)</th><th>梁(kg/m²)</th><th>柱(kg/m²)</th><th>墙(kg/m²)</th><th>板(kg/m²)</th><th>合计(kg/m²)</th><th>钢筋总量(kg)</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td>汇总</td><td class="num">'+fmt(totalArea,2)+'</td><td class="num">'+intensity(totalBeam,totalArea)+'</td><td class="num">'+intensity(totalColumn,totalArea)+'</td><td class="num">'+intensity(totalWall,totalArea)+'</td><td class="num">'+intensity(totalSlab,totalArea)+'</td><td class="num">'+intensity(total,totalArea)+'</td><td class="num">'+fmt(total*1000,3)+'</td></tr></tfoot></table></div>';
  }

  function concreteTable(unit){
    let area=0,wall=0,beam=0,column=0,slab=0,cantilever=0;
    const rows=unit.concrete.map(function(r){
      const total=r.wall+r.beam+r.column+r.slab+r.cantilever,unitValue=r.area?total/r.area:0;
      area+=r.area;wall+=r.wall;beam+=r.beam;column+=r.column;slab+=r.slab;cantilever+=r.cantilever;
      return '<tr><td>'+esc(r.floor)+'</td><td class="num">'+fmt(r.wall,3)+'</td><td class="num">'+fmt(r.beam,3)+'</td><td class="num">'+fmt(r.column,3)+'</td><td class="num">'+fmt(r.slab,3)+'</td><td class="num">'+fmt(r.cantilever,3)+'</td><td class="num strong">'+fmt(total,3)+'</td><td class="num">'+fmt(r.area,2)+'</td><td class="num">'+fmt(unitValue,3)+'</td></tr>';
    }).join('');
    const total=wall+beam+column+slab+cantilever;
    return '<div class="steel-table-head"><div><strong>按楼层混凝土用量</strong><span>'+esc(unit.name)+'</span></div><span>单位：m³、m³/m²</span></div><div class="steel-table-wrap"><table class="steel-data-table wide"><thead><tr><th>楼层</th><th>墙</th><th>梁</th><th>柱</th><th>楼板</th><th>悬挑板</th><th>合计</th><th>楼面面积(m²)</th><th>单方</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td>合计</td><td class="num">'+fmt(wall,3)+'</td><td class="num">'+fmt(beam,3)+'</td><td class="num">'+fmt(column,3)+'</td><td class="num">'+fmt(slab,3)+'</td><td class="num">'+fmt(cantilever,3)+'</td><td class="num">'+fmt(total,3)+'</td><td class="num">'+fmt(area,2)+'</td><td class="num">'+fmt(total/area,3)+'</td></tr></tfoot></table></div>';
  }

  function foundationTable(unit){
    const total=unit.foundation.reduce(function(s,r){return s+r.value;},0);
    const rows=unit.foundation.filter(function(r){return r.value>0;}).map(function(r){return '<tr><td>'+esc(r.name)+'</td><td class="num">'+fmt(r.value,3)+'</td><td class="num">'+(total?r.value/total*100:0).toFixed(2)+'%</td></tr>';}).join('');
    return '<div class="steel-table-head"><div><strong>基础混凝土用量</strong><span>只保留有效构件和体积</span></div><span>单位：m³</span></div><div class="steel-foundation-layout"><div class="steel-table-wrap"><table class="steel-data-table compact"><thead><tr><th>基础构件</th><th>混凝土量(m³)</th><th>占比</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td>合计</td><td class="num">'+fmt(total,3)+'</td><td class="num">100.00%</td></tr></tfoot></table></div><dl class="steel-foundation-summary"><div><dt>基础面积</dt><dd>'+fmt(unit.foundationArea,3)+' <small>m²</small></dd></div><div><dt>混凝土合计</dt><dd>'+fmt(total,3)+' <small>m³</small></dd></div><div><dt>基础单方 / 折算厚度</dt><dd>'+fmt(total/unit.foundationArea,3)+' <small>m³/m²</small></dd></div></dl></div>';
  }

  function sourceRail(unit,role){
    return '<div class="steel-source-rail">'+['concrete','rebar','foundation'].map(function(k){
      return '<button class="steel-source-file" data-material-tab="'+k+'" data-unit="'+unit.id+'"><span>'+materialName(k)+'</span><strong>'+esc(unit.sources[k])+'</strong><small>source_id：'+esc(unit.sourceIds[k])+'</small></button>';
    }).join('')+(role==='designer'?'<div class="steel-upload-actions"><span>更新当前单体资料</span><button data-source-upload="stq">混凝土 TXT</button><button data-source-upload="sts">钢筋 XLS/XLSX</button><button data-source-upload="stb">基础 TXT</button></div>':'')+'</div>';
  }

  function unitPanel(unit,role){
    const open=state.openUnit===unit.id,tab=state.tabs[unit.id]||'rebar';
    let table=tab==='rebar'?rebarTable(unit):(tab==='concrete'?concreteTable(unit):foundationTable(unit));
    const decision=role==='reviewer'?'<div class="steel-review-decision"><div><strong>负责人处理</strong><span id="steel-review-result">'+(state.reviewDecision||'请核对来源合计、构件归类和统计范围后处理。')+'</span></div><button data-review-action="return">退回补正</button><button class="primary" data-review-action="accept">确认按分项求和</button></div>':'';
    return '<article class="steel-unit'+(open?' open':'')+'"><button class="steel-unit-head" data-unit-toggle="'+unit.id+'" aria-expanded="'+open+'"><span class="chevron">'+(open?'⌄':'›')+'</span><span><strong>'+esc(unit.name)+'</strong><small>'+esc(unit.scope)+'</small></span><em>'+esc(unit.meta)+'</em><b>'+esc(unit.status)+'</b></button>'
      +(open?'<div class="steel-unit-body">'+sourceRail(unit,role)+'<div class="steel-warning-line">'+esc(unit.warning)+'</div>'+charts(unit)+'<div class="steel-material-tabs">'+['concrete','rebar','foundation'].map(function(k){return '<button class="'+(tab===k?'on':'')+'" data-material-tab="'+k+'" data-unit="'+unit.id+'">'+materialName(k)+'</button>';}).join('')+'<a href="../outputs/主楼钢筋用量_按构件汇总.xlsx" download>下载清洗后的钢筋汇总</a></div>'+table+decision+'</div>':'')+'</article>';
  }

  function ledger(role){
    return '<section class="steel-project-ledger"><div class="steel-project-head"><div><h2>'+esc(project.name)+'</h2><p>以项目为入口，展开单体查看三张材料表与构件占比；具体数值、来源和校验状态同步展示。</p></div><div><span>最近更新：'+esc(project.updated)+'</span>'+(role==='designer'?'<button id="steel-submit-review">提交负责人复核</button>':'')+'</div></div><div class="steel-binding-note">当前 Demo 为验证页面与流程，将三类样本临时绑定到单体 A；正式入库必须用 project_id / building_id 核对文件归属。</div>'+project.units.map(function(u){return unitPanel(u,role);}).join('')+'</section>';
  }

  function sourceRailV2(unit){
    const files=[
      {key:'concrete',label:'上部混凝土',upload:'stq',accept:'TXT'},
      {key:'rebar',label:'钢筋',upload:'sts',accept:'XLS / XLSX'},
      {key:'foundation',label:'基础混凝土',upload:'stb',accept:'TXT'}
    ];
    return '<div class="steel-source-rail-v2">'+files.map(function(item){
      return '<div class="steel-source-file-v2"><span>'+item.label+'</span><strong>'+esc(unit.sources[item.key])+'</strong><button data-source-upload="'+item.upload+'">更新 '+item.accept+'</button></div>';
    }).join('')+'</div>';
  }

  function portfolioSummaryTable(){
    const rows=project.units.map(function(unit){
      const t=totals(unit),concreteArea=nsum(unit.concrete,'area');
      return '<tr><td><strong>单体 '+unit.id+'</strong>'+(unit.id==='A'?'<span>当前样本</span>':'<span>演示数据</span>')+'</td>'
        +'<td class="num">'+fmt(concreteArea?t.concrete.total/concreteArea:0,3)+'</td>'
        +'<td class="num">'+fmt(t.area?t.rebar.total*1000/t.area:0,2)+'</td>'
        +'<td class="num">'+fmt(unit.foundationArea?t.foundation/unit.foundationArea:0,3)+'</td></tr>';
    }).join('');
    return '<section class="steel-portfolio-summary"><div class="steel-summary-title"><div><h3>各单体材料总表</h3><p>先看项目整体，再展开单体核对三张材料表。</p></div><span>A 为当前样本；B–D 为界面演示数据</span></div>'
      +'<div class="steel-table-wrap"><table class="steel-data-table steel-summary-table"><thead><tr><th>单体</th><th>混凝土单方量 (m³/m²)</th><th>钢筋用量 (kg/m²)</th><th>基础混凝土用量 (m³/m²)</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }

  function materialOverview(unit){
    const order=[
      {key:'concrete',index:'01',label:'混凝土'},
      {key:'rebar',index:'02',label:'钢筋'},
      {key:'foundation',index:'03',label:'基础'}
    ];
    return '<div class="steel-material-overview">'+order.map(function(item){
      const open=state.openMaterials[unit.id][item.key];
      return '<button class="steel-material-disclosure'+(open?' open':'')+'" data-material-toggle="'+item.key+'" data-unit="'+unit.id+'" aria-expanded="'+open+'"><span>'+item.index+'</span><strong>'+item.label+'</strong><small>'+(open?'收起表格':'展开表格')+'</small><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5"/></svg></button>';
    }).join('')+'</div>';
  }

  function materialDetails(unit){
    const open=state.openMaterials[unit.id];
    let html='<div class="steel-material-details">';
    if(open.concrete) html+='<section class="steel-material-section" data-material-section="concrete">'+concreteTable(unit)+'</section>';
    if(open.rebar) html+='<section class="steel-material-section" data-material-section="rebar">'+rebarVisuals(unit)+rebarTable(unit)+'</section>';
    if(open.foundation) html+='<section class="steel-material-section" data-material-section="foundation">'+foundationTable(unit)+'</section>';
    return html+'</div>';
  }

  function rebarVisuals(unit){
    const t=totals(unit), average=t.area?t.rebar.total*1000/t.area:null;
    const parts=[['梁','beam'],['板','slab'],['柱','column'],['墙','wall']];
    const bars=parts.map(function(p){const value=t.rebar[p[1]],share=t.rebar.total?value/t.rebar.total*100:0;return '<div class="steel-component-row"><span>'+p[0]+'</span><div class="steel-component-track"><i style="width:'+share+'%"></i></div><b>'+(t.area>0?fmt(value*1000/t.area,2):'—')+'</b><small>'+fmt(share,1)+'%</small></div>';}).join('');
    const ratios=unit.rebar.map(function(r){return r.area>0?(r.beam+r.column+r.wall+r.slab)*1000/r.area:null;});
    const top=Math.max(10,Math.ceil(Math.max.apply(null,ratios.filter(function(v){return v!==null;}))/10)*10);
    const floors=unit.rebar.map(function(r,i){const v=ratios[i];return '<div class="steel-floor-column" title="'+esc(r.floor)+'：'+(v===null?'缺少面积':fmt(v,2)+' kg/m²')+'"><div class="steel-floor-track"><b style="bottom:'+((v||0)/top*100)+'%">'+(v===null?'—':fmt(v,1))+'</b><i style="height:'+((v||0)/top*100)+'%"></i></div><span>'+esc(r.floor.replace('第',''))+'</span></div>';}).join('');
    return '<div class="steel-rebar-summary"><div><span>钢筋总量</span><strong>'+fmt(t.rebar.total*1000,3)+' <small>kg</small></strong></div><div><span>统计楼面面积</span><strong>'+fmt(t.area,2)+' <small>m²</small></strong></div><div><span>整体含钢量</span><strong>'+(average===null?'—':fmt(average,2))+' <small>kg/m²</small></strong></div></div>'
      +'<div class="steel-rebar-visuals"><section><h4>构件单方用量 <small>kg/m² / 占比</small></h4>'+bars+'<p>构件钢筋总量 ÷ 总楼面面积；条长表示占比。</p></section><section><h4>各层含钢量 <small>kg/m² · 纵轴 0–'+top+'</small></h4><div class="steel-floor-scroll"><div class="steel-floor-chart">'+floors+'</div></div><p>按楼层顺序；整体含钢量按总量 ÷ 总面积计算。</p></section></div>'
      +(unit.id==='A'?'<div class="steel-report-download"><a href="../outputs/20260927-chart-refresh/主楼钢筋用量_图表排版优化.xlsx" download>下载主楼样本 Excel · 优化版</a><span>固定样本，更新上传资料后此文件不会同步。</span></div>':'');
  }

  function unitPanel(unit,role){
    const open=!!state.openUnits[unit.id];
    const supporting=role==='designer'
      ?'<small>当前设计人员仅负责此单体；三张材料表可分别展开、同时查看。</small>'
      :'<small>展开查看混凝土、钢筋、基础三张材料表。</small>';
    const warning=role==='designer'&&unit.warning?'<div class="steel-warning-line">'+esc(unit.warning)+'</div>':'';
    return '<article class="steel-unit'+(open?' open':'')+'"><button class="steel-unit-head steel-unit-head-v2" data-unit-toggle="'+unit.id+'" aria-expanded="'+open+'"><span class="chevron"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5"/></svg></span><span><strong>'+esc(unit.name)+'</strong>'+supporting+'</span><b>'+(open?'收起':'展开')+'</b></button>'
      +(open?'<div class="steel-unit-body">'+(role==='designer'?sourceRailV2(unit):'')+warning+materialOverview(unit)+materialDetails(unit)+'</div>':'')+'</article>';
  }

  function ledger(role){
    const isDesigner=role==='designer';
    const units=isDesigner?[UNIT_A]:project.units;
    return '<section class="steel-project-ledger"><div class="steel-project-head"><div><h2>'+(isDesigner?'我的单体 · 单体 A':'专业负责人 · 多单体材料复核')+'</h2><p>'+(isDesigner?'录入并核对本单体的混凝土、钢筋和基础工程量。':'只展示各单体三张材料表，不展示原始文件、来源编号和来源校验信息。')+'</p></div><div><span>最近更新：'+esc(project.updated)+'</span>'+(isDesigner?'<button id="steel-submit-review">提交负责人复核</button>':'')+'</div></div>'
      +(isDesigner?'':portfolioSummaryTable())
      +units.map(function(unit){return unitPanel(unit,role);}).join('')+'</section>';
  }

  function manager(){
    return '<section class="steel-project-ledger steel-manager"><div class="steel-project-head"><div><h2>项目用钢量总览</h2><p>只汇总负责人已确认且满足可比条件的冻结版本。</p></div><div><span>数据截止：2026-09-25</span></div></div><div class="steel-manager-summary"><div><span>项目单体</span><strong>7</strong><small>含 1 个不完整样本</small></div><div><span>已复核版本</span><strong>5</strong><small>71% 覆盖</small></div><div><span>待补数据</span><strong>1</strong><small>不进入正式区间</small></div></div><div class="steel-management-table"><table><thead><tr><th>单体</th><th>结构体系</th><th>含钢量</th><th>可比状态</th><th>复核</th><th>来源</th></tr></thead><tbody><tr><td>A1# 住宅（演示）</td><td>剪力墙</td><td>62.5 kg/m²</td><td>位于同类区间</td><td>已通过</td><td>DEMO-SRC-001</td></tr><tr><td>主楼（105 样本）</td><td>待登记</td><td>37.75 kg/m²</td><td>仅展示材料台账</td><td>待复核</td><td>LEGACY-105-MAIN-REBAR</td></tr></tbody></table></div><div class="steel-policy">本指标仅用于项目复盘与方案优化，不直接作为绩效排名依据。区间位置是统计信号，不是结构设计质量结论。</div></section>';
  }

  function manager(){
    const groups=[
      {name:'第一设计组',projects:8,complete:8,values:[92,98,101,104,107,113,119,133]},
      {name:'第二设计组',projects:6,complete:6,values:[88,95,99,101,103,108]},
      {name:'第三设计组',projects:10,complete:9,values:[76,91,96,98,100,102,105,108,111,116]},
      {name:'第四设计组',projects:4,complete:3,values:[94,99,102]}
    ];
    const groupRows=groups.map(function(group){
      const dots=group.values.map(function(value,index){
        const left=Math.max(2,Math.min(98,(value-70)/70*100));
        const level=value<85||value>115?' alert':(value<90||value>110?' watch':'');
        return '<i class="steel-dist-dot'+level+'" style="left:'+left.toFixed(1)+'%" title="'+esc(group.name)+' · 项目 '+(index+1)+' · 同类指数 '+value+'"></i>';
      }).join('');
      const incomplete=group.projects-group.complete;
      return '<div class="steel-dist-row"><div><strong>'+group.name+'</strong><span>'+group.projects+' 个项目'+(incomplete?' · '+incomplete+' 个未入比较':'')+'</span></div><div class="steel-dist-track"><span class="steel-normal-band"></span><b class="steel-median-line"></b>'+dots+'</div></div>';
    }).join('');
    return '<section class="steel-project-ledger steel-leadership">'
      +'<div class="steel-project-head"><div><h2>全院用钢量总览</h2><p>默认只看异常、趋势和数据缺口；全部项目按“组—项目—单体”逐级下钻。</p></div><div><span>统计期间：2026 年 · 口径：已复核可比版本</span></div></div>'
      +'<div class="steel-lead-scope"><span><b>范围</b> 4 个设计组</span><span><b>项目</b> 在建 + 历史归档</span><span><b>比较前提</b> 同结构体系、层数、高度、抗震设防与地区</span><span><b>未满足条件</b> 只提示缺口，不参与比较</span></div>'
      +'<section class="steel-lead-focus"><div class="steel-lead-section-title"><div><h3>本期先看</h3><p>领导首屏只保留需要判断、协调或追踪的事项。</p></div><small>界面示意数据，不代表真实项目结论</small></div><ol>'
      +'<li class="high"><b>01</b><div><strong>2 个项目连续两个版本偏离同类区间</strong><span>先由专业负责人核对地下室比例、转换层、超限条件和统计范围，再决定是否专项复盘。</span></div><em>需要专业复核</em></li>'
      +'<li><b>02</b><div><strong>2 个项目数据不完整，暂不进入全院比较</strong><span>一个缺基础面积，一个尚无负责人确认版本；避免用残缺数据形成错误结论。</span></div><em>需要补齐数据</em></li>'
      +'<li><b>03</b><div><strong>同类项目中出现可复用的稳定区间</strong><span>中高层剪力墙住宅样本已形成稳定分布，可整理为方案阶段参考带，而不是绩效排名线。</span></div><em>建议沉淀基准</em></li>'
      +'</ol></section>'
      +'<section class="steel-distribution"><div class="steel-lead-section-title"><div><h3>四个组的同类项目分布</h3><p>每个圆点代表一个项目；指数 100 是同类项目中位数，只用来发现偏离和离散程度。</p></div><div class="steel-dist-legend"><span><i></i>正常带</span><span><i class="watch"></i>关注</span><span><i class="alert"></i>明显偏离</span></div></div><div class="steel-dist-axis"><span>70</span><span>85</span><strong>100</strong><span>115</span><span>140</span></div><div class="steel-dist-list">'+groupRows+'</div><p class="steel-dist-note">不能用这张图评价组或个人绩效。它只回答三个问题：哪里反复偏离、哪里波动异常、哪里值得形成优秀基准。</p></section>'
      +'<div class="steel-lead-lower"><section class="steel-lead-exceptions"><div class="steel-lead-section-title"><div><h3>需要关注的项目</h3><p>只列异常和缺口，不把全部项目平铺给领导。</p></div></div><div class="steel-table-wrap"><table><thead><tr><th>组别 / 项目</th><th>可比条件</th><th>当前信号</th><th>建议动作</th></tr></thead><tbody>'
      +'<tr><td><strong>第一组 · 住宅项目 07</strong><span>演示项目</span></td><td>剪力墙 · 29 层</td><td><b class="signal high">连续偏高</b></td><td>核对转换层及地下室分摊</td></tr>'
      +'<tr><td><strong>第一组 · 住宅项目 08</strong><span>演示项目</span></td><td>剪力墙 · 31 层</td><td><b class="signal watch">离散增大</b></td><td>对比最近两个冻结版本</td></tr>'
      +'<tr><td><strong>第三组 · 综合体项目 03</strong><span>演示项目</span></td><td>框架-核心筒 · 超限</td><td><b class="signal watch">样本不足</b></td><td>单独专题复盘，不进入排名</td></tr>'
      +'<tr><td><strong>第四组 · 项目 04</strong><span>演示项目</span></td><td>基础面积缺失</td><td><b class="signal muted">不参与比较</b></td><td>补齐并完成负责人复核</td></tr>'
      +'</tbody></table></div></section>'
      +'<aside class="steel-lead-patterns"><div class="steel-lead-section-title"><div><h3>正在形成的规律</h3><p>系统只提出线索，最终由专业负责人确认。</p></div></div><ul><li><strong>结构类型规律</strong><span>同为剪力墙体系时，层数和抗震设防对钢筋单方的解释力明显高于组别。</span></li><li><strong>基础规律</strong><span>基础混凝土应与地下室面积、桩基形式和持力层条件联动查看，不能只看总量。</span></li><li><strong>版本规律</strong><span>单次偏离不等于异常；连续版本同方向变化更值得管理层关注。</span></li></ul></aside></div>'
      +'<div class="steel-lead-drill"><div><strong>全院</strong><span>只看重点与规律</span></div><i>→</i><div><strong>设计组</strong><span>看分布与离散</span></div><i>→</i><div><strong>项目</strong><span>看同类条件与版本</span></div><i>→</i><div><strong>单体</strong><span>看梁、柱、墙、板和基础明细</span></div></div>'
      +'</section>';
  }

  function render(){
    const root=document.getElementById('steel-demo-content'); if(!root) return;
    const roleSelector=document.getElementById('role-sel');
    if(roleSelector) roleSelector.value=state.view==='manager'?'a':(state.view==='reviewer'?'m':'d');
    root.innerHTML=state.view==='manager'?manager():ledger(state.view);
    document.querySelectorAll('[data-steel-view]').forEach(function(b){b.classList.toggle('on',b.dataset.steelView===state.view);});
    const note=document.getElementById('steel-view-note');
    if(note) note.textContent=state.view==='designer'?'上传并核对项目下各单体材料表':(state.view==='reviewer'?'直接查看材料明细并作出复核处理':'查看覆盖率和同类区间，不进行个人排名');
  }

  function classify(cat){
    cat=String(cat||'').replace(/\s+/g,'');
    if(cat==='板'||/楼板/.test(cat)) return 'slab';
    if(cat==='梁'||/墙梁/.test(cat)) return 'beam';
    if(cat==='柱') return 'column';
    if(/边缘构件|墙身|剪力墙/.test(cat)) return 'wall';
    return 'other';
  }
  function syncFromStin(){
    if(typeof STIN==='undefined') return;
    if(STIN.rebar&&STIN.rebar.length){
      const rows=[]; let conflict='';
      STIN.rebar.slice().sort(function(a,b){return a.floor-b.floor;}).forEach(function(f){
        const r={floor:'第'+f.floor+'层',area:Number(f.area)||0,beam:0,column:0,wall:0,slab:0};
        (f.rows||[]).forEach(function(x){
          const k=classify(x.cat); if(k!=='other') r[k]+=Number(x.total||0)/1000;
          if(x.totalConflict) conflict='来源合计与直径分项不一致，当前已按分项求和；请负责人确认。';
        }); rows.push(r);
      });
      if(rows.some(function(r){return r.beam||r.column||r.wall||r.slab;})) UNIT_A.rebar=rows;
      const inp=document.querySelector('input[data-imp="sts"]');
      if(inp&&inp.files&&inp.files[0]) UNIT_A.sources.rebar=inp.files[0].name;
      if(conflict) UNIT_A.warning=conflict;
    }
    if(STIN.up&&STIN.up.floors&&STIN.up.floors.length){
      UNIT_A.concrete=STIN.up.floors.map(function(f){
        const r={floor:'第'+f.floor+'自然层',wall:0,beam:0,column:0,slab:0,cantilever:0,area:Number(f.area)||0};
        (f.comp||[]).forEach(function(c){const n=String(c.name||''); if(/悬挑/.test(n))r.cantilever+=Number(c.sum)||0;else if(/楼板|板/.test(n))r.slab+=Number(c.sum)||0;else if(/墙/.test(n))r.wall+=Number(c.sum)||0;else if(/梁/.test(n))r.beam+=Number(c.sum)||0;else if(/柱/.test(n))r.column+=Number(c.sum)||0;}); return r;
      });
      const inp=document.querySelector('input[data-imp="stq"]'); if(inp&&inp.files&&inp.files[0]) UNIT_A.sources.concrete=inp.files[0].name;
    }
    if(STIN.base&&STIN.base.rows&&STIN.base.rows.length){
      UNIT_A.foundation=STIN.base.rows.filter(function(r){return !r.isSum&&!/合计/.test(r.name)&&Number(r.sum)>0;}).map(function(r){return {name:String(r.name||'').replace('地基梁','基础梁'),value:Number(r.sum)||0};});
      const inp=document.querySelector('input[data-imp="stb"]'); if(inp&&inp.files&&inp.files[0]) UNIT_A.sources.foundation=inp.files[0].name;
    }
    project.updated=new Date().toLocaleString('zh-CN',{hour12:false}).replace(/\//g,'-'); render();
  }

  function setView(view){
    state.view=view;
    const role=document.getElementById('role-sel');
    if(role) role.value=view==='manager'?'a':(view==='reviewer'?'m':'d');
    render();
  }
  function rewriteSide(){
    document.querySelectorAll('.side li').forEach(function(li){
      if(li.textContent.indexOf('第二步')>=0) li.innerHTML='<b>第二步</b> 按楼层钢筋用量<div>梁 / 柱 / 墙 / 板 · 构件合计 · 含钢量 kg/m²</div>';
      if(li.textContent.indexOf('第三步')>=0) li.innerHTML='<b>第三步</b> 混凝土与基础<div>墙 / 梁 / 柱 / 楼板 · 基础面积与单方</div>';
      if(li.textContent.indexOf('第四步')>=0) li.innerHTML='<b>第四步</b> 材料占比与负责人复核';
      if(li.textContent.indexOf('第五步')>=0) li.style.display='none';
    });
  }
  function init(){
    const stage=document.getElementById('stage5'); if(!stage) return;
    Array.prototype.forEach.call(stage.children,function(el){if(el.classList&&el.classList.contains('panel-card')){el.classList.add('steel-legacy-panel');el.hidden=true;}});
    const toolbar=document.createElement('div'); toolbar.className='steel-demo-toolbar'; toolbar.innerHTML='<div class="steel-demo-title"><h2>用钢量统计</h2><span>集成 Demo · 不连接生产数据库</span></div><div class="steel-view-tabs" role="tablist"><button data-steel-view="designer" role="tab">设计人员填报</button><button data-steel-view="reviewer" role="tab">专业负责人复核</button><button data-steel-view="manager" role="tab">管理总览</button><span id="steel-view-note"></span></div>';
    const root=document.createElement('div');root.id='steel-demo-content';
    stage.insertBefore(toolbar,stage.firstChild);stage.insertBefore(root,toolbar.nextSibling);

    toolbar.addEventListener('click',function(e){const b=e.target.closest('[data-steel-view]');if(b)setView(b.dataset.steelView);});
    root.addEventListener('click',function(e){
      const toggle=e.target.closest('[data-unit-toggle]'); if(toggle){const unitId=toggle.dataset.unitToggle;state.openUnits[unitId]=!state.openUnits[unitId];render();return;}
      const material=e.target.closest('[data-material-toggle]'); if(material){const unitId=material.dataset.unit,key=material.dataset.materialToggle;state.openMaterials[unitId][key]=!state.openMaterials[unitId][key];render();return;}
      const upload=e.target.closest('[data-source-upload]'); if(upload){const input=document.querySelector('input[data-imp="'+upload.dataset.sourceUpload+'"]');if(input)input.click();return;}
      const review=e.target.closest('[data-review-action]'); if(review){state.reviewDecision=review.dataset.reviewAction==='accept'?'已确认按直径分项求和，保留来源冲突记录。':'已退回设计人员补正来源合计。'; UNIT_A.status=review.dataset.reviewAction==='accept'?'已复核':'已退回';render();return;}
      if(e.target.id==='steel-submit-review'){UNIT_A.status='待负责人复核';state.view='reviewer';render();if(window.toast)toast('材料明细已提交负责人复核；Demo 未写入生产数据库。');}
    });
    document.querySelectorAll('input[data-imp="stq"],input[data-imp="stb"],input[data-imp="sts"]').forEach(function(inp){inp.addEventListener('change',function(){setTimeout(syncFromStin,1200);});});
    const role=document.getElementById('role-sel');if(role)role.addEventListener('change',function(){setView(role.value==='a'?'manager':(role.value==='m'?'reviewer':'designer'));});
    rewriteSide();setTimeout(rewriteSide,400);
    state.view=role&&role.value==='a'?'manager':(role&&role.value==='m'?'reviewer':'designer');render();
    window.steelMaterialDemo={project:project,state:state,render:render,syncFromStin:syncFromStin};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
