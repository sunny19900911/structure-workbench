// Read explicitly bounded building sections; do not infer structural height from architectural heights.
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const title=t=>/^(?:\d+(?:\.\d+)*[.、．]?|[一二三四五六七八九十]+、)\s*([^，。；：:]{2,45})$/.exec(t)?.[1];
export function architecturalUnitSections(source){
 const ps=(source.blocks?.paras||[]).map(clean),out=[];
 for(let i=0;i<ps.length;i++){
  const name=title(ps[i]);if(!name)continue;
  let end=i+1;while(end<ps.length&&!title(ps[end]))end++;
  const own=ps.slice(i+1,end);
  // Both labels distinguish a building description from general design or code sections.
  const area=own.find(t=>/^(?:总建筑面积|建筑总面积|建筑面积)\s*[:：]/.test(t));
  const floor=own.find(t=>/^建筑层数\s*[:：]/.test(t));
  if(!area||!floor)continue;
  const u={name,area:/(?:面积)\s*[:：]\s*([\d,]+(?:\.\d+)?)\s*(?:㎡|m[²2]|平方米)/i.exec(area)?.[1]||'',floors:'',planningHeight:'',fireHeight:'',storeys:'',use:'',locator:'提取段落 '+(i+1)};
  const above=/地上\s*(\d+)\s*层/.exec(floor)?.[1],below=/地下\s*(\d+)\s*层/.exec(floor)?.[1];
  u.floors=(above||'')+(below?'；地下'+below:'');
  for(const t of own){
   if(/^层高\s*[:：]/.test(t))u.storeys=t.replace(/^层高\s*[:：]/,'').replace(/[；;]$/,'');
   for(const [key,re] of [['planningHeight',/^规划(?:建筑)?高度\s*[:：]\s*([\d.]+)\s*(?:m|米)/i],['fireHeight',/^消防(?:建筑)?高度\s*[:：]\s*([\d.]+)\s*(?:m|米)/i]])if(re.test(t))u[key]=re.exec(t)[1];
   if(t.startsWith(name)&&/设置|功能|用作|用途/.test(t))u.use=t.split(/(?<=[。])/).filter(x=>/设置|功能|用作|用途/.test(x)).join('');
  }
  const evidence=ps.slice(i,end).map((text,j)=>source.fragments?.find(f=>f.locator==='提取段落 '+(i+j+1))||{id:'SECTION-P'+(i+j+1),locator:'提取段落 '+(i+j+1),text});
  out.push({unit:u,evidence});i=end-1;
 }
 return out;
}
