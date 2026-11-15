import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {intensityDisplay} from '../../parameter-display.js';
import {referenceText} from '../../reference-report.js';
import {defaultExpansion} from '../../default-expansion.js';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');

test('可见查表面板、参数摘要和施工说明兼容烈度单位',()=>{
 const panel=read('seismic-grade-workbench.js').match(/<p>设防烈度[^\n]+?<\/p>/)[0];
 const clause=read('workbuddy-integrated-studio.html').split('\n').find(x=>x.includes("clause_id:'GN7-GEN-007'"));
 const fn=vm.runInNewContext('('+clause.trim().replace(/,$/,'')+')').text;
 for(const value of ['8','8度','8 度',8]){
  const p={intensity:value};
  assert.equal(intensityDisplay(value),'8度');
  const html=vm.runInNewContext('`'+panel+'`',{p,esc:String,intensityDisplay});
  assert.match(html,/设防烈度 8度 ·/);assert.doesNotMatch(html,/度度/);
  assert.match(fn({values:p}),/抗震设防烈度8度，/);
 }
 assert.equal(intensityDisplay(''),'');assert.equal(intensityDisplay('8度（专项）'),'8度（专项）');
 assert.match(read('integrated-modules.js'),/intensityDisplay\(input.intensity\)/);
 assert.match(read('design/parallel-tasks/06-ppt-report/cafeteria-core.js'),/intensityDisplay\(val\(p,'intensity'\)\)/);
});

test('无公共参数时的文档提取回退也不重复烈度单位',()=>{
 for(const intensity of ['8','8度','8 度']){
  const s={parameters:{},document:{parameters:{intensity}},facts:[],regulations:[]};
  assert.match(referenceText(s,'model'),/抗震设防烈度8度，/);
  assert.match(defaultExpansion(s,'criteria').text,/抗震设防烈度为8度，/);
 }
});
