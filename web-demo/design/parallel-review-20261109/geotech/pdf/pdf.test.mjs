import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechPdfBlocks,pdfLines} from '../../../../geotech-pdf.js';
const item=(str,x,y,width=20)=>({str,transform:[10,0,0,10,x,y],height:10,width});
test('PDF text is ordered by baseline and x, preserving column gaps',()=>{
 const rows=pdfLines([item('125',200,90),item('②',10,90),item('粉土',80,90),item('4.2地层结构',10,120,100)]);
 assert.equal(rows[0].text,'4.2地层结构');assert.deepEqual(rows[1].cells,['②','粉土','125']);
});
test('simple equal-width soil table can be restored without guessing wrapped cells',()=>{
 const items=[item('4.3物理力学参数',10,150,120),...['层号','土层名称','承载力(kPa)'].map((s,i)=>item(s,i*100,120)),...['①','黏土','100'].map((s,i)=>item(s,i*100,100))];
 const b=geotechPdfBlocks([{page:1,items}]);assert.deepEqual(b.tables[0],[['层号','土层名称','承载力(kPa)'],['①','黏土','100']]);assert.equal(b.tableMeta[0].page,1);
});
test('image-only pages are reported and never masquerade as OCR results',()=>{
 const b=geotechPdfBlocks([{page:1,items:[]}]);assert.deepEqual(b.pdfReadReport.pagesWithoutText,[1]);assert.equal(b.pdfReadReport.ocrApplied,false);assert.match(b.warnings[0],/未执行OCR/);assert.equal(b.paras.length,0);
});
