import {tableRecords} from './intake-structure.js';
import {geotechCorrosionRecords,geotechPermeabilityRecords} from './geotech-tables.js';

// Export adapter for a retained source table. Merges require explicit Word or
// PDF geometry; equal text alone never establishes a merge.
export function geotechNativeTable(source,index){
 const rows=source.blocks?.tables?.[index],meta=source.blocks?.tableMeta?.[index]||{};
 if(!rows?.length||!rows[0]?.length||rows.some(r=>r.length!==rows[0].length))throw Error('来源表不是完整矩形网格');
 const height=rows.length,width=rows[0].length,owners=Array.from({length:height},()=>Array(width).fill(null));
 let geometry='unmerged';
 if(meta.cellOrigins){
  geometry='pdf';
  if(meta.cellOrigins.length!==height)throw Error('PDF表格几何行数不匹配');
  meta.cellOrigins.forEach((r,ri)=>{
   if(r.length!==width)throw Error('PDF表格几何列数不匹配');
   r.forEach((o,ci)=>{if(o)owners[ri][ci]=JSON.stringify(o.bbox);});
  });
 }else if(meta.rows){
  geometry='word';let previous=new Map();
  if(meta.rows.length!==height)throw Error('Word表格几何行数不匹配');
  meta.rows.forEach((r,ri)=>{
   const current=new Map();
   for(const cell of r.cells){
    const c=cell.column,span=cell.span;
    if(!Number.isInteger(c)||!Number.isInteger(span)||span<1||c<0||c+span>width)throw Error('Word表格跨度无效');
    let id=ri+':'+c;
    if(cell.verticalMerge==='continue'){
     id=previous.get(c);
     if(!id||Array.from({length:span},(_,i)=>previous.get(c+i)).some(v=>v!==id))throw Error('Word纵向合并缺少对应起点');
    }
    for(let i=c;i<c+span;i++){
     if(owners[ri][i])throw Error('Word表格单元格重叠');
     owners[ri][i]=id;if(cell.verticalMerge)current.set(i,id);
    }
   }
   previous=current;
  });
 }else rows.forEach((r,ri)=>r.forEach((_,ci)=>owners[ri][ci]=ri+':'+ci));
 const groups=new Map(),norm=v=>String(v??'').replace(/\s+/g,'');
 owners.forEach((r,ri)=>r.forEach((id,ci)=>{
  if(!id){if(norm(rows[ri][ci]))throw Error('有文字的单元格缺少合并归属');id='empty:'+ri+':'+ci;}
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push([ri,ci]);
 }));
 const cells=[];
 for(const points of groups.values()){
  const r=Math.min(...points.map(p=>p[0])),c=Math.min(...points.map(p=>p[1]));
  const rowSpan=Math.max(...points.map(p=>p[0]))-r+1,colSpan=Math.max(...points.map(p=>p[1]))-c+1;
  if(points.length!==rowSpan*colSpan)throw Error('来源合并单元格不是矩形');
  if(points.some(([ri,ci])=>norm(rows[ri][ci])!==norm(rows[r][c])))throw Error('同一合并区域的值不一致');
  cells.push({row:r,column:c,rowSpan,colSpan,text:String(rows[r][c]??'')});
 }
 const records=geotechCorrosionRecords(rows)||geotechPermeabilityRecords(rows)||tableRecords(rows,meta),firstData=records.find(r=>r.kind==='table_row')?.index;
 const headerRows=Number.isInteger(firstData)?firstData:0;
 const ordered=source.blocks.ordered||[],position=ordered.findIndex(b=>b.type==='table'&&b.index===index);
 const before=position<0?null:ordered.slice(0,position).findLast(b=>b.type==='p');
 const caption=before?source.blocks.paras[before.index]:'';
 return {kind:'geotech-source-table',version:1,source_id:source.source_id,hash:source.hash,locator:'提取表 '+(index+1),
  title:caption&&caption.length<100?caption:'',height,width,headerRows,geometry,rows:rows.map(r=>r.map(v=>String(v??''))),cells,
  notes:records.filter(r=>r.kind==='table_note').map(r=>r.text),sourceOrigin:meta.sourceOrigin||null};
}

// Resolve only the continuation relationship already accepted by geotechTables.
// Header cells retain their own table/row identity; body values remain intact.
export function geotechRetainedNativeTable(source,retained,accepted,visited=new Set()){
 const match=/^source-(\d+)$/.exec(retained.key||'');
 if(!match)throw Error('不是已保留的来源表');
 const index=Number(match[1])-1;
 if(visited.has(index))throw Error('续表来源循环');
 const body=geotechNativeTable(source,index);
 if(!retained.inheritedHeaders)return body;
 const previous=source.blocks.tableMeta?.[index]?.continuationOf;
 if(!Number.isInteger(previous)||previous<0||previous>=index||retained.headerSource!==previous+1)throw Error('续表表头来源不一致');
 const predecessor=accepted.find(t=>t.key==='source-'+(previous+1));
 if(!predecessor)throw Error('续表前表未通过章节筛选');
 const nextVisited=new Set(visited);nextVisited.add(index);
 const header=geotechRetainedNativeTable(source,predecessor,accepted,nextVisited),count=retained.inheritedHeaders;
 if(count!==header.headerRows||count<1||body.width!==header.width)throw Error('续表列数或表头层数不匹配');
 const headCells=header.cells.filter(c=>c.row<count);
 if(headCells.some(c=>c.row+c.rowSpan>count))throw Error('表头合并区域跨入正文');
 const rows=[...header.rows.slice(0,count),...body.rows];
 const norm=v=>String(v??'').replace(/\s/g,'');
 if(rows.length!==retained.rows.length||rows.some((r,i)=>r.length!==retained.rows[i].length||r.some((v,c)=>norm(v)!==norm(retained.rows[i][c]))))throw Error('续表合成网格与已保留记录不一致');
 const origin=(cell,table)=>cell.sourceCell||{source_id:source.source_id,table,row:cell.row+1,column:cell.column+1};
 return {...body,title:header.title,height:rows.length,headerRows:count,rows,
  cells:[...headCells.map(c=>({...c,sourceCell:origin(c,previous+1)})),
   ...body.cells.map(c=>({...c,row:c.row+count,sourceCell:origin(c,index+1)}))],
  continuation:{previousTable:previous+1,inheritedHeaderRows:count,headerSource:header.continuation?.headerSource||previous+1}};
}

export function geotechScopedNativeTable(source,retained,accepted,unit='项目整体'){
 const table=geotechRetainedNativeTable(source,retained,accepted);
 if(unit==='项目整体')return table;
 const norm=v=>String(v??'').replace(/\s/g,''),records=retained.records;
 const data=records.filter(r=>r.kind==='table_row');
 if(!data.some(r=>r.unit))return table;
 if(retained.transposed){
  if(retained.inheritedHeaders||!/^(?:拟建)?建筑物名称$/.test(norm(table.rows[0][0])))throw Error('横向单体表缺少明确建筑列边界');
  const columns=[0,...data.filter(r=>norm(r.unit)===norm(unit)).map(r=>r.index)].sort((a,b)=>a-b);
  if(columns.length<2||new Set(columns).size!==columns.length||columns.some(c=>c<0||c>=table.width))throw Error('横向单体列定位无效');
  if(columns.slice(1).some(c=>norm(table.rows[0][c])!==norm(unit)))throw Error('横向单体列与原建筑名称不一致');
  const selected=new Set(columns),mapping=new Map(columns.map((c,i)=>[c,i])),cells=[];
  for(const cell of table.cells){
   const covered=Array.from({length:cell.colSpan},(_,i)=>cell.column+i),used=covered.filter(c=>selected.has(c));
   if(!used.length)continue;
   const shared=cell.column===0&&cell.colSpan===table.width||cell.column===1&&cell.colSpan===table.width-1;
   if(used.length!==covered.length&&!shared)throw Error('单体筛选切断局部跨列合并单元格');
   cells.push({...cell,column:mapping.get(used[0]),colSpan:used.length,
    ...(used.length!==covered.length?{sharedAcrossUnits:true}:{}),
    sourceCell:cell.sourceCell||{source_id:source.source_id,table:Number(retained.key.slice(7)),row:cell.row+1,column:cell.column+1}});
  }
  return {...table,headerRows:1,width:columns.length,rows:table.rows.map(r=>columns.map(c=>r[c])),cells,
   scope:{unit,originalColumns:columns.map(c=>c+1),sharedConditionsPreserved:true}};
 }
 if(records.some(r=>!['table_row','table_note'].includes(r.kind)))throw Error('单体表存在未映射行，不能裁剪');
 const offset=retained.inheritedHeaders||0;
 const headerRows=retained.headerRecovery?Math.min(...data.map(r=>r.index+offset)):table.headerRows;
 if(!headerRows)throw Error('单体表缺少可核实的表头边界');
 const chosen=data.filter(r=>!r.unit||norm(r.unit)===norm(unit));
 if(!chosen.length)throw Error('单体表没有匹配行');
 const kept=[...new Set([...Array.from({length:headerRows},(_,i)=>i),...chosen.map(r=>r.index+offset),
  ...records.filter(r=>r.kind==='table_note').map(r=>r.index+offset)])].sort((a,b)=>a-b);
 if(kept.some(r=>r<0||r>=table.height))throw Error('单体行定位超出原表');
 const selected=new Set(kept),rowMap=new Map(kept.map((r,i)=>[r,i])),cells=[];
 const index=Number(retained.key.slice(7));
 for(const cell of table.cells){
  const covered=Array.from({length:cell.rowSpan},(_,i)=>cell.row+i),used=covered.filter(r=>selected.has(r));
  if(!used.length)continue;
  if(used.length!==covered.length)throw Error('单体筛选切断跨行合并单元格');
  cells.push({...cell,row:rowMap.get(cell.row),sourceCell:cell.sourceCell||{source_id:source.source_id,table:index,row:cell.row+1,column:cell.column+1}});
 }
 return {...table,headerRows,height:kept.length,rows:kept.map(r=>table.rows[r]),cells,
  scope:{unit,originalRows:kept.map(r=>r+1)}};
}
