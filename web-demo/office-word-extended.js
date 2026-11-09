// Native document operations; page dimensions are converted from mm to API inches.
export const EXTENDED_COMMANDS=['text.insert','page.setup','page.margins','page.columns','page.headerDistance','insert.pageBreak','insert.lineBreak','insert.rule','link.set','link.remove','toc.insert','toc.update','note.insert','review.accept','review.reject','review.acceptAll','review.rejectAll','review.replace','format.clear','format.grow','format.shrink','table.merge','table.split','table.header','table.background','table.delete','text.replaceAll','format.superscript','format.subscript','comment.add'];
const simple={'insert.pageBreak':'insertPageBreak','insert.lineBreak':'insertLineBreak','insert.rule':'insertHorizontalRule','link.remove':'unsetLink','review.accept':'acceptTrackedChangeBySelection','review.reject':'rejectTrackedChangeOnSelection','review.acceptAll':'acceptAllTrackedChanges','review.rejectAll':'rejectAllTrackedChanges','table.merge':'mergeCells','table.split':'splitCell','table.header':'toggleHeaderRow','table.delete':'deleteTable'};
function number(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+'超出允许范围');return v;}
function text(v,label,max=20000){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('请输入有效的'+label);return v;}
export function checked(result){if(result===false||result?.success===false)throw Error(result?.failure?.message||'当前位置无法执行此操作');return result;}
export function sections(e){return e.doc.sections.list({limit:100}).items;}
export function searchText(e,query){
 if(typeof query!=='string'||!query||query.length>20000||/[\r\n]/.test(query))return [];
 const found=[];
 e.state.doc.descendants((node,pos)=>{if(!node.isTextblock)return;let body='',positions=[];node.descendants((child,offset)=>{if(child.isText){for(let i=0;i<child.text.length;i++){body+=child.text[i];positions.push(pos+1+offset+i);}}else if(child.isLeaf){body+='\ufffc';positions.push(pos+1+offset);}});let index=0;while((index=body.indexOf(query,index))>=0){found.push({from:positions[index],to:positions[index+query.length-1]+1,text:body.slice(Math.max(0,index-16),index+query.length+30)});index+=query.length;}return false;});
 return found;
}
export function outline(e){const result=[];e.state.doc.descendants((node,pos)=>{if(!node.isTextblock)return;const style=node.attrs.paragraphProperties?.styleId||node.attrs.styleId||'',match=/Heading([1-9])|标题\s*([1-9])/i.exec(style);if(match||node.type.name==='heading')result.push({position:pos+1,level:Number(match?.[1]||match?.[2]||node.attrs.level||1),text:node.textContent});return false;});return result;}
export function runExtended(e,name,args={}){
 if(name==='text.insert'){
  const value=text(args.text,'插入文字');
  if(/\{\{|\[\[/.test(value))throw Error('请选择已有参数值');
  const tr=e.state.tr;
  e.view.dispatch(args.targetText?tr.insertText(value,e.state.selection.to,e.state.selection.to):tr.insertText(value));e.view.focus();return true;
 }
 if(simple[name])return checked(e.commands[simple[name]]());
 if(name.startsWith('page.')){
  const items=sections(e);const section=items.find(s=>s.address.sectionId===args.sectionId);
  if(!section)throw Error('请重新选择要设置的文档节');const target=section.address;
  if(name==='page.setup'){
   const sizes={A4:[210,297],A3:[297,420],Letter:[215.9,279.4]};
   if(!['portrait','landscape'].includes(args.orientation)||!sizes[args.paper])throw Error('纸张或页面方向无效');
   const [w,h]=sizes[args.paper];return checked(e.doc.sections.setPageSetup({target,width:w/25.4,height:h/25.4,orientation:args.orientation}));
  }
  if(name==='page.margins'){const values={};for(const key of ['top','bottom','left','right'])values[key]=number(args[key],0,100,'页边距')/25.4;
   const width=(section.pageSetup?.width||8.27),height=(section.pageSetup?.height||11.69);if(values.left+values.right>=width-.4||values.top+values.bottom>=height-.4)throw Error('页边距之和过大，没有足够的正文区域');
   return checked(e.doc.sections.setPageMargins({target,...values}));}
  if(name==='page.columns'){number(args.count,1,3,'栏数');if(!Number.isInteger(args.count))throw Error('栏数必须为整数');return checked(e.doc.sections.setColumns({target,count:args.count,gap:number(args.gap,0,30,'栏间距')/25.4,equalWidth:true}));}
  if(name==='page.headerDistance')return checked(e.doc.sections.setHeaderFooterMargins({target,header:number(args.header,0,50,'页眉距离')/25.4,footer:number(args.footer,0,50,'页脚距离')/25.4}));
 }
 if(name==='link.set'){const url=text(args.url,'链接',2048);if(!/^(https?:\/\/|mailto:)/i.test(url))throw Error('链接仅支持 http、https 或 mailto');return checked(e.commands.setLink({href:url,...(e.state.selection.empty?{text:url}:{})}));}
 if(name==='toc.insert')return checked(e.doc.create.tableOfContents({at:{kind:'documentStart'},config:{outlineLevels:{from:1,to:3},hyperlinks:true,includePageNumbers:false,tabLeader:'none'}}));
 if(name==='toc.update'){const list=e.doc.toc.list({limit:100}).items;if(!list.length)throw Error('文档中还没有目录');return list.map(item=>checked(e.doc.toc.update({target:item.address,mode:'all'})));}
 if(name==='note.insert'){if(args.type!=='footnote')throw Error('当前内核尚不能可靠保存尾注，请使用脚注');const content=text(args.content,'注释内容',5000),pos=e.state.selection.to;e.commands.setTextSelection({from:pos,to:pos});return checked(e.doc.footnotes.insert({type:args.type,content}));}
 if(name==='comment.add'){if(e.state.selection.empty)throw Error('请先选中需要批注的文字');const content=text(args.content,'批注',5000).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));return checked(e.commands.addComment({content,author:'本机编辑者'}));}
 if(name==='format.superscript'||name==='format.subscript'){const value=name.split('.')[1],current=e.getAttributes('textStyle');return checked(e.commands.setMark('textStyle',{...current,vertAlign:current.vertAlign===value?'baseline':value,position:'0pt'}));}
 if(name==='review.replace'){if(e.state.selection.empty)throw Error('请先选中要修订的文字');return checked(e.commands.insertTrackedChange({text:text(args.text,'修订文字'),user:{name:'本机编辑者'},emitCommentEvent:false}));}
 if(name==='format.clear'){
  // Preserve structural/comment/link marks and linked paragraph styles.
  const {from,to}=e.state.selection;let tr=e.state.tr;for(const key of ['bold','italic','underline','strike','textStyle','highlight','fontFamily','fontSize','color']){const mark=e.schema.marks[key];if(mark)tr=tr.removeMark(from,to,mark);}e.view.dispatch(tr);return true;
 }
 if(name==='format.grow'||name==='format.shrink'){const size=parseFloat(e.getAttributes('textStyle').fontSize||e.getAttributes('fontSize').fontSize||12);return checked(e.commands.setFontSize(Math.max(6,Math.min(96,size+(name==='format.grow'?1:-1)))));}
 if(name==='table.background'){if(!/^#[0-9a-f]{6}$/i.test(args.color||''))throw Error('颜色无效');return checked(e.commands.setCellAttr('background',{color:args.color.slice(1)}));}
 if(name==='text.replaceAll'){
  text(args.search,'查找文字');if(typeof args.text!=='string'||args.text.length>20000||/[\r\n]/.test(args.text))throw Error('替换文字须为单段');
  if(/\{\{|\[\[/.test(args.search+args.text))throw Error('联动标记不能在此批量替换');
  const matches=searchText(e,args.search);if(!matches.length)throw Error('没有找到匹配文字');if(matches.length>2000)throw Error('匹配过多，请缩小查找范围');
  let tr=e.state.tr;for(const match of matches.reverse())tr=tr.insertText(args.text,match.from,match.to);e.view.dispatch(tr);return {replacements:matches.length};
 }
 throw Error('未支持的扩展命令');
}
