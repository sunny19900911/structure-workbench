// Read-only validation of a one-line shared-owner proposal. The shared source
// file is never changed; the candidate runs as an in-memory ES module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {composeDocument as current} from '../../../document-intake.js';
import {fragments} from '../../../intake-core.js';
const app=resolve(import.meta.dirname,'../../..'),path=resolve(app,'document-intake.js');
const original=await readFile(path,'utf8'),needle=String.raw`([ⅥⅦⅧⅨ6-9]+)度/g`;
assert.equal(original.split(needle).length,2,'Proposal must match exactly one expression');
const replacement=String.raw`([ⅥⅦⅧⅨ6-9]+)\s*度/g`;
const candidate=original.replace(needle,replacement).replace(/from\s+(['"])(\.\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(pathToFileURL(resolve(app,p)).href));
const {composeDocument:proposed}=await import('data:text/javascript;base64,'+Buffer.from(candidate).toString('base64'));
const make=text=>{const blocks={paras:['5.2 地震参数',text],tables:[]};return {slot:'geo',name:'合成报告.pdf',source_id:'synthetic',blocks,fragments:fragments(blocks)};};
test('shared candidate accepts whitespace and preserves conflict rejection',()=>{
 for(const [text,expected] of [['抗震设防烈度为8度。','8'],['抗震设防烈度为 8 度。','8'],['抗震设防烈度为 Ⅷ 度。','8'],['甲区抗震设防烈度为 7 度，乙区抗震设防烈度为 8 度。',''],['区域历史地震烈度最大达10度。','']]){
  const s=make(text),before=JSON.stringify(s);assert.equal(proposed([s]).parameters.intensity,expected);assert.equal(JSON.stringify(s),before);
 }
});
test('actual Hainan PDF is blank currently and 8 in the candidate; Word remains 8',async()=>{
 const root=resolve(app,'qa/parallel-review-20261109/geotech');
 const pdf=JSON.parse(await readFile(resolve(root,'goal-round37/pdf/hainan/native-source.json'),'utf8'));
 const word=JSON.parse(await readFile(resolve(root,'goal-round5/word/hainan-source.json'),'utf8'));
 assert.equal(current([pdf]).parameters.intensity,'');assert.equal(proposed([pdf]).parameters.intensity,'8');
 assert.equal(current([word]).parameters.intensity,'8');assert.equal(proposed([word]).parameters.intensity,'8');
 assert.deepEqual({...current([pdf]).parameters,intensity:'8'},proposed([pdf]).parameters);
 assert.equal(JSON.stringify(pdf.blocks).includes('特征周期'),false);
 assert.equal(JSON.stringify(word.blocks).includes('特征周期'),false);
});
test('shared file remains unchanged',async()=>assert.equal(await readFile(path,'utf8'),original));
