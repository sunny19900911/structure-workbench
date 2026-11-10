// Regression for the shared composer; optional real reports stay outside Git.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {composeDocument} from '../../../document-intake.js';
import {fragments} from '../../../intake-core.js';
const make=text=>{const blocks={paras:['5.2 地震参数',text],tables:[]};return {slot:'geo',name:'合成报告.pdf',source_id:'synthetic',blocks,fragments:fragments(blocks)};};
test('shared composer accepts intensity whitespace and preserves conflict rejection',()=>{
 for(const [text,expected] of [['抗震设防烈度为8度。','8'],['抗震设防烈度为 8 度。','8'],['抗震设防烈度为 Ⅷ 度。','8'],['甲区抗震设防烈度为 7 度，乙区抗震设防烈度为 8 度。',''],['区域历史地震烈度最大达10度。','']]){
  const source=make(text),before=JSON.stringify(source);
  assert.equal(composeDocument([source]).parameters.intensity,expected);assert.equal(JSON.stringify(source),before);
 }
});
test('actual Hainan PDF and Word retain source intensity', {skip:process.env.GEOTECH_QA_ROOT?false:'Private fixtures: set GEOTECH_QA_ROOT explicitly'},async()=>{
 const root=resolve(process.env.GEOTECH_QA_ROOT);
 const pdf=JSON.parse(await readFile(resolve(root,'goal-round37/pdf/hainan/native-source.json'),'utf8'));
 const word=JSON.parse(await readFile(resolve(root,'goal-round5/word/hainan-source.json'),'utf8'));
 assert.equal(composeDocument([pdf]).parameters.intensity,'8');assert.equal(composeDocument([word]).parameters.intensity,'8');
 assert.equal(JSON.stringify(pdf.blocks).includes('特征周期'),false);assert.equal(JSON.stringify(word.blocks).includes('特征周期'),false);
});
