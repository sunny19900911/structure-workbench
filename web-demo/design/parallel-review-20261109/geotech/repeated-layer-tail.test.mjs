import test from 'node:test';
import assert from 'node:assert/strict';
import {detailedGeotech} from '../../../geotech-document.js';
import {fragments} from '../../../intake-core.js';

const tail='稍具不均匀性，分布较厚地段经地基处理后可作天然地基土使用。';
function read(paras){
 const blocks={paras,tables:[],pdfReadReport:{paragraphsReflowed:true}};
 return detailedGeotech({name:'layers.pdf',source_id:'TEST-LAYERS',blocks,fragments:fragments(blocks)}).text.replace(/\s/g,'');
}
test('different soil layers keep identical qualifying lines in final detailed text',()=>{
 const layers=['第②层黏土：属中压缩性土，固结比OCR=168.31，',
  '第③层黏土：属中～高压缩性土，固结比OCR=15.17，',
  '第④层黏土：属中～高压缩性土，固结比OCR=5.22，'];
 const text=read(['4.1 地基土评价',...layers.flatMap(p=>[p,tail])]);
 for(const layer of layers)assert.ok(text.includes(layer+tail));
 assert.equal(text.split(tail).length-1,3);
});
test('complete duplicate prose still appears once after final formatting',()=>{
 const head='第②层黏土：属中压缩性土，固结比OCR=168.31，';
 const text=read(['4.1 地基土评价',head,tail,head,tail]);
 assert.equal(text.split(head+tail).length-1,1);
});
