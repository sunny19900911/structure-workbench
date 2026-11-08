// SuperDoc 1.47.2 commands shared by the toolbar and office.command.
export const WORD_COMMANDS = {
 'format.bold':['toggleBold'], 'format.italic':['toggleItalic'], 'format.underline':['toggleUnderline'], 'format.strike':['toggleStrike'],
 'paragraph.left':['setTextAlign','left'], 'paragraph.center':['setTextAlign','center'],
 'paragraph.right':['setTextAlign','right'], 'paragraph.justify':['setTextAlign','justify'],
 'list.bullet':['toggleBulletList'], 'list.number':['toggleOrderedList'],
 'list.indent':['increaseListIndent'], 'list.outdent':['decreaseListIndent'],
 'table.addRow':['addRowAfter'], 'table.addRowBefore':['addRowBefore'], 'table.deleteRow':['deleteRow'],
 'table.addColumn':['addColumnAfter'], 'table.addColumnBefore':['addColumnBefore'], 'table.deleteColumn':['deleteColumn'],
 'history.undo':['undo'], 'history.redo':['redo']
};
export const WORD_COMMAND_NAMES = [...Object.keys(WORD_COMMANDS),'text.replace','format.font','format.size','format.color','format.highlight','paragraph.style','paragraph.spacing','table.insert','image.insert'];

export function spacingAttributes(args) {
 const attributes={};
 for(const field of ['before','after','line']) {
  if(args[field]===undefined)continue;
  const value=args[field],min=field==='line'?1:0,max=field==='line'?3:72;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(field==='line'?'行距应在 1–3 倍之间':'段前、段后应在 0–72 磅之间');
  attributes['paragraphProperties.spacing.'+field]=Math.round(value*(field==='line'?240:20));
  if(field==='line')attributes['paragraphProperties.spacing.lineRule']='auto';
  else attributes['paragraphProperties.spacing.'+field+'Autospacing']=false;
 }
 if(!Object.keys(attributes).length)throw Error('请指定段前、段后或行距');
 return attributes;
}

export function runWordCommand(editor,name,args={}) {
 if(name==='format.color'||name==='format.highlight'){
  if(typeof args.color!=='string'||!/^#[0-9a-f]{6}$/i.test(args.color))throw Error('请使用六位十六进制颜色');
  return editor.commands[name==='format.color'?'setColor':'setHighlight'](args.color);
 }
 if(name==='paragraph.style'){
  if(typeof args.style!=='string'||!editor.helpers?.linkedStyles?.getStyleById?.(args.style))throw Error('当前文档中没有此样式，请先读取可用样式');
  return editor.commands.setStyleById(args.style);
 }
 if(name==='paragraph.spacing')return editor.commands.updateAttributes('paragraph',spacingAttributes(args));
 const command=WORD_COMMANDS[name];
 if(!command||typeof editor.commands[command[0]]!=='function')throw Error('当前内核不支持此文档命令');
 return editor.commands[command[0]](...command.slice(1));
}

// Merge into OFFICE_COMMAND_ARGUMENTS before officeCommandSchema is constructed.
const targetText={type:'string',minLength:1,maxLength:20000,description:'当前段落或表格单元格中的唯一原文'};
const target={type:'object',properties:{targetText},required:['targetText'],additionalProperties:false};
export const WORD_COMMAND_ARGUMENTS=Object.fromEntries([
 'format.strike','paragraph.right','list.bullet','list.number','list.indent','list.outdent',
 'table.addRowBefore','table.addColumn','table.addColumnBefore','table.deleteColumn'
].map(name=>[name,target]));
WORD_COMMAND_ARGUMENTS['paragraph.spacing']={
 type:'object',properties:{targetText,before:{type:'number',minimum:0,maximum:72,description:'段前，磅'},after:{type:'number',minimum:0,maximum:72,description:'段后，磅'},line:{type:'number',minimum:1,maximum:3,description:'行距倍数'}},
 required:['targetText'],additionalProperties:false,anyOf:[{required:['before']},{required:['after']},{required:['line']}]
};
WORD_COMMAND_ARGUMENTS['paragraph.style']={type:'object',properties:{targetText,style:{type:'string',minLength:1,maxLength:100,description:'office.read 返回的 styles 中的样式 ID'}},required:['targetText','style'],additionalProperties:false};
for(const name of ['format.color','format.highlight'])WORD_COMMAND_ARGUMENTS[name]={type:'object',properties:{targetText,color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}},required:['targetText','color'],additionalProperties:false};
