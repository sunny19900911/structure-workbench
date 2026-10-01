import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,resolveText,validateDraft,reportTables,dependencies,SECTIONS} from '../../expansion-core.js';
import {defaultExpansion} from '../../default-expansion.js';
import {freshIntake,expansionEvidence} from '../../intake-core.js';
import {cleanDocumentHTML} from '../../server/word-layout.mjs';
const fresh=()=>{const s=createState({projectName:'测试工程',unit:'项目整体'});s.parameters={project_name:'测试工程'};return s;};
test('默认正文恢复通用材料和三类荷载表，不借用历史项目结果',()=>{
 const s=fresh();for(const sec of SECTIONS){const draft=defaultExpansion(s,sec.id);assert.ok(draft.text.length>40);assert.deepEqual(validateDraft(draft,s).errors,[]);assert.doesNotMatch(resolveText(draft.text,s),/云南旅游|57919|已验算满足/);}
 assert.match(resolveText(defaultExpansion(s,'materials').text,s),/Q355B/);
 assert.equal(reportTables(s,'loads').length,3);
 assert.ok(reportTables(s,'loads').every(t=>t.rows.length>=3));
});
test('未采用的建筑信息立即形成带待核标识的概况，确认后更新引用',()=>{
 const intake=freshIntake();intake.sources=[{source_id:'b',name:'建筑资料',fragments:[]}];
 intake.facts=[{id:'addr',key:'region',value:'云南省昆明市经开区',unit:'项目整体',status:'candidate',source_id:'b'}, {id:'height',key:'height_m',label:'结构高度',value:'24',unit:'1号楼',status:'candidate',source_id:'b'}];
 const s=fresh();s.facts=expansionEvidence(intake,'项目整体',{},true).facts;
 const draft=defaultExpansion(s,'overview');assert.match(resolveText(draft.text,s),/【待核】云南省昆明市经开区/);assert.match(resolveText(draft.text,s),/1号楼.*【待核】24/);
 s.facts.forEach(f=>f.status='confirmed');assert.doesNotMatch(resolveText(draft.text,s),/【待核】/);assert.deepEqual(validateDraft(draft,s).errors,[]);
 assert.equal(expansionEvidence(intake,'2号楼',{},true).facts.some(f=>f.unit==='1号楼'),false);
});
test('措施条款和表格改动同步引用，并使旧校核版本失效',()=>{
 const s=fresh(),draft=defaultExpansion(s,'materials'),before=dependencies(s);
 s.templateText={steel:'本项目调整后的钢材条款'};s.templateTables={floor:[['位置','活载'],['教室','3.0']],roof:[],equipment:[]};
 assert.match(resolveText(draft.text,s),/本项目调整后的钢材条款/);assert.notEqual(dependencies(s),before);assert.equal(reportTables(s,'loads')[0].rows[0][1],'3.0');
});
test('排版输入剔除可执行内容、外链及事件，保留文档层级',()=>{
 const cleaned=cleanDocumentHTML('<script>alert(1)</script><div class="document-title" onclick="bad()">标题</div><p><img src="https://bad">正文</p><table><tr><td colspan="2">表格</td></tr></table>');
 assert.doesNotMatch(cleaned,/script|onclick|https:|img/);assert.match(cleaned,/class="document-title"/);assert.match(cleaned,/colspan="2"/);
});
