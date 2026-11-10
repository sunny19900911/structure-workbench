import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechTables} from '../../../geotech-tables.js';
test('building header scopes each pile estimate without splitting combined building labels',()=>{
 const rows=[['建筑物','计算孔号','桩长(m)','Quk(kN)'],['宿舍','C08','10','730'],['食堂','C22','16','950'],['教学楼艺术综合楼','C29','24','1590']];
 const source={source_id:'test',blocks:{paras:['单桩承载力估算结果表'],tables:[rows],ordered:[{type:'p',index:0},{type:'table',index:0}]}};
 const before=JSON.stringify(source),numbered={paragraphBuckets:[12]};
 const all=geotechTables(source,numbered),one=geotechTables(source,numbered,'宿舍');
 assert.deepEqual(all.tables[0].records.map(r=>r.unit),['宿舍','食堂','教学楼艺术综合楼']);
 assert.match(one.texts[12].join(''),/730/);assert.doesNotMatch(one.texts[12].join(''),/950|1590/);
 assert.equal(one.tables[0].estimateOnly,true);
 assert.equal(geotechTables(source,numbered,'教学楼').tables.length,0);
 assert.equal(JSON.stringify(source),before);
});
