import {bridgeError,validateProtectedRewrite} from './mcp-browser-core.js';

// Offsets always refer to the untouched source string, including CRLF separators.
function headings(text){
 const result=[];
 const pattern=/^([ \t]*(?:#{1,6}[ \t]+)?)(\d+(?:\.\d+)+)[ \t]+([^\r\n]+)(?:\r?\n|$)/gm;
 for(const match of text.matchAll(pattern))result.push({id:match[2],title:match[2]+' '+match[3].trim(),depth:match[2].split('.').length,start:match.index,bodyStart:match.index+match[0].length,heading:match[0]});
 return result;
}
function ranges(text){
 const items=headings(text);
 if(!items.length)return [{id:'body',title:'正文',start:0,end:text.length,depth:0}];
 const result=items[0].start>0?[{id:'intro',title:'章首正文',start:0,end:items[0].start,depth:0}]:[];
 for(let i=0;i<items.length;i++){
  const item=items[i],next=items.slice(i+1).find(x=>x.depth<=item.depth);
  result.push({...item,start:item.bodyStart,end:next?.start??text.length});
 }
 return result;
}
export function subsectionOutline(text){
 const items=ranges(text),counts=new Map();
 for(const item of items)counts.set(item.id,(counts.get(item.id)||0)+1);
 return items.map(({id,title,depth,start,end})=>({id,title,depth,characters:end-start,ambiguous:counts.get(id)>1}));
}
function target(text,id){
 const matches=ranges(text).filter(x=>x.id===id);
 if(matches.length!==1)throw bridgeError(matches.length?'小节编号重复，请先整理章节编号':'未找到小节，请重新读取目录','SUBSECTION_TARGET');
 return matches[0];
}
export function readSubsection(text,id){
 const item=target(text,id);
 return {subsectionId:id,title:item.title,text:text.slice(item.start,item.end)};
}
export function replaceSubsection(original,{subsectionId,expectedText,text}){
 const item=target(original,subsectionId),old=original.slice(item.start,item.end);
 if(old!==expectedText)throw bridgeError('小节已变化，请重新读取再修改','TEXT_CONFLICT',409);
 // Structural markers are a multiset: retaining one duplicate is not enough.
 const markers=s=>(s.match(/\{\{[pfmrt]:[^{}]+\}\}|\[\[(?:table|image|measures):[^\]]+\]\]/g)||[]).sort();
 if(JSON.stringify(markers(old))!==JSON.stringify(markers(text)))throw bridgeError('小节改写须保留原有参数引用及图表标记','PROTECTED_REFERENCE');
 validateProtectedRewrite(old,text);
 if(JSON.stringify(headings(old).map(x=>x.heading))!==JSON.stringify(headings(text).map(x=>x.heading)))throw bridgeError('小节改写不能增删或改名下级标题','SUBSECTION_STRUCTURE');
 // Keep the original boundary separator so a following heading cannot join prose.
 const suffix=old.match(/(?:\r?\n)+$/)?.[0]||'';
 let replacement=suffix?text.replace(/(?:\r?\n)+$/,'')+suffix:text;
 if(replacement&&item.end<original.length&&!replacement.endsWith('\n'))replacement+=original.includes('\r\n')?'\r\n':'\n';
 let prefix=original.slice(0,item.start);
 if(replacement&&item.heading&&!prefix.endsWith('\n'))prefix+=original.includes('\r\n')?'\r\n':'\n';
 return prefix+replacement+original.slice(item.end);
}
