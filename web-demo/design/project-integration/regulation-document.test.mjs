import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,dependencies,reportTables} from '../../expansion-core.js';
import {regulationCategory,selectedRegulations,regulationSectionHTML,basisDocumentHTML,updateRegulationField,selectRegulation,regulationNote,setQueryRegulation} from '../../regulation-document.js';
import {cleanDocumentHTML} from '../../server/word-layout.mjs';
const fixture=()=>({...createState({projectName:'测试项目',unit:'项目整体'}),parameters:{region:'云南省昆明市'},regulations:[
 {id:'local',category:'local',title:'地方规范测试条目',code:'DBJ 53/T-96-2018',selected:true,review:'confirmed',status:'current',source_id:'test-local'},
 {id:'national',title:'国家标准测试条目',code:'GB/T 51408-2021',selected:true,review:'confirmed',status:'current',source_id:'test-national'}
]});
test('地方规范与国家规范分表，旧资料按编号兼容；不套入原稿项目清单',()=>{
 const s=fixture();assert.equal(regulationCategory(s.regulations[1]),'national');assert.equal(selectedRegulations(s).length,1);
 const table=reportTables(s,'basis');assert.equal(table[0].rows[0][0],'国家标准测试条目');assert.equal(table[1].rows[0][0],'地方规范测试条目');assert.equal(table[1].headers.length,2);
 assert.equal(selectedRegulations(createState({})).length,0);
});
test('编辑正文撤回原确认并使依赖版本改变；来源和人工附注保持独立',()=>{
 const s=fixture(),before=dependencies(s);assert.equal(updateRegulationField(s,'local','title','新标题'),true);
 assert.equal(s.regulations[0].review,'candidate');assert.equal(s.regulations[0].status,'unknown');assert.equal(s.regulations[0].source_id,'test-local');assert.notEqual(dependencies(s),before);
 const next=dependencies(s);s.regulationDocument={localNote:'人工附注'};assert.equal(regulationNote(s),'人工附注');assert.notEqual(dependencies(s),next);
 s.regulationDocument.localNote='';assert.equal(regulationNote(s),'');
});
test('删除与恢复同步正文，保留原记录；签发稿不可改，其他项目不受影响',()=>{
 const s=fixture(),other=fixture();assert.equal(selectRegulation(s,'local',false),true);assert.equal(s.regulations.length,2);
 assert.doesNotMatch(regulationSectionHTML(s),/地方规范测试条目/);assert.equal(selectedRegulations(other).length,1);
 assert.equal(selectRegulation(s,'local',true),true);s.signed={at:'test'};assert.equal(selectRegulation(s,'local',false),false);assert.equal(updateRegulationField(s,'local','code','新编号'),false);
});
test('2.2正文位于2.3之前，国地标不串表，保留人工段落与附注',()=>{
 const s=fixture();s.regulationDocument={localNote:'人工附注'};
 const html=basisDocumentHTML(s,'2.1 国家设计标准与规范\n2.2 地方设计标准与规范\n人工适用说明。\n2.3 工程资料\n地勘资料说明。');
 assert.ok(html.indexOf('地方规范测试条目')<html.indexOf('2.3 工程资料'));assert.ok(html.indexOf('国家标准测试条目')<html.indexOf('2.2 云南省'));
 assert.match(html,/人工适用说明。/);assert.match(html,/人工附注/);assert.equal((html.match(/地方规范测试条目/g)||[]).length,1);
});
test('网页和Word共用两列表格，导出无编辑工具，候选保留待核标记',()=>{
 const s=fixture();s.regulations[0].review='candidate';s.regulations[0].title='<img src=x onerror=alert(1)>';
 const html=regulationSectionHTML(s);assert.match(html,/（待核）/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|contenteditable|data-reg|button/);
 const cleaned=cleanDocumentHTML(regulationSectionHTML(s,'local',{editing:true,anchors:true}));assert.match(cleaned,/class="regulation-table"/);assert.match(cleaned,/class="regulation-note"/);assert.doesNotMatch(cleaned,/contenteditable|data-reg|onerror="/);
});
test('正式页面移除重复抓取板块，仍保留现有地方规范查询和共同存储',async()=>{
 const modules=await readFile(new URL('../../integrated-modules.js',import.meta.url),'utf8');assert.doesNotMatch(modules,/im-regulations|renderRegulations|im-reg-query/);
 const editor=await readFile(new URL('../../expansion-workbench.js',import.meta.url),'utf8');assert.doesNotMatch(editor,/本项目已选地方规范|class="regulation-directory"/);assert.match(editor,/localRegulationHTML/);assert.match(editor,/projectPart/);
});

test('查询添加保留现行状态，移除再添加复用人工记录，重复点击不产生副本',()=>{
 const s=fixture(),r={source_id:'query-local',title:'查询规范',code:'DBJ 01',status:'current',source_url:'https://example.test'};
 assert.equal(setQueryRegulation(s,r,()=> 'new'),true);
 assert.equal(s.regulations.at(-1).status,'current');
 assert.equal(setQueryRegulation(s,r,()=> 'duplicate'),false);
 assert.equal(setQueryRegulation(s,{...r,selected:false}),true);
 s.regulations.at(-1).title='人工编辑名称';
 assert.equal(setQueryRegulation(s,r),true);assert.equal(s.regulations.at(-1).title,'人工编辑名称');assert.equal(s.regulations.length,3);
 s.signed={};assert.equal(setQueryRegulation(s,{...r,selected:false}),false);
 assert.equal(selectedRegulations(fixture()).length,1);
});
