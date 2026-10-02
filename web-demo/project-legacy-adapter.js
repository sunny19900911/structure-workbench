/* Bridge existing functions without replacing their business logic. */
(function(){
 const copy=v=>JSON.parse(JSON.stringify(v));
 const replace=(target,value)=>{Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,value||{});};
 function safePaper(html){const d=new DOMParser().parseFromString(html,'text/html');d.querySelectorAll('script,iframe,object,embed,link,style,img,svg,form').forEach(e=>e.remove());d.querySelectorAll('*').forEach(e=>{const action=e.getAttribute('onclick');if(action==='addRow(this)')e.dataset.wbAction='add';if(action==='delRow(this)')e.dataset.wbAction='delete';if(action==='restoreRows()')e.dataset.wbAction='restore';for(const a of [...e.attributes])if(/^on/i.test(a.name)||/^(href|src|srcdoc)$/i.test(a.name)||(/style/i.test(a.name)&&/url\s*\(|expression|@import/i.test(a.value)))e.removeAttribute(a.name);});return d.body.innerHTML;}
 const paper=document.querySelector('#stage1 .paper');paper.id='paper1';
 const style=document.createElement('style');style.textContent='[data-needs-review="true"]{outline:2px solid #b97f32!important;background:#fff4dc!important}';document.head.append(style);
 const template=safePaper(paper.innerHTML);
 function specCapture(){const t=document.querySelector('#spec-itbl tbody');return {rows:t?safePaper('<table><tbody>'+t.innerHTML+'</tbody></table>'):'',text:document.getElementById('spec-ta')?.value||''};}
 function genericPaper(){return safePaper(window.MeasureTemplate?.paper||template);}
 let restoredFromPaper=null;
 function restoreEmptySections(html){
  const d=new DOMParser().parseFromString(html,'text/html');let changed=false;
  for(const section of window.MeasureTemplate?.sections||[]){const target=new DOMParser().parseFromString(section,'text/html').body;const heading=target.firstElementChild;const old=d.getElementById(heading.id);if(!old)continue;const nodes=[];for(let n=old.nextElementSibling;n&&!/^H[12]$/.test(n.tagName);n=n.nextElementSibling)nodes.push(n);
   if(!nodes.some(n=>n.matches('[data-empty-section]')))continue;
   const edited=nodes.some(n=>[n,...n.querySelectorAll('p.ce,td.ce')].some(e=>e.matches('p.ce,td.ce')&&e.textContent.trim()&&!/^(【待填写.*】|【待确认】)$/.test(e.textContent.trim())));
   if(edited)continue;const replacement=[...target.children];for(const node of replacement)old.before(node);old.remove();nodes.forEach(n=>n.remove());changed=true;
  }
  if(changed){d.querySelector('.psub')?.replaceChildren('通用措施 · 项目参数联动');const tip=d.querySelector('.ptip');if(tip)tip.textContent='默认采用小香金猪指定的统一措施 V1.2，通用正文与表格已恢复，可按项目修改。';}
  return changed?d.body.innerHTML:html;
 }
 paper.addEventListener('click',e=>{const button=e.target.closest('[data-wb-action]');if(!button)return;const action=button.dataset.wbAction;if(action==='add')addRow(button);if(action==='delete')delRow(button);if(action==='restore')restoreRows();window.WorkbenchProjects?.contentChanged('措施表格行变更');});
 function capture(){return {blankTemplateVersion:3,restoredFromPaper,parameters:wbMeasureSnapshot().params,spec:specCapture(),province:provSel.value,county:cntSel.value,stage:PSTAGE,role:ROLE,cards:copy(CST),data:copy(DATA),dataTables:copy(DATA_TABLES),imports:copy(IMP),paper:safePaper(paper.innerHTML),model:copy(YJKRAW),geo:copy(GEOSC),rc:{input:copy(RCOUT),result:copy(RCLAST),limits:copy(RCLIM)},steel:{input:copy(STIN),result:copy(STLAST),segments:copy(STSEG)},snapshots:copy(SNAPS)};}
 const parameterKeys=Object.keys(DEF);
 function blank(name){const p=Object.fromEntries(parameterKeys.map(k=>[k,'']));Object.assign(p,window.MeasureTemplate?.defaults||{});p.project_name=name;p.discipline='结构';return {blankTemplateVersion:3,mode:'blank',parameters:p,province:'',county:'',stage:'扩初',role:'m',cards:{},data:{},dataTables:{},imports:{},paper:genericPaper(),spec:{rows:'',text:''},model:null,geo:null,rc:{input:{sections:{},raw:'',files:[],from:''},result:null,limits:[]},steel:{input:{up:null,base:null,rebar:[]},result:null,segments:[]},snapshots:[]};}
 let example;
 async function loadExample(){if(!example){const response=await fetch(new URL('./data/example-project.json',location.href));if(!response.ok)throw Error('示例资料载入失败，请重试');example=await response.json();}return copy(example);}
 async function sample(){const s=await loadExample();return {...blank(s.parameters.project_name),mode:'sample',parameters:s.parameters,data:s.data,dataTables:s.dataTables,paper:s.paper,spec:s.spec};}
 function repairDefaultConcrete(html){
  const d=new DOMParser().parseFromString(html||'','text/html'),h=d.getElementById('s1ch4_1');let table;
  for(let n=h?.nextElementSibling;n&&!/^H[12]$/.test(n.tagName);n=n.nextElementSibling)if(n.querySelector('table')){table=n.querySelector('table');break;}
  if(!table)return html;
  const rows=[...table.rows].map(r=>[...r.cells].filter(c=>!c.classList.contains('op')).map(c=>c.textContent.trim()));
  const old=[['构件','混凝土强度等级','备注',''],['筏板、承台、拉梁、无地下室区域的电梯坑','C35','-',''],['楼盖（梁、板）','地上','C30','-'],['','地下','C35','-'],['地下室外墙','C35、C50','根据绿建方案最终确定是否采用C50',''],['地下室室内混凝土墙（包括人防墙）','C35、C50','根据绿建方案最终确定是否采用C50',''],['框架柱','纯地下室车库','C35','-'],['','地上及投影范围内车库','C50~C60','']];
  if(JSON.stringify(rows)!==JSON.stringify(old))return html;
  const section=window.MeasureTemplate.sections.find(x=>x.includes('id="s1ch4_1"'));
  const replacement=new DOMParser().parseFromString(section,'text/html').querySelector('table');table.replaceWith(replacement);return d.body.innerHTML;
 }
 function apply(value){const s=copy(value);s.paper=repairDefaultConcrete(s.paper);restoredFromPaper=s.restoredFromPaper||null;if(s.blankTemplateVersion!==3&&s.mode!=='sample'&&s.cards?.c1!==3){const restored=restoreEmptySections(s.paper||genericPaper());if(restored!==s.paper)restoredFromPaper=s.paper; s.paper=restored;for(const [k,v] of Object.entries(window.MeasureTemplate?.defaults||{}))if(!s.parameters[k])s.parameters[k]=v;}replace(DEF,s.parameters);replace(DATA,s.data);replace(DATA_TABLES,s.dataTables);replace(IMP,s.imports);DERIVED={};YJKRAW=s.model||null;GEOSC=s.geo||null;RCOUT=s.rc?.input||{sections:{},raw:'',files:[],from:''};RCLAST=s.rc?.result||null;RCLIM=s.rc?.limits||[];replace(STIN,s.steel?.input||{up:null,base:null,rebar:[]});STLAST=s.steel?.result||null;STSEG=s.steel?.segments||[];SNAPS.splice(0,SNAPS.length,...(s.snapshots||[]));CST=s.cards||{};ROLE=['d','m','a'].includes(s.role)?s.role:'m';PSTAGE=s.stage||'扩初';delStore.length=0;
  paper.innerHTML=safePaper(s.paper||genericPaper());
  const spec=document.querySelector('#spec-itbl tbody');if(spec){const d=new DOMParser().parseFromString(safePaper(s.spec?.rows||''),'text/html');spec.innerHTML=d.querySelector('tbody')?.innerHTML||'';}
  const text=document.getElementById('spec-ta');if(text)text.value=s.spec?.text||'';
  ['specprev','spec-sum','spec-out','spec-ledger'].forEach(id=>document.getElementById(id)?.replaceChildren());
  ['st-yjk','st-bldg','st-geo'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=id==='st-yjk'?'当前单体模型见②来源清单':'上传后自动编入下方正文';});
  [['stq',Boolean(STIN.up)],['stb',Boolean(STIN.base)],['sts',Boolean(STIN.rebar.length)]].forEach(([slot,has])=>{document.getElementById('box-'+slot)?.classList.toggle('done',has);const e=document.getElementById('st-'+slot);if(e)e.textContent=has?'本项目已导入':'未导入';});
  ['steel-ta','st-sts2','st-diff','rc-diff'].forEach(id=>{const e=document.getElementById(id);if(e){if(e.tagName==='TEXTAREA')e.value='';else e.textContent='待重新生成';}});
  document.querySelectorAll('[data-k]').forEach(e=>{const v=s.parameters?.[e.dataset.k]??'';if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(v)))e.add(new Option(v||'— 待确认 —',v));e.value=v;});
  provSel.value=s.province||'';onProv();cntSel.value=s.county||'';try{curCounty=s.county?JSON.parse(s.county):null;}catch{curCounty=null;}deriveAll();applyParams();refreshGeoCk();
  document.getElementById('role-sel').value=ROLE;document.getElementById('pstage-sel').value=PSTAGE;renderWall();applyRole();syncLock();
  document.querySelectorAll('input[type=file]').forEach(e=>e.value='');document.querySelectorAll('[id^="st-"],[id^="rc-"]').forEach(e=>{if(/^(TBODY|TEXTAREA)$/.test(e.tagName)){if(e.tagName==='TEXTAREA')e.value='';else e.replaceChildren();}});
  if(RCLAST){rcRenderIn(RCLAST.inRows||[]);rcRenderLim();rcBuildDiff();}else{document.getElementById('rc-sum').textContent='本项目尚无有效反校核结果。';}
  if(STLAST){stRenderA();stRenderB();stRenderD();}stRenderSeg();stStatus();snapRender();goStage(0);
 }
 function templateContent(){
  const section=id=>{const heading=document.getElementById(id),nodes=[];for(let n=heading?.nextElementSibling;n&&!/^H[12]$/.test(n.tagName);n=n.nextElementSibling)nodes.push(n);return nodes;};
  const text=id=>section(id).filter(n=>n.tagName==='P').map(n=>n.textContent.trim()).join('\n');
  const table=id=>section(id).flatMap(n=>[...n.querySelectorAll('tr')]).map(row=>[...row.querySelectorAll('th:not(.op),td:not(.op)')].map(c=>c.textContent.trim()));
  return {templateText:{permanent:section('s1ch3_1').filter(n=>n.tagName==='P'&&(!n.textContent.includes('河北地区')||/河北/.test(wbMeasureSnapshot().params.region||''))).map(n=>n.textContent.trim()).join('\n'),wall:text('s1ch3_2'),reinforcement:text('s1ch4_2'),steel:text('s1ch4_3'),masonry:table('s1ch4_4').slice(1).map(row=>row.filter(Boolean).join('：')).join('；')},templateTables:{concrete:table('s1ch4_1'),durability:table('s1durability'),floor:table('s1ch3_3'),roof:table('s1ch3_4'),equipment:table('s1ch3_5')}};
 }
 window.WorkbenchLegacy={templateContent,capture,apply,blank,sample,loadExample,params:()=>wbMeasureSnapshot().params,
   role:()=>ROLE,cardState:id=>stOf(id),permission:id=>permOf(cOf(id)),
   canEdit(id){return !!cOf(id)&&cardVisible(cOf(id))&&!['看','—'].includes(permOf(cOf(id)))&&stOf(id)!==3;},
   touchCard(id){if(stOf(id)!==1)CST[id]=1;renderWall();syncLock();cstSave();},
   registerCard(card){if(!cOf(card.id))CARDS.push(card);applyRole();syncLock();},
   async parseMaterial(slot,file){if(slot==='rebar'&&/\.(xlsx|xls)$/i.test(file.name))return stReadXlsx(file);const text=decodeText(new Uint8Array(await file.arrayBuffer()));return slot==='rebar'?stParseRebarText(text,file.name):slot==='concrete'?stParseUp(text):stParseBase(text);},
   canEditMeasures(){const p=permOf(cOf('c1'));return stOf('c1')!==3&&p!=='看'&&p!=='—';},
   locations:()=>LOC,
   locationValues(match){const {province,county}=match;const data=LOC[province];if(!data||!data.counties.some(c=>c.n===county.n&&c.c===county.c))throw Error('地点不在本地表中');const c=data.counties.find(c=>c.n===county.n&&c.c===county.c);let climate;for(const n of [c.n,c.c])for(const k of [n,n+'市',n.replace(/[市县]$/,'')])if(!climate&&data.cities[k])climate=data.cities[k];const out={intensity:c.i,pga:c.p,eq_group:c.g};for(const [key,field] of [['wind','w'],['snow','s'],['snow_zone','z'],['temp_low','tn'],['temp_high','tx']])if(climate?.[field]&&climate[field]!=='-')out[key]=climate[field];return out;},
   adoptParameters(values){if(!this.canEditMeasures())throw Error('统一措施当前为只读或已签发');if('region' in values){curCounty=null;provSel.value='';onProv();}for(const [k,raw] of Object.entries(values)){let v=String(raw);if(k==='site_class')v=v.replace(/Ⅲ/g,'III').replace(/Ⅱ/g,'II').replace(/Ⅳ/g,'IV').replace(/Ⅰ/g,'I').replace(/\s*类/,' 类');DEF[k]=v;document.querySelectorAll('[data-k="'+k+'"]').forEach(e=>{if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===v))e.add(new Option(v,v));e.value=v;});}deriveAll();applyParams();},
   invalidate(keys){['c1','c2','c4','c9','c10','c11'].forEach(k=>{if((CST[k]||0)>1)CST[k]=1;});RCLAST=null;document.getElementById('rc-sum').textContent='措施或模型已变化，旧反校核结果失效，请重新运行。';['rc-in-body','rc-lim-body'].forEach(id=>document.getElementById(id)?.replaceChildren());document.querySelectorAll('[data-detached-keys]').forEach(e=>{if(!keys||e.dataset.detachedKeys.split(',').some(k=>keys.includes(k)))e.dataset.needsReview='true';});window.CalculationBook?.invalidate();renderWall();syncLock();},
   dataChanged(){applyData();window.WorkbenchProjects?.scheduleSave();},publish:()=>wbPublishMeasureSnapshot(),go:goStage};
 ['tab7','tab8','toc7','toc8','stage7','stage8'].forEach(id=>{const e=document.getElementById(id);if(e){e.hidden=true;e.style.setProperty('display','none','important');}});
 // Prevent direct calls from reviving paused functionality.
 document.querySelector('#spec-itbl')?.addEventListener('click',e=>{const b=e.target.closest('[data-wb-action]');if(b?.dataset.wbAction==='delete')delRow(b);window.WorkbenchProjects?.scheduleSave();});
 const oldGo=window.goStage;window.goStage=function(n){if(n===7||n===8)return;return oldGo(n)};
})();
