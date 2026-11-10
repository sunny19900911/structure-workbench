import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechCorrosionRecords} from '../../../geotech-tables.js';
const rows=[['内容','内容','腐蚀性/含量','Cl 干湿交替','Cl 长期浸水'],['水样','A1','10','20','20'],['水样','水样','11','21','21']];
function fixture(){
 const cellOrigins=rows.map((row,r)=>row.map((text,c)=>({row:r,column:c,text,bbox:[c*10,r*10,c*10+10,r*10+10]})));
 const o={row:2,column:0,text:'水样',bbox:[0,20,20,30]};cellOrigins[2][0]=structuredClone(o);cellOrigins[2][1]=structuredClone(o);
 const cl={row:2,column:3,text:'21',bbox:[30,20,50,30]};cellOrigins[2][3]=structuredClone(cl);cellOrigins[2][4]=structuredClone(cl);
 return {cellOrigins};
}
test('PDF merge removes duplicate meaning but preserves two exposure conditions',()=>{
 const meta=fixture(),before=structuredClone(meta),r=geotechCorrosionRecords(rows,meta);
 assert.equal(r[0].fields.length,5);assert.equal(r[1].fields.length,4);
 assert.equal(r[1].fields.filter(f=>f.value==='水样').length,1);
 assert.deepEqual(r[1].fields.filter(f=>f.value==='21').map(f=>f.label),['Cl 干湿交替','Cl 长期浸水']);
 assert.deepEqual(meta,before);
});
test('equal values without trustworthy geometry stay separate',()=>{
 assert.equal(geotechCorrosionRecords(rows)[1].fields.length,5);
 for(const change of [m=>m.cellOrigins[2][1].bbox[2]=21,m=>m.cellOrigins[2][1].text='另一值',m=>m.cellOrigins[2][1].requiresReview=true]){
  const m=fixture();change(m);assert.equal(geotechCorrosionRecords(rows,m)[1].fields.length,5);
 }
});
