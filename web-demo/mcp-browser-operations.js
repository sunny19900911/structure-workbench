import {WORD_COMMAND_ARGUMENTS} from './office-word-commands.js';
import {EXTENDED_COMMAND_ARGUMENTS} from './office-word-extended-schema.js';
import {EXCEL_COMMAND_SCHEMAS} from './office-excel-commands.js';
import {PPT_COMMAND_ARGUMENTS} from './office-ppt-commands.js';
// Shared catalogue: executable business operations, never arbitrary JavaScript.
const text=(description,maxLength=20000)=>({type:'string',description,maxLength});
const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const dictionary=(description)=>({type:'object',description,additionalProperties:{type:['string','number','boolean']}});
const file=object({name:text('原始文件名',240),base64:text('文件内容 Base64；单份最多30MB',42000000)},['name','base64']);
const op=(name,description,readOnly,requiredParts,schema)=>({name,description,readOnly,requiredParts,schema,requiresUnit:/^(seismic\.|expansion\.|ppt\.|steel\.|regulations\.|document\.|intake\.|office\.)/.test(name)});
const documentId={type:'string',pattern:'^[a-f0-9]{32}$',description:'office.list或office.generate返回的当前项目文档ID'};
const fileRevision={type:'integer',minimum:1,description:'office.read返回的document.fileRevision，与项目分区修订分别校验'};
const slide={type:'integer',minimum:1,maximum:1000,description:'从office.read读取的幻灯片页码，从1开始'};
const shapeId=text('office.read返回的形状ID',100);
const targetText={...text('当前文档中唯一的原文字片段，用于明确选区或定位表格',20000),minLength:1};
export const OFFICE_COMMAND_ARGUMENTS={
 'text.replace':object({expectedText:text('文档中唯一的原文字片段，同一段内',20000),text:text('替换后的文字',20000)},['expectedText','text']),
 'cell.set':object({sheet:text('原工作表名称',200),address:text('单元格地址，例如B2',30),expectedText:text('读取时单元格原内容',20000),text:text('单元格新内容',20000)},['sheet','address','expectedText','text']),
 'shape.text':object({slide,shapeId,expectedText:text('形状原文字',20000),text:text('形状新文字',20000)},['slide','shapeId','expectedText','text']),
 'shape.move':object({slide,shapeId,x:{type:'number'},y:{type:'number'},expectedX:{type:'number'},expectedY:{type:'number'}},['slide','shapeId','x','y','expectedX','expectedY']),
 'format.bold':object({targetText},['targetText']),
 'format.italic':object({targetText},['targetText']),
 'format.underline':object({targetText},['targetText']),
 'format.font':object({targetText,font:text('字体名称',80)},['targetText','font']),
 'format.size':object({targetText,size:{type:'number',minimum:6,maximum:96}},['targetText','size']),
 'paragraph.left':object({targetText},['targetText']),
 'paragraph.center':object({targetText},['targetText']),
 'paragraph.justify':object({targetText},['targetText']),
 'table.insert':object({targetText,rows:{type:'integer',minimum:1,maximum:50},columns:{type:'integer',minimum:1,maximum:20}},['targetText','rows','columns']),
 'table.addRow':object({targetText},['targetText']),
 'table.deleteRow':object({targetText},['targetText']),
 'image.insert':object({targetText,data:text('PNG/JPEG图片data URL，不超过4MB',5700000),alt:text('图片说明',200),width:{type:'number',minimum:40,maximum:500}},['targetText','data']),
 'history.undo':object(),
 'history.redo':object()
};
Object.assign(OFFICE_COMMAND_ARGUMENTS,WORD_COMMAND_ARGUMENTS,EXTENDED_COMMAND_ARGUMENTS,EXCEL_COMMAND_SCHEMAS,PPT_COMMAND_ARGUMENTS);
export const officeCommandType=name=>name.startsWith('history.')?null:Object.hasOwn(EXCEL_COMMAND_SCHEMAS,name)?'xlsx':Object.hasOwn(PPT_COMMAND_ARGUMENTS,name)?'pptx':'docx';
const officeCommandSchema=object({documentId,name:{enum:Object.keys(OFFICE_COMMAND_ARGUMENTS)},expectedRevision:fileRevision,args:{type:'object'}},['documentId','name','expectedRevision','args']);
officeCommandSchema.allOf=Object.entries(OFFICE_COMMAND_ARGUMENTS).map(([name,args])=>({if:{properties:{name:{const:name}}},then:{properties:{args}}}));
export const BROWSER_OPERATIONS=[
 op('parameters.read','读取当前项目统一措施核心采用参数、当前单体已有采用事实、来源及同一荷载/材料表；不把抗震查表输入视为采用参数。',true,[],object()),
 op('project.context','读取当前网页项目、单体、参数、修订与可调用操作。不会把草稿标为已审核。',true,[],object()),
 op('project.create','建立独立空白项目，使用当前默认技术措施，禁止套入示例项目事实。',false,['main','intake','expansion','modules','ppt'],object({name:text('新项目名称',200)},['name'])),
 op('project.open','保存当前草稿后打开另一已存在项目，项目切换复用原业务流程。',false,['main','intake','expansion','modules','ppt'],object({targetProjectId:text('目标项目ID',32)},['targetProjectId'])),
 op('project.select_unit','明确切换当前扩初单体，先保存当前稿；后续单体操作必须显式提交该单体名。',false,['main','intake','expansion','modules','ppt'],object({unit:text('明确的单体名，或项目整体',120)},['unit'])),
 op('project.lifecycle','软删除当前项目或恢复指定项目，保留所有原始资料和修订。confirmed仅在用户明确要求删除或恢复后为true。',false,['main','intake','expansion','modules','ppt'],object({action:{enum:['delete','restore']},targetProjectId:text('恢复项目时必填；删除默认当前项目',32),expectedLifecycleRevision:{type:'integer',minimum:0,description:'目标项目lifecycle分区的已读取修订'},confirmed:{const:true}},['action','confirmed','expectedLifecycleRevision'])),
 op('project.save','保存当前网页的全部模块；遵守各分区修订冲突。',false,['main','intake','expansion','modules','ppt'],object()),
 op('measures.update','合并统一技术措施参数并运行现有联动，保留人工正文。values 只接受已存在参数键。',false,['main','intake','expansion','modules','ppt'],object({values:dictionary('当前项目有依据的参数；禁止填历史项目数值')},['values'])),
 op('measures.read','读取统一措施参数、荷载/材料/耐久性表与材料条款；表行列使用从0开始的数组下标。',true,[],object()),
 op('measures.table','编辑统一措施荷载、构件强度或耐久性表的一个数据格，沿用正文编辑联动到扩初/PPT，保留其他格。',false,['main','intake','expansion','modules','ppt'],object({key:{enum:['concrete','durability','floor','roof','equipment']},row:{type:'integer',minimum:1,maximum:200},column:{type:'integer',minimum:0,maximum:20},expectedText:text('measures.read读取时该格文字',3000),value:text('当前项目有依据的单元格值',3000)},['key','row','column','expectedText','value'])),
 op('measures.text','修改统一措施一个正文段落；提交读取的expectedText并保留{{p:参数}}，只接受纯文字。',false,['main','intake','expansion','modules','ppt'],object({id:text('measures.read的textBlocks段落ID',100),expectedText:text('原段落文字，包含参数标记',10000),text:text('新段落纯文字，保留联动标记',10000)},['id','expectedText','text'])),
 op('document.import','将建筑、地勘或同一单体模型文件交给原有解析和联动流程。yjk必须一次提供同一单体同一计算版本的WMASS、WZQ、WDISP三份OUT，整批替换旧模型，禁止拆成三次调用。原件不修改。',false,['main','intake','expansion','modules','ppt'],object({slot:{enum:['bldg','geo','yjk']},files:{type:'array',items:file,minItems:1,maxItems:12},replaceSource:text('替换的原资料 source_id；留空表示新增',200)},['slot','files'])),
 op('intake.adopt','采用指定已有来源事实，记录来源与采用说明；只操作当前项目中的事实。',false,['main','intake','expansion','modules','ppt'],object({factId:text('已提取事实ID',240),value:text('明确要求更正时填写，省略则沿用原值'),reason:text('可由AI依据用户要求说明采用原因',2000)},['factId'])),
 op('intake.source','移除或恢复建筑/地勘公共资料引用，unit须明确项目整体；保留原文及历史，更新下游状态。',false,['main','intake','expansion','modules','ppt'],object({sourceId:text('移除使用sources[].source_id；恢复使用removedSources[].id归档ID',240),action:{enum:['remove','restore']}},['sourceId','action'])),
 op('seismic.update','更新单体抗震等级查表条件，执行已有规则；不等于完成模型复算。高度须明确房屋高度口径，自动选表须明确住宅/其他。',false,['main','intake','expansion','modules','ppt'],object({values:dictionary('height,structure,basis,category,intensity,pga,site等现有查表条件；buildingUse为residential/other'),heightBasis:{enum:['main-roof-above-outdoor'],description:'有输入高度时必填：室外地面至主要屋面板顶'}},['values'])),
 op('expansion.generate','用当前建筑、地勘、模型与统一措施更新自动初稿，人工段落保留。',false,['main','intake','expansion','modules','ppt'],object()),
 op('expansion.read','读取扩初章节、表格行键、图位、规范与来源；供下一步精确修改。',true,[],object()),
 op('expansion.outline','读取所有扩初章节的小节编号；局部改写先读取本目录，编号重复时不猜测目标。',true,[],object()),
 op('expansion.subsection_read','读取指定小节原文，保留参数与图表标记。无编号小节的章节使用body，章首正文使用intro。',true,[],object({sectionId:text('outline返回的章节ID',80),subsectionId:text('outline返回的小节ID',100)},['sectionId','subsectionId'])),
 op('expansion.subsection_edit','仅改写指定小节正文，其他小节保持原样；保留图表、参数标记及下级标题。返回previousText供撤销：重新读取后以当前text为expectedText、previousText为新text调用本接口。',false,['main','expansion'],object({sectionId:text('章节ID',80),subsectionId:text('小节ID',100),expectedText:text('subsection_read返回的完整text',200000),text:text('新小节正文，保留联动标记',200000)},['sectionId','subsectionId','expectedText','text'])),
 op('expansion.edit','改写指定章节，必须提交读取时的 expectedText，保护同时编辑；保留上一稿与参数引用。',false,['main','expansion'],object({sectionId:text('章节ID',80),expectedText:text('读取时该章原文',200000),text:text('新正文，保留现有联动标记',200000),hidden:{type:'boolean'}},['sectionId','expectedText','text'])),
 op('expansion.table','编辑表格一个单元格，使用 expansion.read 返回的 rowKey，保留未编辑格联动。',false,['main','expansion'],object({key:text('表格键',100),rowKey:text('原表行键',1000),column:{type:'integer',minimum:0,maximum:30},value:text('单元格新值',10000)},['key','rowKey','column','value'])),
 op('expansion.unit_row','隐藏或恢复表1的单体行；只变更派生表格，不删除建筑资料。',false,['main','expansion'],object({rowKey:text('表1单体行键',1000),hidden:{type:'boolean'}},['rowKey','hidden'])),
 op('expansion.image','将图片插入明确图位。data 必须为PNG/JPEG/WebP Base64 data URL。',false,['main','expansion'],object({slot:text('expansion.read给出的图位ID',200),name:text('原文件名',240),data:text('图片data URL，最多4MB',5700000)},['slot','name','data'])),
 op('expansion.regularity','设置六类不规则项是/否与应对措施；不自动声称结构规则。',false,['main','expansion'],object({category:text('六类ID',100),answer:{enum:['','yes','no']},choice:text('措施案例ID或common',300),text:text('人工或AI改写措施正文',20000)},['category','answer'])),
 op('regulations.update','增改规范记录或取消选用，默认待核；不把检索结果伪装为已确认现行规范。',false,['main','expansion'],object({id:text('已有记录ID；新增省略',200),title:text('规范名称',1000),code:text('编号',300),category:{enum:['local','national']},source_id:text('来源ID',500),source_url:text('来源URL',2000),locator:text('条文/版本/页码定位',2000),note:text('说明',10000),selected:{type:'boolean'}},[])),
 op('regulations.search','按地区和关键词检索页面同一份本地地方规范目录，只读；无网络访问，不宣称现行性已核验。',true,[],object({region:text('省、市或省会，例如云南、昆明',100),keyword:text('名称或编号关键词，可省略',300)},['region'])),
 op('document.package','生成当前网页同版式的导出规格，供服务端导出Word/PDF。未签发成果为草稿。',true,[],object({kind:{enum:['measures','expansion','regulations']}},['kind'])),
 op('ppt.read','载入当前单体PPT，读取页和可编辑字段、图片图位；不导出、不签发。',true,[],object()),
 op('ppt.edit','更新指定PPT字段，expectedEdits须与当前人工文字一致，保留参数字段联动。',false,['main','ppt'],object({edits:{type:'object',additionalProperties:text('新文字',20000)},expectedEdits:{type:'object',additionalProperties:text('读取时人工覆盖，未覆盖用空串',20000)}},['edits','expectedEdits'])),
 op('ppt.image','上传到PPT已存在图位，图片为最多4MB的PNG/JPEG/WebP。',false,['main','ppt'],object({key:text('ppt.read给出的图位键',300),data:text('图片data URL',5700000)},['key','data'])),
 op('ppt.export','生成当前单体PPT草稿文件，直接返回实际PPTX内容，不触发浏览器下载确认。',true,[],object()),
 op('steel.read','读取指定单体材料统计与CSV，基础单方只用首层面积。',true,[],object()),
 op('steel.import','解析指定单体混凝土或钢筋文件，使用既有解析器和单位口径。',false,['main','modules','ppt'],object({slot:{enum:['concrete','rebar','foundation']},files:{type:'array',items:file,minItems:1,maxItems:12}},['slot','files'])),
 op('steel.area','更新首层面积。留空清除人工覆盖，不得用总楼面面积替代。',false,['main','modules','ppt'],object({value:{type:['number','null'],exclusiveMinimum:0}},['value'])),
 op('calculation.read','读取当前计算书目录、Excel选用和输入格、模型文件清单。',true,[],object()),
 op('calculation.catalog','修改当前计算书四组目录，保留已有附件与Excel来源。',false,['main'],object({sections:{type:'array',minItems:4,maxItems:4,items:object({title:text('组标题',200),items:{type:'array',maxItems:80,items:text('目录条目',500)}},['title','items'])}},['sections'])),
 op('calculation.excel','选择当前项目Excel工作簿/工作表，编辑允许的输入格并按需联动；不运行宏或猜算未知公式。',false,['main','assets'],object({workbook:text('已有工作簿键',100),sheet:text('已有工作表名',200),edits:{type:'object',additionalProperties:text('输入格数值或文字',500)},link:{type:'boolean'}},['workbook','sheet'])),
 op('calculation.model','读取用于计算书的WMASS/WDISP/WZQ原文件副本，不覆盖模型原件。',false,['main'],object({files:{type:'array',items:file,minItems:1,maxItems:3}},['files'])),
 op('calculation.package','读取计算书真实导出请求。confirmed只表示用户已核对本次目录/内容，不是结构审签；未确认返回false。',true,[],object({confirmed:{type:'boolean'}})),
 op('office.generate','按自然语言确定的当前项目和单体，使用同一参数版本一次生成一组真实DOCX、PPTX、XLSX，登记共同batchId；文件可在工作台直接编辑或下载。原文档与人工稿保留，生成成功不表示专业审签。',false,['main','intake','expansion','modules','ppt'],object()),
 op('office.open','在工作台打开指定本机原生Office文档；保存原编辑器的修改后切换，不更换项目或单体。',false,['main'],object({documentId},['documentId'])),
 op('office.read','读取指定Office文档的可编辑文字、单元格或形状及文件修订；目标须属于明确项目和单体，打开同源编辑器读取。',true,[],object({documentId},['documentId'])),
 op('office.command','通过页面同一编辑器修改并保存原生文档：Word文字、格式、段落、表格、图片、撤销重做；Excel表格、公式及工作表；PPT幻灯片、文本、图片和布局。Word格式和插入操作必须提供唯一targetText，需原内容/坐标及文件expectedRevision。不会回写工程参数，不代表验算或审签。',false,['main'],officeCommandSchema),
 op('office.save','保存指定文档在当前编辑器中的修改，返回实际已保存的文件修订；不生成新项目、不代替专业审签。',false,['main'],object({documentId,expectedRevision:fileRevision},['documentId','expectedRevision'])),
];
export const browserOperation=name=>BROWSER_OPERATIONS.find(item=>item.name===name);
