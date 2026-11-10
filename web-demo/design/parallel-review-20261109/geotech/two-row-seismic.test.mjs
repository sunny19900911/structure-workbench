import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechTables} from '../../../geotech-tables.js';
test('two-row seismic fallback retains cells, conditional values and physical row evidence',()=>{
 const rows=[['抗震设防烈度','设计地震分组','建筑场地类别','特征周期'],['7度','第二组','Ⅲ类场地','根据剪切波速内插取0.67s']];
 const source={source_id:'test-current',blocks:{tables:[rows],tableMeta:[{rows:[{header:true},{header:true}]}]}};
 const before=JSON.stringify(source);const out=geotechTables(source,{paragraphBuckets:[]});
 const table=out.tables.find(t=>t.key==='source-1');assert.ok(table);
 assert.deepEqual(table.rows,rows);assert.deepEqual(table.records[0].cells,rows[1]);
 assert.equal(table.records[0].index,1);assert.ok(out.evidence.some(e=>e.locator==='提取表 1 行 2'));
 assert.ok(out.texts[4].join('').includes('根据剪切波速内插取0.67s'));assert.equal(JSON.stringify(source),before);
});
