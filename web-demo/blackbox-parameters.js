// Views of existing adopted state; this module owns no project storage.
export function parameterView(L,I,unit,document){
 const groups=[['项目',['project_name','project_code','region','struct_sys']],['抗震',['intensity','pga','eq_group','site_class','seismic_cat','damping']],['荷载',['wind','snow','snow_zone','wind_shape','wind_rough']],['材料与等级',['safety','foundation','pile','anti_float','waterproof','fire','wall_drydensity','wall_abs']]];
 const parameters=L.params(),fields=[];
 const known=new Set(groups.flatMap(([,keys])=>keys));
 const remaining=[...document.querySelectorAll('#stage1 input[data-k],#stage1 select[data-k],#stage1 textarea[data-k]')].map(el=>el.dataset.k).filter(key=>!known.has(key));
 groups.push(['计算与其他参数',[...new Set(remaining)]]);
 for(const [group,keys] of groups)for(const key of keys){const el=document.querySelector('[data-k="'+key+'"]');if(!Object.hasOwn(parameters,key)||(!el&&!['region','struct_sys'].includes(key)))continue;const label=el?.closest('.fld')?.querySelector('label')?.cloneNode(true);label?.querySelectorAll('.badge').forEach(n=>n.remove());fields.push({group,key,label:(label?.textContent.trim()||({region:'项目地点',struct_sys:'结构体系'}[key])||key)+({wind:'（kN/m²）',snow:'（kN/m²）',pga:'（g）'}[key]||''),value:parameters[key],scope:'项目整体',source:el?.readOnly?'按统一措施自动计算':'统一技术措施采用值',readOnly:!!el?.readOnly,options:el?.tagName==='SELECT'?[...el.options].map(o=>({value:o.value,label:o.textContent})):null});}
 if(unit!=='项目整体')for(const fact of I.capture().facts.filter(f=>f.unit===unit&&f.status==='confirmed'&&['struct_sys','site_class','water_depth'].includes(f.key))){fields.push({group:'单体采用参数',key:fact.key,label:fact.label||fact.key,value:fact.value,scope:unit,source:fact.source_id,factId:fact.id});}
 const geometry=[];if(unit!=='项目整体'){const u=I.evidence(unit).document?.units?.find(u=>u.name===unit);for(const [key,label]of [['planningHeight','规划高度'],['fireHeight','消防高度'],['height','建筑高度'],['structuralHeight','结构高度'],['seismicHeight','抗震计算高度'],['indoorOutdoorDifference','室内外高差'],['absoluteElevation','绝对标高']])if(u?.[key])geometry.push({label,value:u[key],unit:'m',source:u.source_id});}
 const tableReadOnly={};
 for(const [key,id] of Object.entries({concrete:'s1ch4_1',durability:'s1durability',floor:'s1ch3_3',roof:'s1ch3_4',equipment:'s1ch3_5'})){
  const heading=document.getElementById(id);let table;
  for(let node=heading?.nextElementSibling;node&&!/^H[12]$/.test(node.tagName);node=node.nextElementSibling){table=node.matches('table')?node:node.querySelector('table');if(table)break;}
  tableReadOnly[key]=[...(table?.querySelectorAll('tr')||[])].map(row=>[...row.querySelectorAll('th:not(.op),td:not(.op)')].map(cell=>!!cell.querySelector('[data-p],[data-k]')));
 }
 return {fields,geometry,tables:L.templateContent().templateTables,tableReadOnly,unitParameters:unit==='项目整体'?null:I.parameters(unit)};
}

