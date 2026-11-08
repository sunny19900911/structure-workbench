import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {EXCEL_COMMAND_SCHEMAS,EXCEL_COMMANDS} from '../../../office-excel-commands.js';
import {BROWSER_OPERATIONS,OFFICE_COMMAND_ARGUMENTS} from '../../../mcp-browser-operations.js';

test('proposed MCP schema wiring preserves Word/PPT and validates every Excel command',async()=>{
 const {default:Ajv}=await import(process.env.WORKBENCH_AJV_ENTRY?pathToFileURL(process.env.WORKBENCH_AJV_ENTRY).href:'ajv');
 const schema=structuredClone(BROWSER_OPERATIONS.find(x=>x.name==='office.command').schema);
 const combined={...OFFICE_COMMAND_ARGUMENTS,...EXCEL_COMMAND_SCHEMAS};schema.properties.name.enum=Object.keys(combined);
 schema.allOf=Object.entries(combined).map(([name,args])=>({if:{properties:{name:{const:name}}},then:{properties:{args}}}));
 const validate=new Ajv({strict:false}).compile(schema);
 const cases={
  'cell.set':{sheet:'荷载',address:'B2',expectedText:'3.5',text:'4'},'cells.set':{sheet:'荷载',cells:[{address:'B2',expectedText:'3.5',text:'4'}]},
  'range.set':{sheet:'荷载',address:'A1',values:[['5','=SUM(A1:A2)']]},'range.copy':{sheet:'荷载',range:'A1:B2',address:'A4'},
  'range.clear':{sheet:'荷载',range:'A1:B2'},'range.format':{sheet:'荷载',range:'A1:B2',format:'decimal'},
  ...Object.fromEntries(['row.insert','row.delete','column.insert','column.delete'].map(n=>[n,{sheet:'荷载',index:2}])),
  'sheet.add':{name:'材料'},'sheet.rename':{sheet:'材料',name:'统计'},'sheet.delete':{sheet:'统计'},'sheet.select':{sheet:'荷载'},'selection.set':{sheet:'荷载',range:'A1:B2'},
  'selection.copy':{},'workbook.recalculate':{},'history.undo':{},'history.redo':{}
  ,'range.replace':{sheet:'荷载',range:'A1:B2',find:'旧',replacement:''},
  'range.style':{sheet:'荷载',range:'A1:B2',style:{font:'微软雅黑',fontSize:12,bold:true,italic:true,underline:false,strike:false,fontColor:'#123456',fillColor:'#abcdef',horizontal:'center',vertical:'top',wrapText:true,rotation:-45,border:'outside'}},
  ...Object.fromEntries(['range.clearStyle','range.merge','range.unmerge','range.clearConditional'].map(name=>[name,{sheet:'荷载',range:'A1:B2'}])),
  'range.copyStyle':{sheet:'荷载',source:'A1',range:'B1:C2'},'range.tableStyle':{sheet:'荷载',range:'A1:B2',theme:'blue'},
  'range.conditional':{sheet:'荷载',range:'A1:B2',operator:'between',value:1,value2:10,color:'#AABBCC'},
  'range.sort':{sheet:'荷载',range:'A1:B2',column:2,direction:'desc',header:true},
  'sheet.filter':{sheet:'荷载',range:'A1:B2',column:2,operator:'contains',value:'教室'},'sheet.clearFilter':{sheet:'荷载'},
  'sheet.freeze':{sheet:'荷载',rows:1,columns:1},'sheet.protect':{sheet:'荷载',enabled:true},
  'row.height':{sheet:'荷载',index:1,count:2,height:25},'column.width':{sheet:'荷载',index:2,count:1,width:18},
  'selection.aggregate':{function:'SUM'},'selection.formula':{formula:'=SUM(A1:A3)'},'selection.formatPainter':{},
  'sheet.find':{sheet:'荷载',text:'教室',after:'A1'},'view.options':{showFormulas:true,gridlines:false,showZeros:true,highlight:false,dark:false,zoom:125},'sheet.print':{sheet:'荷载'}
 };
 assert.deepEqual(Object.keys(cases).sort(),[...EXCEL_COMMANDS].sort());
 for(const [name,args] of Object.entries(cases))assert.ok(validate({documentId:'e'.repeat(32),expectedRevision:1,name,args}),name+JSON.stringify(validate.errors));
 assert.ok(validate({documentId:'e'.repeat(32),expectedRevision:1,name:'text.replace',args:{expectedText:'原稿',text:'新稿'}}));
 assert.ok(validate({documentId:'e'.repeat(32),expectedRevision:1,name:'shape.move',args:{slide:1,shapeId:'1',expectedX:0,expectedY:0,x:10,y:10}}));
 assert.equal(validate({documentId:'e'.repeat(32),expectedRevision:1,name:'cell.set',args:{sheet:'荷载',address:'B2',text:'4'}}),false);
 assert.equal(validate({documentId:'e'.repeat(32),expectedRevision:1,name:'row.delete',args:{sheet:'荷载',index:0}}),false);
 assert.equal(validate({documentId:'e'.repeat(32),expectedRevision:1,name:'range.set',args:{sheet:'荷载',address:'A1',values:[[1]]}}),false);
 for(const [name,args] of Object.entries(cases)){
  assert.equal(validate({documentId:'e'.repeat(32),expectedRevision:1,name,args:{...args,unexpected:true}}),false,`${name} rejects undeclared arguments`);
  for(const key of EXCEL_COMMAND_SCHEMAS[name].required){
   const incomplete={...args};delete incomplete[key];
   assert.equal(validate({documentId:'e'.repeat(32),expectedRevision:1,name,args:incomplete}),false,`${name} requires ${key}`);
  }
 }
 const invalid=[
  ['range.style',{...cases['range.style'],style:{bold:'true'}}],['range.style',{...cases['range.style'],style:{fontColor:'red'}}],
  ['range.style',{...cases['range.style'],style:{font:'a\nb'}}],['range.style',{...cases['range.style'],style:{rotation:91}}],
  ['range.style',{...cases['range.style'],style:{fontSize:5}}],['range.style',{...cases['range.style'],style:{border:'diagonal'}}],['range.style',{...cases['range.style'],style:{}}],
  ['range.copyStyle',{...cases['range.copyStyle'],source:'A1:B1'}],['range.tableStyle',{...cases['range.tableStyle'],theme:'red'}],
  ['range.conditional',{sheet:'荷载',range:'A1:B2',operator:'between',value:1,color:'#AABBCC'}],
  ['range.conditional',{...cases['range.conditional'],value:'3'}],['range.replace',{...cases['range.replace'],find:''}],
  ['range.sort',{...cases['range.sort'],header:'true'}],['range.sort',{...cases['range.sort'],column:16385}],
  ['sheet.filter',{...cases['sheet.filter'],operator:'regex'}],['sheet.filter',{...cases['sheet.filter'],value:1}],
  ['sheet.freeze',{sheet:'荷载',rows:-1}],['sheet.freeze',{sheet:'荷载',columns:16384}],['sheet.protect',{sheet:'荷载',enabled:1}],
  ['row.height',{...cases['row.height'],height:410}],['column.width',{...cases['column.width'],width:256}],
  ['column.insert',{sheet:'荷载',index:16385}],['selection.aggregate',{function:'MEDIAN'}],['selection.formula',{formula:''}],
  ['sheet.find',{sheet:'荷载',text:'查找',after:'bad'}],['view.options',{zoom:80}],['view.options',{gridlines:1}]
 ];
 for(const [name,args] of invalid)assert.equal(validate({documentId:'e'.repeat(32),expectedRevision:1,name,args}),false,`${name} ${JSON.stringify(args)}`);
 for(const [name,args] of [['sheet.freeze',{sheet:'荷载'}],['view.options',{}],['sheet.find',{sheet:'荷载',text:'教室'}],['range.sort',{sheet:'荷载',range:'A1:B2',column:2}],['range.conditional',{sheet:'荷载',range:'A1:B2',operator:'equal',value:1,color:'#FFFFFF'}]]){
  assert.ok(validate({documentId:'e'.repeat(32),expectedRevision:1,name,args}),`${name} optional defaults`);
 }
});
