import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechSiteProseTable} from '../../../geotech-site-table.js';
const fixture=paras=>({source_id:'synthetic',blocks:{paras,paragraphMeta:paras.map(()=>({page:2}))},fragments:[]});
test('explicit borehole prose restores velocity without distributing aggregate cover/category',()=>{
 const s=fixture(['ZK35 号孔：Vse=357.00m/s ZK60 号孔：Vse=163.70m/s','场地覆盖层厚度大于5m，场地类别为Ⅱ类。','ZK35号孔：Vse=357.00m/s']);
 const before=JSON.stringify(s),t=geotechSiteProseTable(s,{paragraphBuckets:[4,4,4]});
 assert.deepEqual(t.rows.slice(1).map(r=>[r[1],r[4],r[5],r[7]]),[['ZK35','357.00','',''],['ZK60','163.70','','']]);
 assert.equal(t.rowSources[1].references.length,2);assert.equal(JSON.stringify(s),before);
});
test('tasks, hypothetical measurements, ranges and incomplete units never become measured rows',()=>{
 const s=fixture(['ZK35号孔：Vse=357.00m/s','若ZK36号孔：Vse=200m/s','ZK37号孔：Vse=200~300m/s','ZK38号孔：Vse=250']);
 assert.equal(geotechSiteProseTable(s,{paragraphBuckets:[-1,4,4,4]}),null);
});
test('conflicting values remain separate and known building scope is respected',()=>{
 const s=fixture(['ZK35号孔：Vse=357.00m/s','ZK35号孔：Vse=300.00m/s','ZK36号孔：Vse=250.00m/s']);
 s.fragments=[{locator:'提取段落 3',unit:'乙楼'}];
 const t=geotechSiteProseTable(s,{paragraphBuckets:[4,4,4]},'甲楼');
 assert.deepEqual(t.rows.slice(1).map(r=>r[4]),['357.00','300.00']);
});
