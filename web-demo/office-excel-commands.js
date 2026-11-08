// Merge into office.command's existing conditional schema; never replace Word/PPT rules.
const text={type:'string',maxLength:32767},sheet={type:'string',minLength:1,maxLength:31};
const address={type:'string',pattern:'^[A-Z]{1,3}[1-9][0-9]{0,6}$'};
const range={type:'string',pattern:'^[A-Z]{1,3}[1-9][0-9]{0,6}(:[A-Z]{1,3}[1-9][0-9]{0,6})?$'};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const boolean={type:'boolean'},color={type:'string',pattern:'^#[0-9a-fA-F]{6}$'};
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const style=object({font:{type:'string',minLength:1,maxLength:80,pattern:'^[^\\u0000-\\u001f]+$'},fontSize:{type:'number',minimum:6,maximum:96},bold:boolean,italic:boolean,underline:boolean,strike:boolean,fontColor:color,fillColor:color,horizontal:{enum:['left','center','right','general']},vertical:{enum:['top','center','bottom']},wrapText:boolean,rotation:integer(-90,90),border:{enum:['all','outside','none']}},[]);
export const EXCEL_COMMAND_SCHEMAS={
 'cell.set':object({sheet,address,expectedText:text,text}),
 'cells.set':object({sheet,cells:{type:'array',minItems:1,maxItems:10000,items:object({address,expectedText:text,text})}}),
 'range.set':object({sheet,address,values:{type:'array',minItems:1,maxItems:10000,items:{type:'array',minItems:1,maxItems:10000,items:text}}}),
 'range.clear':object({sheet,range}),
 'range.format':object({sheet,range,format:{enum:['general','integer','decimal','thousands','percent','scientific','date','text']}}),
 'range.copy':object({sheet,range,targetSheet:sheet,address},['sheet','range','address']),
 'range.replace':object({sheet,range,find:{...text,minLength:1},replacement:text}),
 'range.style':object({sheet,range,style:{...style,minProperties:1}}),
 ...Object.fromEntries(['range.clearStyle','range.merge','range.unmerge','range.clearConditional'].map(name=>[name,object({sheet,range})])),
 'range.copyStyle':object({sheet,source:address,range}),
 'range.tableStyle':object({sheet,range,theme:{enum:['blue','green','gray']}}),
 'range.conditional':{...object({sheet,range,operator:{enum:['greaterThan','lessThan','equal','between']},value:{type:'number'},value2:{type:'number'},color},['sheet','range','operator','value','color']),allOf:[{if:{properties:{operator:{const:'between'}}},then:{required:['value2']}}]},
 'range.sort':object({sheet,range,column:integer(1,16384),direction:{enum:['asc','desc']},header:boolean},['sheet','range','column']),
 'sheet.filter':object({sheet,range,column:integer(1,16384),operator:{enum:['contains','equal','greaterThan','lessThan']},value:{type:'string',maxLength:1000}}),
 'sheet.clearFilter':object({sheet}),
 'sheet.freeze':object({sheet,rows:integer(0,1048575),columns:integer(0,16383)},['sheet']),
 'sheet.protect':object({sheet,enabled:boolean}),
 'row.height':object({sheet,index:integer(1,1048576),count:integer(1,10000),height:{type:'number',minimum:1,maximum:409}},['sheet','index','height']),
 'column.width':object({sheet,index:integer(1,16384),count:integer(1,16384),width:{type:'number',minimum:1,maximum:255}},['sheet','index','width']),
 ...Object.fromEntries(['row.insert','row.delete','column.insert','column.delete'].map(name=>[name,object({sheet,index:integer(1,name.startsWith('column.')?16384:1048576),count:integer(1,1000)},['sheet','index'])])),
 'sheet.add':object({name:sheet}), 'sheet.rename':object({sheet,name:sheet}), 'sheet.delete':object({sheet}),
 'workbook.recalculate':object({}), 'sheet.select':object({sheet}), 'selection.set':object({sheet,range}),
 'selection.copy':object({}), 'history.undo':object({}), 'history.redo':object({}),
 'selection.aggregate':object({function:{enum:['SUM','AVERAGE','MIN','MAX','COUNT']}}),
 'selection.formula':object({formula:{...text,minLength:1}}),
 'selection.formatPainter':object({}),
 'sheet.find':object({sheet,text:{...text,minLength:1},after:address},['sheet','text']),
 'view.options':object({showFormulas:boolean,gridlines:boolean,showZeros:boolean,highlight:boolean,dark:boolean,zoom:{enum:[50,75,90,100,110,125,150,200]}},[]),
 'sheet.print':object({sheet})
};
export const EXCEL_COMMANDS=Object.keys(EXCEL_COMMAND_SCHEMAS);
