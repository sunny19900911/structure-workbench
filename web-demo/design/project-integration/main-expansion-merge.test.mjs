import test from 'node:test';
import assert from 'node:assert/strict';
import {reportTable,sectionBlocks} from '../../reference-report.js';
import {setQueryRegulation} from '../../regulation-document.js';
test('主工作区地方规范选择、编辑与附注进入扩初原生表和Word内容',()=>{
 const s={regulations:[],parameters:{},regulationDocument:{localNote:'本项目补充附注'}};
 setQueryRegulation(s,{source_id:'SRC-test',title:'示范地区技术要求',code:'地方文号',version:'2026'},()=> 'r1');
 assert.deepEqual(reportTable(s,'local').rows[1].values,['示范地区技术要求','地方文号 2026']);
 s.regulations[0].title='人工修改标题';s.regulations[0].code='地方文号2026';
 assert.deepEqual(reportTable(s,'local').rows[1].values,['人工修改标题','地方文号2026']);
 assert.ok(sectionBlocks(s,'basis','[[table:local]]').some(b=>b.text==='本项目补充附注'));
 setQueryRegulation(s,{source_id:'SRC-test',selected:false},()=> 'unused');assert.deepEqual(reportTable(s,'local').rows[1].values,['','']);
});
