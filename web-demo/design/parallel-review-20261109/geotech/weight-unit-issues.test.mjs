import test from 'node:test';
import assert from 'node:assert/strict';
import {geotechTables} from '../../../geotech-tables.js';
const source=header=>({source_id:'current-test',blocks:{tables:[[
 ['土层编号','土层名称',header,'承载力特征值fak（kPa）'],['①','黏土','18.6','150']]]}});
test('missing source exponent keeps value in source table and records why fixed slot is blank',()=>{
 const result=geotechTables(source('天然重度γ（kN/m）'));
 const fixed=result.tables.find(t=>t.key==='strength');
 assert.equal(fixed.rows[1][1],'');
 assert.equal(result.tables.find(t=>t.key==='source-1').rows[1][2],'18.6');
 const issue=fixed.rowSources[1].fieldIssues[0];
 assert.equal(issue.reason,'source-unit-not-verified');assert.equal(issue.value,'18.6');
 assert.equal(issue.table,1);assert.equal(issue.row,2);assert.equal(issue.source_id,'current-test');assert.equal(issue.automaticAdoption,false);
});
test('explicit cubic unit remains adopted without a false missing-unit issue',()=>{
 const fixed=geotechTables(source('天然重度γ（kN/m³）')).tables.find(t=>t.key==='strength');
 assert.equal(fixed.rows[1][1],'18.6');assert.equal(fixed.rowSources[1].fieldIssues,undefined);
});
