// Organize the report's own hierarchy before mapping it to the design report.
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
const destinations=[
 [/地形.*地貌|地貌.*地形/,0],
 [/^(?:场地)?(?:地层(?:岩性.*|结构.*|分布.*|特征描述)|地质岩性构成|地基土(?:的)?(?:构成.*|分布规律))$/,1],
 [/物理力学|(?:室内|土工)试验.*指标|原位测试.*(?:指标|成果)|压缩模量|桩基设计参数|承载力.*计算参数|沉降.*参数|地基.*承载力(?:$|.*(?:确定|评价|特征值))/,2],
 [/抗震地段|场地地段划分|地震动参数|抗震设防烈度|抗震设计(?:参数|基本条件)/,3],
 [/场地类别|场地土类型|土的类型划分/,4],
 [/液化.*(?:判别|判定|评价|问题)|^(?:地震)?液化(?:土)?$/,5],
 [/软土震陷/,6],
 [/活动断裂|区域构造及地震|地质构造|新构造运动及地震/,7],
 [/稳定性|不良地质|特殊性岩土|不利埋藏物|岩溶/,8],
 [/适宜性/,9],
 [/地基(?:岩土|土).*评价|地基均匀性/,10],
 [/水文地质|地下水位及类型|^(?:浅部潜水|地下水|地表水)$|腐蚀性|渗透性|标准冻结深度/,11],
 [/抗浮.*(?:水位|评价)|地下室抗浮/,13],
 [/基础(?:型式|形式|方案|选型)|天然地基(?:$|方案|评价与分析)|桩基(?:方案|工程)?$|桩型.*选择|持力层.*(?:选择|分析)/,12]
];
const excluded=/勘察.*(?:目的|任务|要求|方法|依据|工作量)|勘探工作|执行规范|技术标准|气象|气候|施工|监测|检测|试验方法/;
const tocEntry=text=>/[.．…·]{2,}\s*\d+\s*$|\s*[-－—]\s*\d+\s*[-－—]\s*$/.test(text)||/\D\d+\s*$/.test(text)&&!/[m米层]$/.test(text);
const appendix=text=>/^(?:[ⅠⅡⅢIVX]+\s*)?附(?:图|表|件|录)(?:[、及与图表\s]*|.*部分)[:：]?$/.test(text.replace(/\s/g,''));
export function geotechDestination(title){
 if(/抗浮/.test(title))return 13;
 if(/场地.*地震效应/.test(title))return 3;
 if(/土的类型划分/.test(title))return 4;
 if(excluded.test(title))return -1;
 return destinations.find(([re])=>re.test(title))?.[1]??-1;
}
function heading(text,meta){
 if(!text||text.length>85||/[。；：:《》]|[.．…·]{2,}|(?:第\s*\d.*条)|^图|^照片|^表\s*\d/.test(text))return null;
 const m=/^(?:([一二三四五六七八九十]+)[、．.]|[（(]([一二三四五六七八九十\d]+)[）)]|(\d+(?:[.．]\d+)*)(?:[.、．]|\s)*(?=[\u4e00-\u9fff]))\s*(.+)$/.exec(text);
 const title=(m?.[4]||text).replace(/\s+/g,'');
 if(!m&&!Number.isInteger(meta?.headingLevel)&&(title.length>38||/[，,]/.test(title)||/^(?:本|根据|各层|资料|请|场地内|综上|截图|\d|[（(]\d)/.test(title)))return null;
 if(/^(?:条|款|项|号|米)|(?:为|未见|未测|具有|应进行|可采用)|\d+(?:\.\d+)?(?:m|米|层|kPa)/i.test(title))return null;
 if(tocEntry(text)||/[（(]?\d+\s*[张页份][）)]?$/.test(title))return null;
 const bucket=geotechDestination(title);
 const explicit=Number.isInteger(meta?.headingLevel);
 if(!m&&!explicit&&bucket<0&&!/^(?:序言|前言|结论(?:与建议)?|建议|.*工程地质条件|岩土工程分析评价|场地地震效应评价)$/.test(title))return null;
 // Parenthesized Arabic numbers are commonly soil-layer labels, not chapter headings.
 const level=explicit?meta.headingLevel+1:m?.[1]?1:m?.[2]?(/^\d+$/.test(m[2])?4:2):m?.[3]?(m[3].includes('.')||m[3].includes('．')?m[3].split(/[.．]/).length+1:/^\d+[、.．]/.test(text)?3:1):2;
 return {title,bucket,level,excluded:excluded.test(title)};
}
export function numberedGeotechSections(source,unit='项目整体'){
 const raw=source.blocks?.paras||[];if(!raw.length)return null;
 const isPDF=/\.pdf$/i.test(source.name||''),removed=new Set();
 for(let i=0;i<raw.length;i++)if(/岩土工程.*勘察报告$/.test(tidy(raw[i]))&&/^工程编号/.test(tidy(raw[i+1]))){
  if(i&&/工程$/.test(tidy(raw[i-1])))removed.add(i-1);
  for(let j=i;j<Math.min(i+13,raw.length);j++){removed.add(j);if(j>i&&tidy(raw[j])==='页'&&tidy(raw[j-2])==='共')break;}
 }
 const lines=[];
 raw.forEach((text,index)=>{
  if(removed.has(index))return;
  let value=tidy(text).replace(/\d+B\d+B(?=[一二三四五六七八九十]+、)/g,'');
  if(isPDF)value=value.replace(/(\d+(?:\.\d+)+)\s*(?=[\u4e00-\u9fff])/g,'\n$1 ').replace(/([一二三四五六七八九十]+、)/g,'\n$1');
  for(const part of value.split('\n'))if(part)lines.push({text:part,index});
 });
 const buckets=Array.from({length:14},()=>[]),indices=new Set(),sections=[],stack=[],paragraphBuckets=Array(raw.length).fill(-1);
 let frontMatter=false;
 let buffer=[],active=-1;
 const flush=()=>{
  if(active>=0&&buffer.length){
   const texts=isPDF?[buffer.map(x=>x.text).join('').replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,'')]:buffer.map(x=>x.text);
   buckets[active].push(...texts.filter(Boolean));buffer.forEach(x=>indices.add(x.index));
  }buffer=[];
 };
 for(const line of lines){
  if(/^目\s*录$/.test(line.text)||appendix(line.text)||/^附[表图][:：]/.test(line.text)){
   flush();frontMatter=true;active=-1;stack.length=0;continue;
  }
  if(/表\s*\d+(?:[.－-]\d+)*\s*$/.test(line.text)){paragraphBuckets[line.index]=active;continue;}
  if(tocEntry(line.text)&&line.text.length<100)continue;
  const h=heading(line.text,source.blocks?.paragraphMeta?.[line.index]);
  if(frontMatter){
   const explicit=Number.isInteger(source.blocks?.paragraphMeta?.[line.index]?.headingLevel);
   if(!h||(!explicit&&!/^\d+(?:[.．]\d+)*\s*[^\d]/.test(line.text))||/[张份]$/.test(line.text))continue;
   frontMatter=false;
  }
  if(h){
   flush();while(stack.length&&stack.at(-1).level>=h.level)stack.pop();
   const parent=stack.at(-1);
   // Unknown subordinate headings (e.g. a stratum's geological age) keep their parent.
   const umbrella=/工程地质.*(?:条件|水文)|岩土工程条件|岩土工程.*分析|结论|^建议$|基坑工程|桩基础$/.test(h.title);
   active=h.excluded||parent?.blocked||umbrella?-1:h.bucket>=0?h.bucket:(parent&&[1,2,8,10,11].includes(parent.active)?parent.active:-1);
   stack.push({...h,active,blocked:parent?.blocked||/勘察.*(?:目的|任务|要求|依据|方法)|技术标准|执行规范/.test(h.title)});sections.push({...h,active,index:line.index});paragraphBuckets[line.index]=active;continue;
  }
  paragraphBuckets[line.index]=active;
  if(active<0||/[.．…·]{3,}/.test(line.text)||/^(?:图|照片|表)\s*\d/.test(line.text))continue;
  const fragment=source.fragments?.find(f=>f.locator==='提取段落 '+(line.index+1));
  if(fragment?.unit&&unit!=='项目整体'&&fragment.unit!==unit)continue;
  if((active===1||active===8)&&/^[（(]\d+[）)]层|^[①②③④⑤⑥⑦⑧⑨]/.test(line.text))flush();
  buffer.push(line);
 }
 flush();
 if(!sections.some(s=>s.active>=0))return null;
 const evidence=[...indices].map(i=>source.fragments?.find(f=>f.locator==='提取段落 '+(i+1))||{id:'SECTION-P'+(i+1),text:raw[i],locator:'提取段落 '+(i+1)});
 return {buckets,evidence,sections,paragraphBuckets};
}
