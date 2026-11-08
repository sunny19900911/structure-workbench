// Merge after WORD_COMMAND_ARGUMENTS in the shared MCP registry during integration.
const string={type:'string',minLength:1,maxLength:20000};
const targetText={...string,description:'当前段落或单元格中的唯一原文'};
const sectionId={type:'string',minLength:1,maxLength:100};
const mm=(maximum=100)=>({type:'number',minimum:0,maximum});
const shape=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
export const EXTENDED_COMMAND_ARGUMENTS={};
for(const name of ['insert.pageBreak','insert.lineBreak','insert.rule','link.remove','review.accept','review.reject','format.clear','format.grow','format.shrink','format.superscript','format.subscript','table.split','table.header','table.delete'])EXTENDED_COMMAND_ARGUMENTS[name]=shape({targetText},['targetText']);
// mergeCells needs an explicit browser cell selection; do not expose an ambiguous text-only MCP target.
for(const name of ['toc.insert','toc.update','review.acceptAll','review.rejectAll'])EXTENDED_COMMAND_ARGUMENTS[name]=shape();
EXTENDED_COMMAND_ARGUMENTS['page.setup']=shape({sectionId,paper:{enum:['A3','A4','Letter']},orientation:{enum:['portrait','landscape']}},['sectionId','paper','orientation']);
EXTENDED_COMMAND_ARGUMENTS['page.margins']=shape({sectionId,top:mm(),bottom:mm(),left:mm(),right:mm()},['sectionId','top','bottom','left','right']);
EXTENDED_COMMAND_ARGUMENTS['page.columns']=shape({sectionId,count:{type:'integer',minimum:1,maximum:3},gap:mm(30)},['sectionId','count','gap']);
EXTENDED_COMMAND_ARGUMENTS['page.headerDistance']=shape({sectionId,header:mm(50),footer:mm(50)},['sectionId','header','footer']);
EXTENDED_COMMAND_ARGUMENTS['link.set']=shape({targetText,url:{type:'string',maxLength:2048,pattern:'^(https?://|mailto:)'}},['targetText','url']);
EXTENDED_COMMAND_ARGUMENTS['note.insert']=shape({targetText,type:{const:'footnote'},content:{...string,maxLength:5000}},['targetText','type','content']);
EXTENDED_COMMAND_ARGUMENTS['comment.add']=shape({targetText,content:{...string,maxLength:5000}},['targetText','content']);
EXTENDED_COMMAND_ARGUMENTS['review.replace']=shape({targetText,text:string},['targetText','text']);
EXTENDED_COMMAND_ARGUMENTS['table.background']=shape({targetText,color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}},['targetText','color']);
EXTENDED_COMMAND_ARGUMENTS['text.replaceAll']=shape({search:string,text:{type:'string',maxLength:20000}},['search','text']);
