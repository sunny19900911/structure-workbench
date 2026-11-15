import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,resolveText} from '../../expansion-core.js';
import {referenceText,reportTable} from '../../reference-report.js';
import {defaultExpansion} from '../../default-expansion.js';

test('旧数值和带度的新选项在扩初自动稿及保存模板中只输出一个单位',()=>{
  for(const intensity of ['8','8度','8 度',8]){
    const s=createState({});s.parameters={intensity};
    assert.match(resolveText(referenceText(s,'model'),s),/抗震设防烈度8度，/);
    assert.match(resolveText(defaultExpansion(s,'criteria').text,s),/抗震设防烈度为8度，/);
    assert.equal(resolveText('烈度{{p:intensity}} 度',s),'烈度8 度');
    assert.equal(s.parameters.intensity,intensity);
    assert.equal(reportTable(s,'earthquake').rows.find(r=>r.values[0]==='抗震设防烈度').values[1],String(intensity));
  }
});

test('仅处理烈度绑定后的单位，不删人工正文或其他字段',()=>{
  const s=createState({});s.parameters={intensity:'8度',note:'温度'};
  assert.equal(resolveText('烈度{{p:intensity}}；{{p:note}}度；原文8度度',s),'烈度8度；温度度；原文8度度');
  s.parameters.intensity='8度（0.20g）';
  assert.equal(resolveText('{{p:intensity}}度',s),'8度（0.20g）度');
});
