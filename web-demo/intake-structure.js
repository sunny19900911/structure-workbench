// Shared evidence classification for facts and document composition. Raw input is immutable.
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const field=/^(?:项目名称|工程名称|项目编号|工程地点|建设地点|气候区|.*太阳辐射吸收系数)$/;
export function projectName(value){
 const name=clean(value).split(/(?:设计|资质)?证书(?:编号|号)|项目编号|工程编号/)[0].replace(/[；;，,:：\s]+$/,'');
 return !name||field.test(name)?'':name;
}
export function paragraphKinds(paras){
 let excluded=false,level=0;
 return paras.map(value=>{
  const text=clean(value),prefix=/^(?:([一二三四五六七八九十]+)、|([（(][一二三四五六七八九十\d]+[）)])|(\d+(?:\.\d+)*)(?:[、.]|\s))/.exec(text);
  const named=/^(?:勘察结论(?:与建议)?|结论与建议|场地地形(?:及|、)?地貌(?:条件)?|地层岩性|地质岩性构成|水文地质条件|地下水|场地类别划分|地震液化问题|基础选型(?:及建议)?|建议)$/.test(text);
  const heading=named||text.length<65&&!/[。；：:]|(?:为|未见|未测|具有|建议采用|不考虑|应进行|可采用)|\d+(?:\.\d+)?\s*(?:m|米|层|kPa)/i.test(text)&&!!prefix;
  const rank=prefix?.[1]?1:prefix?.[2]?2:prefix?.[3]?.split('.').length+2;
  const toc=/[.．…·]{2,}\s*\d+$/.test(text)||heading&&/[^\d]\d+$/.test(text)&&!/[m米层]$/.test(text);
  const taskTitle=text.length<70&&/^(?:本次)?(?:勘察(?:任务|目的|要求|工作布置|工作方法|方案布置)|勘探工作|完成工作量|执行规范|勘察依据)/.test(text.slice(prefix?.[0].length||0))&&!/[。；]/.test(text);
  if(taskTitle){excluded=true;level=rank||1;}
  else if(heading&&(named||!level||rank<=level)){excluded=false;level=0;}
  const demand=/^(?:本次)?勘察(?:任务|要求)[:：]/.test(text);
  const caption=/^(?:表\s*\d+|.*\s表\s*\d+)\s*[^。；]*$/.test(text)||/^(?:各.*)?(?:基础型式|基础选型).*详见/.test(text);
  return toc?'toc':taskTitle||excluded||demand?'requirement':heading?'heading':caption?'caption':/^注[:：]/.test(text)?'table_note':'body';
 });
}
export const usable=f=>!['toc','requirement','heading','caption','table_header','unmapped'].includes(f?.kind);
export function sourceParagraphs(source){
 const fs=(source?.fragments?.length?source.fragments:(source?.blocks?.paras||[]).map((text,i)=>({id:'P'+(i+1),text,locator:'提取段落 '+(i+1)}))).filter(f=>!/表\s*\d+/.test(f.locator||''));
 const kinds=paragraphKinds(fs.map(f=>f.text));
 return fs.map((f,i)=>({...f,kind:f.kind||kinds[i]})).filter(usable);
}
const unitHeader=/^(?:单体名称|建筑名称|栋号|(?:拟建)?建[（(]构[）)]筑物名称|(?:拟建)?建筑物名称)$/;
const hasValue=v=>/^[+-]?\d+(?:[.,]\d+)*(?:\s*[/～~—-]\s*\d+(?:\.\d+)*)?\s*(?:m²|m2|㎡|m|米|层|kPa|MPa|%)?$/i.test(clean(v));
export function tableRecords(rows,meta={}){
 if(!rows?.length)return [];
 // Key/value schedules have row labels, not a header made from their first project value.
 const pair=row=>{const values=[...new Set(row.slice(1).map(clean).filter(Boolean))];return values.length===1?values[0]:null;};
 if(field.test(clean(rows[0][0]))&&pair(rows[0])!==null&&!field.test(pair(rows[0])))return rows.map((row,index)=>({index,kind:pair(row)===null?'unmapped':'table_row',cells:row,fields:[{path:[clean(row[0])],label:clean(row[0]),value:pair(row)||'',mapped:pair(row)!==null}],text:clean(row[0])+'：'+(pair(row)||row.slice(1).map(clean).join('；')),unit:''}));
 let count=0;
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  if(i>0&&!meta.rows?.[i]?.header&&row.some(hasValue))break;
  if(i>0&&!meta.rows?.[i]?.header&&row.some(v=>/^[①②③④⑤⑥⑦⑧⑨]|^(?:注[:：])/.test(clean(v))))break;
  if(i>0&&!meta.rows?.[i]?.header&&count&&rows[0].some(v=>unitHeader.test(clean(v)))&&!row.some(v=>/层数|高度|面积|名称|地下|地上|^单位$/.test(clean(v))))break;
  count++;
 }
 const paths=Array.from({length:Math.max(...rows.map(r=>r.length))},(_,c)=>[...new Set(rows.slice(0,count).map(r=>clean(r[c])).filter(Boolean))]);
 return rows.slice(count).map((row,offset)=>{
  const note=[...new Set(row.map(clean).filter(Boolean))];
  if(note.length===1&&/^注[:：]/.test(note[0]))return {index:count+offset,kind:'table_note',cells:row,fields:[],text:note[0],unit:''};
  const fields=row.map((v,c)=>({path:paths[c]||[],label:(paths[c]||[]).join(' / '),value:clean(v),mapped:!!paths[c]?.length}));
  const name=fields.find(f=>f.path.some(p=>unitHeader.test(p)));
  const text=fields.filter(f=>f.value).map(f=>(f.label||'未映射列')+'：'+f.value).join('；');
  return {index:count+offset,kind:fields.some(f=>!f.mapped&&f.value)?'unmapped':'table_row',cells:row,fields,text,unit:name?.value||'',row_key:name?.value||clean(row[0])};
 });
}

export function blockTableRecords(blocks,t){
 const order=(blocks.ordered||[]).findIndex(b=>b.type==='table'&&b.index===t);
 const preceding=order<0?null:blocks.ordered.slice(0,order).findLast(b=>b.type==='p');
 const kinds=paragraphKinds(blocks.paras||[]);
 const excluded=preceding&&['requirement','toc'].includes(kinds[preceding.index]);
 return tableRecords(blocks.tables[t],blocks.tableMeta?.[t]).map(r=>({...r,kind:excluded?'requirement':r.kind}));
}

// reference-report's soil/site tables consume fixed slots. Map explicit headers
// into those slots here, keeping original rows and header paths alongside them.
export function geotechTableRows(key,records){
 const data=records.filter(r=>r.kind==='table_row');
 const read=(r,re,unit)=>{
  const cells=r.fields.filter(c=>re.test(c.label)&&(!unit||unit.test(c.label)));
  return cells.length===1?cells[0].value:'';
 };
 const name=r=>read(r,/土层名称|岩土名称|地层名称/);
 if(key==='strength')return [['土层名称','天然重度（kN/m³）','','','黏聚力（kPa）','承载力特征值（kPa）'],...data.map(r=>[
  name(r),read(r,/天然.*重度/,/kN\s*[/／]\s*m[³3]/i),'','',read(r,/[黏粘]聚力/,/kPa/i),read(r,/承载力特征值/,/kPa/i)
 ])];
 if(key==='pile'){
  const method=data.flatMap(r=>r.fields).flatMap(c=>c.path).find(p=>/旋挖成孔/.test(p))||'桩基';
  return [['土层名称',method,'桩端阻力'],...data.map(r=>[name(r),read(r,/侧阻力/,/kPa/i),read(r,/端阻力/,/kPa/i)])];
 }
 if(key==='site')return [['','等效剪切波速','','','土类型','场地类别','','覆盖层厚度'],...data.map(r=>[
  '',read(r,/等效剪切波速/,/m\s*[/／]\s*s/i),'','',read(r,/土类型/),read(r,/场地类别/),'',read(r,/覆盖层厚度/,/[（(]m[）)]/i)
 ])];
 return null;
}
