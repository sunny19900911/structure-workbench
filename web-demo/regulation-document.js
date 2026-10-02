// Layout source: USER-20261001-LOCAL-REG-DOCX, reference §2.2 / table 2.2.
export const REGULATION_WORD_CSS = `
.regulation-heading,.regulation-subheading{font-family:SimHei,"黑体";font-size:12pt;font-weight:normal;line-height:125%;text-align:left;text-indent:0;margin:0;padding:0;border:0;box-shadow:none;page-break-after:avoid}
.regulation-caption{font-family:SimSun,"宋体";font-size:10.5pt;font-weight:bold;line-height:100%;text-align:center;text-indent:0;margin:0 0 0 24pt;page-break-after:avoid}
table.regulation-table{border-collapse:collapse;border-radius:0;overflow:visible;table-layout:fixed;width:494.8pt;max-width:none;margin:0 0 0 6.15pt;border:.5pt solid black;font-family:SimSun,"宋体";font-size:10.5pt;color:black}
.regulation-table tr{height:16.85pt}
.regulation-table td,.regulation-table th{border:.75pt solid black;padding:0 5.4pt;vertical-align:middle;background:white;color:black;font:normal 10.5pt/1.25 SimSun,"宋体";text-align:justify}
.regulation-table .regulation-name{width:302.3pt}.regulation-table .regulation-code{width:192.5pt}
.regulation-table p{font:normal 10.5pt/1.25 SimSun,"宋体";text-align:justify;text-indent:21pt;margin:0;padding:0}
.regulation-note{font-family:"Century Gothic",SimSun,"宋体";font-size:12pt;line-height:150%;font-weight:normal;text-align:justify;text-indent:24pt;margin:0}
`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const provinces=['北京市','天津市','上海市','重庆市','内蒙古自治区','广西壮族自治区','西藏自治区','宁夏回族自治区','新疆维吾尔自治区','河北省','山西省','辽宁省','吉林省','黑龙江省','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','海南省','四川省','贵州省','云南省','陕西省','甘肃省','青海省'];
export function regulationCategory(r){
 if(['local','national'].includes(r.category))return r.category;
 if(/^(GB(?:\/T)?|JGJ(?:\/T)?|CECS|T\/CECS|YB|CJJ(?:\/T)?|JG\/T)\s*\d/i.test(r.code||''))return 'national';
 if(r.province||/^SRC-|^ONLINE-/.test(r.source_id||'')||/^DB|^[滇川粤京津沪渝桂黔晋陕浙苏鲁皖闽赣湘鄂豫琼辽吉黑蒙宁甘青新藏]/.test(r.code||'')||provinces.some(p=>(r.title||'').includes(p.replace(/省$|市$/,''))))return 'local';
 return 'national';
}
export const selectedRegulations=(s,kind='local')=>(s.regulations||[]).filter(r=>r.selected&&regulationCategory(r)===kind);
export function regulationProvince(s){
 const region=s.parameters?.region||'';
 return provinces.find(p=>region.includes(p.replace(/省$|市$/,'')))||selectedRegulations(s).map(r=>r.province).find(Boolean)||'';
}
export function regulationNote(s,kind='local'){
 return s.regulationDocument?.[kind+'Note']??`注：除此表中所列外，尚应包括和本工程相关并应遵循的${kind==='local'?(regulationProvince(s)||'当地'):'全国'}规范与规程。`;
}
export function regulationSectionHTML(s,kind='local',{editing=false,heading=true,anchors=false}={}){
 const local=kind==='local',number=local?'2.2':'2.1',label=(local?'地方':'国家')+'设计标准与规范',rows=selectedRegulations(s,kind);
 const cells=rows.map(r=>'<tr'+(anchors?' id="regulation-'+esc(r.id)+'"':'')+'><td class="regulation-name"'+(editing?' data-reg-id="'+esc(r.id)+'" data-reg-field="title" contenteditable="true" role="textbox" aria-label="规范名称 '+esc(r.title)+'"':'')+'><p>'+esc(r.title||'【名称待补充】')+(!editing&&!(r.review==='confirmed'&&r.status==='current')?'（待核）':'')+'</p></td><td class="regulation-code"'+(editing?' data-reg-id="'+esc(r.id)+'" data-reg-field="code" contenteditable="true" role="textbox" aria-label="规范编号 '+esc(r.title)+'"':'')+'><p>'+esc(r.code||'')+(r.version&&!(r.code||'').includes(r.version)?'（'+esc(r.version)+'）':'')+'</p></td></tr>').join('');
 return (heading?'<h2 class="regulation-subheading">'+number+' '+esc((local?regulationProvince(s):'')+label)+'</h2>':'')+'<p class="regulation-caption">表'+number+' '+label+'</p><table class="regulation-table"><thead><tr><th class="regulation-name"><p>规范、规程和图集名称</p></th><th class="regulation-code"><p>编号</p></th></tr></thead><tbody>'+cells+'</tbody></table><p class="regulation-note"'+(editing?' data-reg-note="'+kind+'" contenteditable="true" role="textbox" aria-label="地方规范附注"':'')+'>'+esc(regulationNote(s,kind))+'</p>';
}
export function localRegulationHTML(s){return '<h1 class="regulation-heading">2. 设计依据</h1>'+regulationSectionHTML(s);}
export function basisDocumentHTML(s,text){
 let local=false,national=false;
 const body=String(text||'').split(/\n+/).filter(Boolean).map(line=>{
  if(/^2\.2\s/.test(line)){local=true;return regulationSectionHTML(s);}
  if(/^2\.1\s/.test(line)){national=true;return regulationSectionHTML(s,'national');}
  if(['本工程采用的国家设计标准与规范见设计依据清单。','地方设计标准与规范按项目所在地及适用范围选用，采用版本见设计依据清单。'].includes(line))return '';
  const tag=/^\d+\.\d+\s/.test(line)?'h2':'p';return '<'+tag+'>'+esc(line)+'</'+tag+'>';
 }).join('');
 return '<h1 class="regulation-heading">2. 设计依据</h1>'+body+(!national?regulationSectionHTML(s,'national'):'')+(!local?regulationSectionHTML(s):'');
}
export function updateRegulationField(s,id,key,value){
 if(s.signed||!['title','code'].includes(key))return false;
 const r=s.regulations.find(r=>r.id===id&&r.selected);if(!r)return false;
 const text=String(value).replace(/[\r\n]+/g,' ').trim().slice(0,1000);if(r[key]===text)return false;
 r[key]=text;r.review='candidate';r.status='unknown';return true;
}
export function selectRegulation(s,id,selected){
 if(s.signed)return false;const r=s.regulations.find(r=>r.id===id);if(!r||r.selected===selected)return false;
 r.selected=selected;return true;
}
export function setQueryRegulation(s,record,newId){
 if(s.signed||!record?.source_id)return false;
 const selected=record.selected!==false;
 const existing=s.regulations.find(r=>r.source_id===record.source_id);
 if(existing)return selectRegulation(s,existing.id,selected);
 if(!selected)return false;
 s.regulations.push({...record,category:'local',id:newId(),selected:true,review:'candidate',scope:s.parameters?.region||'',locator:record.source_url});
 return true;
}
