// Section boundaries come from the uploaded report, not keyword-matched paragraphs repeated across chapters.
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
export function detailedGeotech(source){
 if(!source)return {text:'',tables:[],images:[],report:''};
 const ps=(source.blocks?.paras||source.fragments.filter(f=>!/提取表/.test(f.locator)).map(f=>f.text)).map(clean);
 const chapter=/^(?:[一二三四五六七八九十]+、|[（(][一二三四五六七八九十]+[）)]|\d+\s*[、.])/;
 const take=(re,end=chapter)=>{const start=ps.findIndex(t=>re.test(t));if(start<0)return [];let last=start+1;while(last<ps.length&&!end.test(ps[last]))last++;return ps.slice(start+1,last).filter(t=>t&&!/^(?:图|照片)\d|^拟建场地位置$/.test(t));};
 const terrain=take(/^[（(]四[）)]场地地形[、，]?地貌条件$/);
 const strata=take(/^[（(]五[）)]地质岩性构成$/, /^\s*[（(]六[）)]/);
 const physics=take(/^[（(]六[）)]土的物理力学性质指标$/);
 const site=take(/^[（(]二[）)]场地类别划分$/);
 const liquid=take(/^[（(]四[）)]地震液化问题$/);
 const soft=take(/^[（(]五[）)]软土震陷问题$/);
 const seismic=take(/^[（(]六[）)]建筑抗震地段类别及抗震设计参数$/);
 const fracture=take(/^\d+[、.]活动断裂评价$/);
 const stability=take(/^[（(]二[）)]场地稳定性评价$/);
 const suitability=take(/^[（(]三[）)]建筑适宜性评价$/);
 const engineering=take(/^[（(]二[）)]地基土的工程性质评价$/, /^\s*[（(]三[）)]/);
 const water=take(/^[（(]七[）)]水文地质条件$/, /^\s*[（(]八[）)]/);
 const compact=parts=>[...new Set(parts.map(clean).filter(Boolean))].join('\n');
 const tableList=source.blocks?.tables||[];
 const strength=tableList.findLast(rows=>/天然重度|天然.*重度/.test(rows[0]?.join(''))&&/承载力特征值/.test(rows[0]?.join('')));
 const pile=tableList.find(rows=>/土层名称/.test(rows[0]?.join(''))&&/旋挖成孔/.test(rows[0]?.join('')));
 const physical=tableList.find(rows=>/室内土工试验/.test(rows[0]?.join('')));
 const siteTable=tableList.find(rows=>/等效剪切波速/.test(rows[0]?.join(''))&&/场地类别/.test(rows[0]?.join('')));
 const tables=[['physical',physical],['strength',strength],['pile',pile],['site',siteTable]].filter(([,r])=>r).map(([key,rows])=>({key,rows,source_id:source.source_id}));
 const seen=new Set();const images=(source.blocks?.images||[]).filter(i=>i.afterParagraph<300&&/地貌|区域地质|地壳|活动断裂|钻孔|岩溶|岩芯|地震动/.test(i.caption)).filter(i=>{if(seen.has(i.data))return false;seen.add(i.data);return true;}).map(i=>({...i,source_id:source.source_id}));
 // Word often places two photo captions in one paragraph. Match them in image order.
 const groups=Map.groupBy(images,i=>i.caption);
 for(const [caption,group] of groups){const names=caption.split(/(?=(?:照片|图)\s*\d+\s*[:：])/).map(clean).filter(Boolean);if(names.length===group.length&&names.length>1)group.forEach((im,i)=>im.caption=names[i]);}
 const title=ps.findIndex(t=>/场地岩土工程详细勘察报告/.test(t));
 const report=title>=0?ps.slice(Math.max(0,title-1),title+1).join(''):String(source.name||'').replace(/\.(docx?|pdf)$/i,'');
 const text=[['4.1 场地地形及地貌',terrain],['4.2 场地地层岩性构成',strata],['4.3 地基土层物理力学参数',physics],['4.4 场地地震效应评价',[]],['4.4.1 抗震地段的划分',seismic],['4.4.2 场地类别',site],['4.4.3 场地地震液化判定',liquid],['4.4.4 软土震陷',soft],['4.4.5 断裂带',fracture],['4.5 岩土工程评价',[...stability,...suitability,...engineering]],['4.6 水文地质与腐蚀性',water]].map(([h,parts])=>h+'\n'+compact(parts)).join('\n\n');
 return {text,tables,images,report,source_id:source.source_id};
}
