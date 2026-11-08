import {bridgeError,validateProtectedRewrite} from './mcp-browser-core.js';
const paragraphs=document=>[...document.querySelectorAll('#paper1 p.ce[contenteditable]')];
function markedText(node){const copy=node.cloneNode(true);for(const span of copy.querySelectorAll('[data-p]'))span.replaceWith(copy.ownerDocument.createTextNode('{{p:'+span.getAttribute('data-p')+'}}'));return copy.textContent.trim();}
export function measureTextBlocks(document){return paragraphs(document).map((node,index)=>({id:'paragraph:'+index,text:markedText(node)}));}
export function editMeasureText(document,legacy,projects,{id,expectedText,text}){
 if(!legacy.canEditMeasures())throw bridgeError('统一措施当前只读或已签发','READ_ONLY',409);
 const match=/^paragraph:(\d+)$/.exec(id),node=match&&paragraphs(document)[Number(match[1])];if(!node)throw bridgeError('措施段落不存在，请重新读取');
 const original=markedText(node);if(original!==expectedText)throw bridgeError('措施段落已有修改，请重新读取','TEXT_CONFLICT',409);validateProtectedRewrite(original,text);
 const references=new Map([...node.querySelectorAll('[data-p]')].map(span=>[span.getAttribute('data-p'),span])),params=legacy.params(),parts=String(text).split(/(\{\{p:[^{}]+\}\})/g),nodes=[];
 for(const part of parts){const token=/^\{\{p:([^{}]+)\}\}$/.exec(part);if(!token){nodes.push(document.createTextNode(part));continue;}const key=token[1];if(!Object.hasOwn(params,key))throw bridgeError('未知统一措施参数：'+key);const span=references.get(key)?.cloneNode(false)||document.createElement('span');span.setAttribute('data-p',key);span.textContent=String(params[key]??'');nodes.push(span);}
 node.replaceChildren(...nodes);node.style.whiteSpace='pre-wrap';projects.contentChanged('MCP编辑统一措施正文');return {id,text:markedText(node)};
}
