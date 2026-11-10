import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTextGlyphs} from './audit-text-glyphs.mjs';
import {nativeReportSource} from './compose-native-report.mjs';
test('unresolved glyphs flag BMP, supplementary, replacement and CID mappings',()=>{
 const r=auditTextGlyphs('Z\uf02d1 \uf02d \ufffd '+String.fromCodePoint(0xf0001)+' (cid:123)');
 assert.deepEqual(r.codepoints,['U+F02D','U+FFFD','U+F0001']);
 assert.deepEqual(r.cidTokens,['(cid:123)']);
 assert.equal(auditTextGlyphs('①黏土 SO₄²⁻ Δωᵢ 5.14～7.75 −1/2'),null);
});
test('source keeps original text and coordinates while exposing its review state',()=>{
 const text='Zi \uf02d1 / Zn \uf02d1',bbox=[20,50,200,80],hash='a'.repeat(64);
 const report={sha256:hash,name:'fixture.pdf',pageCount:1,pages:[{page:1,width:500,height:800,method:'native',blocks:[{kind:'paragraph',text,bbox,column:0}]}]};
 const snapshot=structuredClone(report),s=nativeReportSource(report,{expectedHash:hash});
 assert.equal(s.blocks.paras[0],text);assert.deepEqual(s.blocks.paragraphMeta[0].bbox,bbox);
 assert.equal(s.blocks.pdfReadReport.textReview[0].paragraph,0);
 assert.equal(s.blocks.pdfReadReport.textReview[0].page,1);
 assert.ok(s.blocks.warnings.some(w=>w.includes('未映射字形')));
 assert.deepEqual(report,snapshot);
});
