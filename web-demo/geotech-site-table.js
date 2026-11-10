const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const label=v=>clean(v).replace(/\s/g,'');
const qualified=v=>/现状|场平|估算|标高|整平|填方|挖方/.test(v);
const shortBasis=(key,text)=>{
 const patterns={speed:/等效剪切波速(?:[A-Za-zυν_₀-₉]+)?[（(]m[/／]s[）)]$/i,cover:/覆盖层厚度[（(]m[）)]$/i,category:/(?:划分)?场地类别$/};
 const original=label(text),short=patterns[key]?original.replace(patterns[key],''):original;
 return short||original;
};
const definitions={
 speed:c=>/等效剪切波速/.test(label(c.label))&&/m[/／]s/i.test(label(c.label)),
 cover:c=>/覆盖层厚度/.test(label(c.label))&&/[（(]m[）)]/i.test(label(c.label)),
 soil:c=>/土(?:的)?类型/.test(label(c.label)),
 category:c=>/场地类别/.test(label(c.label)),
};

// Display every explicit measurement basis. This report-only projection does
// not choose a design scenario or calculate a soil type from wave velocity.
export function geotechSiteTable(source,tables,unit='项目整体'){
 const rows=[['','钻孔编号','','','等效剪切波速','覆盖层厚度','','场地类别']],rowSources=[null],origins=[];
 for(const table of tables.filter(t=>t.destination===4&&/^source-\d+$/.test(t.key))){
  if(!table.records.some(r=>r.fields?.some(definitions.speed))||!table.records.some(r=>r.fields?.some(definitions.category)))continue;
  let used=false;
  for(const record of table.records.filter(r=>r.kind==='table_row'&&(!r.unit||unit==='项目整体'||r.unit===unit))){
   const fields=Object.fromEntries(Object.entries(definitions).map(([key,match])=>[key,record.fields.filter(c=>match(c)&&clean(c.value)).map(c=>({label:clean(c.label),value:clean(c.value)}))]));
   if(!Object.values(fields).some(v=>v.length))continue;
   const read=re=>record.fields.filter(c=>re.test(label(c.label))&&clean(c.value)).map(c=>clean(c.value)).join('／');
   const borehole=read(/^(?:计算钻孔|钻孔(?:编号|号)?|孔号)$/),location=read(/^(?:部位|分区|区域|建筑物名称|单体名称)$/);
   const display=key=>fields[key].map(c=>fields[key].length>1||qualified(c.label)?shortBasis(key,c.label)+'：'+c.value:c.value).join('\n');
   const identity=[borehole,location].filter(Boolean).join('（')+(borehole&&location?'）':'');
   // reference-report's existing site adapter projects columns 1,4,5,7
   // to borehole, velocity, cover and category respectively.
   rows.push([identity,identity,'','',display('speed'),display('cover'),'',display('category')]);
   rowSources.push({source_id:source.source_id,table:table.key,locator:table.locator+(table.transposed?' 列 ':' 行 ')+(record.index+1),borehole,location,fields,
    sourceOrigin:source.blocks?.tableMeta?.[Number(table.key.slice(7))-1]?.sourceOrigin||null});
   used=true;
  }
  if(used)origins.push(table);
 }
 if(rows.length===1)return null;
 return {key:'site',rows,rowSources,source_id:source.source_id,selection:'all-explicit-bases',
  ...(origins.length===1?{rawRows:origins[0].rawRows,locator:origins[0].locator}:{}),records:origins.flatMap(t=>t.records)};
}

// Some survey reports list explicit borehole results as prose rather than a
// table. Only whole measurement-only lines in an accepted site-result context
// qualify. Never distribute aggregate cover/category to individual boreholes.
export function geotechSiteProseTable(source,numbered,unit='项目整体'){
 if(!numbered)return null;
 const rows=[['','钻孔编号','','','等效剪切波速','覆盖层厚度','','场地类别']],rowSources=[null],seen=new Map();
 const measurement=/([A-Z]{1,5}\d+(?:-\d+)*)号孔[:：]Vse[=＝](\d+(?:\.\d+)?)m[/／]s/gi;
 for(const [index,text] of (source.blocks?.paras||[]).entries()){
  if(numbered.paragraphBuckets[index]!==4)continue;
  const locator='提取段落 '+(index+1),fragment=source.fragments?.find(f=>f.locator===locator);
  if(fragment?.unit&&unit!=='项目整体'&&fragment.unit!==unit)continue;
  const value=label(text),matches=[...value.matchAll(measurement)];
  if(!matches.length||value.replace(measurement,'').replace(/[，,；;。]/g,''))continue;
  for(const match of matches){
   const borehole=match[1],speed=match[2],key=JSON.stringify([borehole,speed,fragment?.unit||'']);
   const reference={locator,quote:text,fragment_id:fragment?.id,page:source.blocks?.paragraphMeta?.[index]?.page,
    sourceOrigin:source.blocks?.paragraphMeta?.[index]?.sourceOrigin||null};
   if(seen.has(key)){rowSources[seen.get(key)].references.push(reference);continue;}
   seen.set(key,rows.length);
   rows.push([borehole,borehole,'','',speed,'','','']);
   rowSources.push({source_id:source.source_id,locator,borehole,location:fragment?.unit||'',
    fields:{speed:[{label:'等效剪切波速(m/s)',value:speed}],cover:[],soil:[],category:[]},references:[reference]});
  }
 }
 return rows.length>1?{key:'site',rows,rowSources,source_id:source.source_id,selection:'explicit-prose-measurements',records:[]}:null;
}
