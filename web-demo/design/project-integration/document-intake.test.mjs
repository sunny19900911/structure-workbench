import test from 'node:test';
import assert from 'node:assert/strict';
import {composeDocument,cleanDocumentText} from '../../document-intake.js';
import {createState,validateDraft,reportTables,dependencies} from '../../expansion-core.js';
import {defaultExpansion} from '../../default-expansion.js';

const source={slot:'bldg',source_id:'architecture',fragments:[
 {id:'p1',text:'项目名称：测试学校教学配套建设项目',locator:'段落1'},
 {id:'p2',text:'建设地点：测试市中心片区规划路北侧',locator:'段落2'},
 {id:'t1',text:'',cells:['栋号','建筑面积','地上建筑面积','1F','2F','3F','4F','-1F'],locator:'提取表 1 行 1'},
 {id:'t2',text:'',cells:['综合楼','1200','1000','300','300','300','100','200'],locator:'提取表 1 行 2'},
 {id:'p3',text:'综合楼：共3层，首层层高4.5m，3层内局部夹层层高4.5m。',locator:'段落3'},
 {id:'p4',text:'综合楼：建筑规划高度24.1m，消防高度23.2m。',locator:'段落4'},
 {id:'p5',text:'综合楼：一二层以学生食堂为主，三层为室内体育馆。',locator:'段落5'},
]};
test('multi-row areas, basement and height meanings remain separate from floor counts',()=>{
 const d=composeDocument([source]);const u=d.units[0];
 assert.equal(u.area,'1200');assert.equal(u.belowArea,'200');assert.equal(u.floors,'3（局部夹层）；地下1');
 assert.equal(u.planningHeight,'24.1');assert.equal(u.fireHeight,'23.2');assert.match(u.use,/室内体育馆/);
 assert.ok(d.evidence.every(e=>e.source_id==='architecture'&&e.fragment_id));
 assert.equal(composeDocument([source],'其他楼').units.length,0);
 assert.deepEqual(composeDocument([]).sourceIds,[]);
});
test('source-composed draft needs no fact confirmations; altered numbers still fail validation',()=>{
 const s=createState({unit:'项目整体'});s.document=composeDocument([source]);
 const d=defaultExpansion(s,'overview');assert.deepEqual(validateDraft(d,s).errors,[]);
 assert.ok(validateDraft({...d,text:d.text+'虚构面积999㎡。'},s).errors.length);
 assert.equal(reportTables(s,'overview')[0].rows.length,1);
 assert.doesNotMatch(cleanDocumentText('【待核】24m；【结构体系待补充】'),/待核|待补/);
 const before=dependencies(s);s.document.units[0].area='1300';assert.notEqual(dependencies(s),before);
});
test('new source versions are explicit and do not mix old unit geometry',()=>{
 const d=composeDocument([source,{...source,source_id:'new',fragments:source.fragments.filter(f=>!f.id.startsWith('t'))}]);
 assert.equal(d.units.length,0);assert.match(d.notes.join(''),/最后导入/);
});
test('absence of measured groundwater does not remove separate antifloat recommendations',()=>{
 const d=composeDocument([{slot:'geo',source_id:'survey',fragments:[
  {id:'water',locator:'段落1',text:'拟建场地所有的钻孔在钻探深度范围内均未测到地下水，调查记录保留在本次勘察报告内。'},
  {id:'float',locator:'段落2',text:'考虑雨季积水影响，建议地下室部位抗浮设计水位按100.00m考虑；当场地整平标高有较大调整变化时，应进一步复核抗浮水位。'},
 ]}]);
 assert.match(d.ground,/未测到地下水/);assert.match(d.foundation,/建议.*100.00m/);
 assert.doesNotMatch(d.ground,/100.00/);assert.doesNotMatch(d.foundation,/无需抗浮/);
});
