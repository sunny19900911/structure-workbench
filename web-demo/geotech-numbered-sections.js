// Organize the report's own hierarchy before mapping it to the design report.
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
const destinations=[
 [/地形.*地貌|地貌.*地形|^自然[、与及]?地理环境$|^(?:场地|工程)?地理位置$/,0],
 [/^(?:场地)?(?:地层(?:岩性.*|结构.*|分布.*|特征描述|概述)|地质岩性构成|地基土(?:的)?(?:构成.*|分布规律))$/,1],
 [/物理力学|(?:室内|土工|岩石)试验.*(?:指标|成果)|原位测试.*(?:指标|成果)|压缩模量|桩基(?:础)?设计参数|^(?:天然地基|桩基)工程特性指标$|^(?:各岩土层的)?岩土参数的(?:分析与选定|选用)$|地基(?:岩土|土)?(?:设计)?参数(?:建议值|确定)|承载力.*计算参数|沉降.*参数|地基.*承载力(?:$|.*(?:确定|评价|特征值))/,2],
 [/抗震地段|场地地段划分|地震动参数|抗震设防烈度|抗震设计(?:参数|基本条件)|^(?:场地)?地震参数$/,3],
 [/场地类别|场地土类型|土的类型划分|^(?:场地)?特征周期$|^(?:钻孔|场地土层)?(?:剪切)?波速测试(?:成果|结果)?$/,4],
 [/液化.*(?:判别|判定|评价|问题)|^(?:地震)?液化(?:土)?$/,5],
 [/软土震陷/,6],
 [/活动断裂|区域构造及地震|地质构造|新构造运动及地震|^区域(?:构造|地质条件)$|^地震$|^(?:场地)?断裂带(?:评价)?$|断裂(?:[东西南北]支)?(?:[（(]F?\d+[）)])?$/i,7],
 [/稳定性|不良地质|特殊性岩土|不利埋藏物|岩溶|^(?:各)?岩土层(?:的)?胀缩性(?:评价|等级)$|^膨胀土地基胀缩等级$/,8],
 [/适宜性/,9],
 [/地基(?:岩土|土).*评价|地基均匀性|^(?:各)?(?:土层|岩土层|地层)(?:的)?工程(?:性质|性能)评价$/,10],
 [/水文地质|地下水位及类型|^(?:水文|浅部潜水|地下水|地表水|地表水[、及与和]地下水)$|腐蚀性|渗透性|标准冻结深度/,11],
 [/抗浮.*(?:水位|评价)|地下室抗浮/,13],
 [/基础(?:型式|形式|方案|选型)|天然地基(?:$|方案|评价)|^(?:地基基础类型的分析与评价|复合地基评价|桩基础评价|桩基类型选择|静压预制桩|钻孔灌注桩|旋挖成孔灌注桩)$|桩基(?:方案|工程)?$|桩型.*选择|持力层.*(?:选择|分析)/,12]
];
const excluded=/勘察.*(?:目的|任务|要求|方法|依据|工作量)|勘探工作|执行规范|技术标准|气象|气候|施工|监测|检测|试验方法/;
// Geological construction risks adopted in design reports remain survey
// advice. Generic construction instructions still stay outside the summary.
const foundationRiskTitle=title=>!/(?:勘察|调查).*(?:目的|任务|要求|方法|依据)|试验方法/.test(title)&&/^(?:桩基础?.*地质问题|成桩(?:可行性|风险(?:分析|评价)))/.test(title);
const instructional=title=>/(?:勘察|测试|检测).*(?:目的|任务|要求|依据|方法)|技术标准|执行规范/.test(title);
// Actual climate/hydrology conditions are retained in the historical design
// reports. Accept result headings, without admitting climate survey tasks.
const climateResultTitle=title=>/^(?:气象|气候)(?:[、，]?水文)?(?:条件|特征|概况)$|^气象[、，]水文(?:及|与|和)水文地质条件$/.test(title);
const isExcluded=title=>(excluded.test(title)||instructional(title))&&!foundationRiskTitle(title)&&!climateResultTitle(title);
// Standalone attachment titles terminate the preceding prose context. Their
// source paragraphs and tables remain available; a later result heading may
// establish its own context again.
const attachmentTitle=text=>/^(?:勘察工作量一览表|综合图例|岩石抗压强度检验报告|水质分析报告|土壤易溶盐检测报告)$/.test(text.replace(/\s/g,''));
// A trailing year or value is not a page number in body prose. The weaker
// shape is useful only to reject a proposed heading, never to discard a line.
const tocEntry=(text,headingCandidate=false)=>/[.．…·]{2,}\s*\d+\s*$|\s*[-－—]\s*\d+\s*[-－—]\s*$/.test(text)||headingCandidate&&/\D\d+\s*$/.test(text);
const appendix=text=>/^(?:[ⅠⅡⅢIVX]+\s*)?附(?:图|表|件|录)(?:[、及与图表\s]*|.*部分)[:：]?$/.test(text.replace(/\s/g,''));
function conclusionBucket(text){
 const topics=[[/地形|地貌|地势/,0],[/地层结构|地层岩性/,1],[/地震动峰值加速度|抗震设防|地震烈度|地震分组/,3],[/场地类别|剪切波速|覆盖层厚度/,4],[/液化/,5],[/震陷/,6],[/活动断裂|发震断裂/,7],[/特殊性岩土|不良地质|稳定性|(?:场地|地基).*稳定|建筑适宜性/,8],[/地下水|水位|腐蚀性/,11],[/基础选型|基础形式|基础方案|持力层|桩基|成桩/,12],[/抗浮/,13]].filter(([re])=>re.test(text)).map(([,bucket])=>bucket);
 // Keep mixed conclusions intact in the engineering evaluation. Splitting
 // by keywords can detach a conclusion from its conditions or contrary view.
 if(!topics.length)return -1;
 if(topics.includes(13)&&topics.every(t=>[11,13].includes(t)))return 13;
 return topics.length===1?topics[0]:8;
}
export function geotechDestination(title){
 if(climateResultTitle(title))return 11;
 if(/^(?:单桩(?:竖向)?(?:极限)?承载力估算|桩基础的有关估算指标)$/.test(title))return 12;
 if(/^(?:(?:室内)?岩石(?:饱和)?(?:单轴)?抗压强度试验|自由膨胀率试验|(?:固结快剪|剪切)试验)$/.test(title))return 2;
 if(/^天然地基承载力验算$/.test(title))return 12;
 if(foundationRiskTitle(title))return 12;
 if(/^(?:场地)?填方工程(?:评述|评价)$/.test(title))return 10;
 if(/^地基岩[、，,]?土层设计参数一览表$/.test(title))return 2;
 if(/抗浮/.test(title))return 13;
 if(/场地.*地震效应/.test(title))return 3;
 if(/土的类型划分/.test(title))return 4;
 if(isExcluded(title))return -1;
 return destinations.find(([re])=>re.test(title))?.[1]??-1;
}
function heading(text,meta){
 // A parenthetical explanation followed by enumeration punctuation is a
 // wrapped sentence continuation, even if it contains a heading keyword.
 const parenthetical=/^[（(]([^）)]+)[）)][、，,]/.exec(text);
 if(parenthetical&&!/^[一二三四五六七八九十\d]+$/.test(parenthetical[1]))return null;
 if(/^(?:[一二三四五六七八九十]+[、．.]|\d+(?:[.．]\d+)*[、．.]?\s*)?\s*(?:勘察)?结论(?:与建议)?[:：]$/.test(text))text=text.slice(0,-1);
 if(/^\d+[、.．]\s*(?:场地土类型|建筑场地类别)[:：]$/.test(text))text=text.slice(0,-1);
 if(Number.isInteger(meta?.headingLevel))text=text.replace(/[:：]$/,'');
 if(!text||text.length>85||/[。；：:《》]|[.．…·]{2,}|(?:第\s*\d.*条)|^图|^照片|^表\s*\d/.test(text))return null;
 const m=/^(?:([一二三四五六七八九十]+)[、．.]|[（(]([一二三四五六七八九十\d]+)[）)]|(\d+(?:[.．]\d+)*)(?:[.、．]|\s)*(?=[\u4e00-\u9fff]))\s*(.+)$/.exec(text);
 const title=(m?.[4]||text).replace(/\s+/g,'');
 if(!m&&!Number.isInteger(meta?.headingLevel)&&(title.length>38||/[，,]/.test(title)||/^(?:本|根据|各层|资料|请|场地内|综上|截图|\d|[（(]\d)/.test(title)))return null;
 if(/^(?:条|款|项|号|米|倍桩径)|(?:为|未见|未测|具有|应进行|可采用)|\d+(?:\.\d+)?(?:m|米|层|kPa)/i.test(title))return null;
 if(tocEntry(text,true)||/[（(]?\d+\s*[张页份][）)]?$/.test(title))return null;
 const bucket=geotechDestination(title);
 const explicit=Number.isInteger(meta?.headingLevel);
 if(!m&&!explicit&&bucket<0&&!/^(?:序言|前言|结论(?:与建议)?|建议|.*工程地质条件|岩土工程分析评价|场地地震效应评价)$/.test(title))return null;
 // Parenthesized Arabic numbers are commonly soil-layer labels, not chapter headings.
 const level=explicit?meta.headingLevel+1:m?.[1]?1:m?.[2]?(/^\d+$/.test(m[2])?4:2):m?.[3]?(m[3].includes('.')||m[3].includes('．')?m[3].split(/[.．]/).length+1:/^\d+[、.．]/.test(text)?3:1):2;
 return {title,bucket,level,excluded:isExcluded(title)};
}
export function numberedGeotechSections(source,unit='项目整体'){
 const raw=source.blocks?.paras||[];if(!raw.length)return null;
 const isPDF=/\.pdf$/i.test(source.name||''),reflowPDF=isPDF&&!source.blocks?.pdfReadReport?.paragraphsReflowed,removed=new Set();
 for(let i=0;i<raw.length;i++)if(/岩土工程.*勘察报告$/.test(tidy(raw[i]))&&/^工程编号/.test(tidy(raw[i+1]))){
  if(i&&/工程$/.test(tidy(raw[i-1])))removed.add(i-1);
  for(let j=i;j<Math.min(i+13,raw.length);j++){removed.add(j);if(j>i&&tidy(raw[j])==='页'&&tidy(raw[j-2])==='共')break;}
 }
 const lines=[];
 raw.forEach((text,index)=>{
  if(source.blocks?.paragraphMeta?.[index]?.sourceBoundary){lines.push({boundary:true,index});return;}
  if(removed.has(index))return;
  let value=tidy(text).replace(/\d+B\d+B(?=[一二三四五六七八九十]+、)/g,'');
  if(reflowPDF)value=value.replace(/(\d+(?:\.\d+)+)\s*(?=[\u4e00-\u9fff])/g,'\n$1 ').replace(/([一二三四五六七八九十]+、)/g,'\n$1');
  for(const part of value.split('\n'))if(part)lines.push({text:part,index});
 });
 const buckets=Array.from({length:14},()=>[]),runs=Array.from({length:14},()=>[]),indices=new Set(),sections=[],stack=[],paragraphBuckets=Array(raw.length).fill(-1),conclusions=[];
 const order=source.blocks?.ordered||[],positions=new Map(order.flatMap((b,i)=>b.type==='p'?[[b.index,i]]:[]));
 const tablePositions=order.flatMap((b,i)=>b.type==='table'?[i]:[]);
 let frontMatter=false;
 let buffer=[],active=-1;
 const addRuns=(bucket,parts,join)=>{
  let run=[];
  const emit=()=>{if(!run.length)return;runs[bucket].push({text:run.map(x=>x.text).join(''),paragraphs:[...new Set(run.map(x=>x.index))]});run=[];};
  for(const line of parts){
   if(run.length&&(!join||tablePositions.some(p=>p>positions.get(run.at(-1).index)&&p<positions.get(line.index))))emit();
   run.push(line);
  }
  emit();
 };
 const flush=()=>{
  if(active>=0&&buffer.length){
   const texts=reflowPDF?[buffer.map(x=>x.text).join('').replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,'')]:buffer.map(x=>x.text);
   buckets[active].push(...texts.filter(Boolean));buffer.forEach(x=>indices.add(x.index));
   // Export runs may not bridge a source table. Keep the legacy bucket text
   // unchanged while giving renderers exact paragraph positions to interleave.
   addRuns(active,buffer,reflowPDF);
  }buffer=[];
 };
 for(const line of lines){
  if(line.boundary){flush();frontMatter=false;active=-1;stack.length=0;continue;}
  if(attachmentTitle(line.text)){flush();frontMatter=false;active=-1;stack.length=0;continue;}
  // Administrative signature lines are not geological conclusions or notes.
  if(/^(?:制表|审核|审定|签字)\s*[:：]/.test(line.text))continue;
  if(/^目\s*录$/.test(line.text)||appendix(line.text)||/^附[表图][:：]/.test(line.text)){
   flush();frontMatter=true;active=-1;stack.length=0;continue;
  }
  if(/表\s*\d+(?:[.－-]\d+)*\s*$/.test(line.text)&&!/[。；：:《》]|^(?:注|说明|备注)|依据|根据/.test(line.text)){paragraphBuckets[line.index]=active;continue;}
  if(tocEntry(line.text)&&line.text.length<100)continue;
  // A labelled stratum is content, even if Word styles it as a heading.
  // Keep its identifier with the following description without changing hierarchy.
  const stabilityLayer=active===8&&/^(?:[（(]\d+[）)](?:\s*[-－]\s*\d+)?|[①-⑳](?:[-－]\d+)?)层/.test(line.text);
  if((active===1||stabilityLayer)&&/^(?:[（(]\d+[）)](?:\s*[-－]\s*\d+)?|[①-⑳](?:[-－]\d+)?)(?:层)?\s*[^。；]{0,45}(?:土|砂|岩|砾|卵石)/.test(line.text)){
   const fragment=source.fragments?.find(f=>f.locator==='提取段落 '+(line.index+1));
   if(fragment?.unit&&unit!=='项目整体'&&fragment.unit!==unit)continue;
   flush();paragraphBuckets[line.index]=active;buffer.push(line);continue;
  }
  let h=heading(line.text,source.blocks?.paragraphMeta?.[line.index]);
  // A PDF conclusion item may wrap before its first punctuation. Its long
  // numbered first line is prose, not a heading that may discard that line.
  if(h&&stack.at(-1)?.conclusion&&/^\d+[、．.]/.test(line.text)&&h.title.length>20)h=null;
  if(h&&stack.at(-1)?.conclusion&&h.bucket<0&&/[，,]/.test(line.text))h=null;
  if(frontMatter){
   const explicit=Number.isInteger(source.blocks?.paragraphMeta?.[line.index]?.headingLevel);
   const numberedBody=/^(?:\d+(?:[.．]\d+)*\s*[^\d]|[一二三四五六七八九十]+[、．.]|[（(][一二三四五六七八九十\d]+[）)])/.test(line.text);
   if(!h||(!explicit&&!numberedBody)||/[张份]$/.test(line.text))continue;
   frontMatter=false;
  }
  if(h){
   flush();while(stack.length&&stack.at(-1).level>=h.level)stack.pop();
   const parent=stack.at(-1);
   // Unknown subordinate headings (e.g. a stratum's geological age) keep their parent.
   const umbrella=/工程地质.*(?:条件|水文)|场地工程[及与和、]水文地质条件|岩土工程条件|岩土工程.*分析|结论|^建议$|基坑工程|桩基础$/.test(h.title);
   active=h.excluded||parent?.blocked||umbrella?-1:h.bucket>=0?h.bucket:(parent&&[1,2,8,10,11].includes(parent.active)?parent.active:-1);
   const blocked=!!(parent?.blocked||instructional(h.title));
   const conclusion=!blocked&&!h.excluded&&(/^(?:勘察)?结论(?:与建议)?$/.test(h.title)||!!parent?.conclusion);
   const conclusionScope=conclusion?(parent?.conclusionScope??line.index):null;
   stack.push({...h,active,blocked,conclusion,conclusionScope});sections.push({...h,active,blocked,index:line.index});paragraphBuckets[line.index]=active;
   // Geological age/origin subdivisions carry information absent from the
   // individual layer descriptions. Preserve them within accepted strata only.
   const geologicalSubdivision=active===1&&parent?.active===1&&h.bucket<0&&/地层|第[一二三四]系|[上中下]统|(?:坡|残|冲|洪|湖|海)积(?:相|层)/.test(h.title);
   const numberedFault=active===7&&/断裂(?:[东西南北]支)?[（(]F?\d+[）)]$/i.test(h.title);
   if(geologicalSubdivision||numberedFault){
    const fragment=source.fragments?.find(f=>f.locator==='提取段落 '+(line.index+1));
    if(!fragment?.unit||unit==='项目整体'||fragment.unit===unit)buffer.push(line);
   }
   continue;
  }
  paragraphBuckets[line.index]=active;
  if(active<0&&stack.at(-1)?.conclusion&&!/^(?:图|照片|表)\s*\d/.test(line.text)){
   const fragment=source.fragments?.find(f=>f.locator==='提取段落 '+(line.index+1));
   if(!fragment?.unit||unit==='项目整体'||fragment.unit===unit)conclusions.push({...line,scope:stack.at(-1).conclusionScope,unit:fragment?.unit||''});
  }
  if(active<0||/[.．…·]{3,}/.test(line.text)||/^(?:图|照片|表)\s*\d/.test(line.text))continue;
  const fragment=source.fragments?.find(f=>f.locator==='提取段落 '+(line.index+1));
  if(fragment?.unit&&unit!=='项目整体'&&fragment.unit!==unit)continue;
  if((active===1||active===8)&&/^[（(]\d+[）)]层|^[①②③④⑤⑥⑦⑧⑨]/.test(line.text))flush();
  buffer.push(line);
 }
 flush();
 const normalized=t=>tidy(t).replace(/^(?:[（(][一二三四五六七八九十\d]+[）)]|\d+、)\s*/,'').replace(/\s/g,'');
 let retained=buckets.map(parts=>parts.map(normalized).join('')).join('\n');
 const conclusionRuns=[];
 for(const line of conclusions){
  const previous=conclusionRuns.at(-1);
  // PDF layout blocks may end halfway through a sentence even when the page
  // reader has reflowed individual lines. Keep the qualifying tail attached.
  if(isPDF&&previous&&previous.scope===line.scope&&previous.unit===line.unit&&line.index<=previous.indices.at(-1)+1&&!/[。！？；：:]$/.test(previous.text)&&!/^\s*(?:\d+[、．.]|[（(][一二三四五六七八九十\d]+[）)])/.test(line.text)){
   previous.text+=line.text;previous.indices.push(line.index);
  }else conclusionRuns.push({...line,indices:[line.index]});
 }
 for(const line of conclusionRuns){
  const bucket=conclusionBucket(line.text),value=normalized(line.text);
  if(bucket<0||!value||retained.includes(value))continue;
  buckets[bucket].push(line.text);
  const parts=conclusions.filter(c=>c.scope===line.scope&&c.unit===line.unit&&line.indices.includes(c.index));
  if(parts.map(c=>c.text).join('')===line.text)addRuns(bucket,parts,true);
  else runs[bucket].push({text:line.text,paragraphs:line.indices});
  line.indices.forEach(index=>{indices.add(index);paragraphBuckets[index]=bucket;});retained+='\n'+value;
 }
 // A task-only hierarchy is an explicit exclusion, not an invitation to fall
 // back to keyword extraction and revive its labelled test-result table.
 if(!indices.size&&!sections.some(s=>s.active>=0)&&(!sections.some(s=>s.excluded)||sections.some(s=>!s.excluded&&!s.blocked)))return null;
 const evidence=[...indices].map(i=>source.fragments?.find(f=>f.locator==='提取段落 '+(i+1))||{id:'SECTION-P'+(i+1),text:raw[i],locator:'提取段落 '+(i+1)});
 return {buckets,runs,evidence,sections,paragraphBuckets};
}
