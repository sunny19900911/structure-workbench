import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {composeDocument} from '../../document-intake.js';
import {fragments} from '../../intake-core.js';
import {createState} from '../../expansion-core.js';
import {reportTable,referenceText} from '../../reference-report.js';
const source=(slot,paras)=>{const blocks={paras,tables:[]};return {slot,name:slot==='geo'?'测试.pdf':'测试.docx',source_id:slot,blocks,fragments:fragments(blocks)};};
test('numbered unit paragraphs populate native table without borrowing adjacent heights or basement',()=>{
 const s=source('bldg',['1.甲学院','总建筑面积：12000㎡；','建筑层数：地上5层，地下1层；','消防建筑高度：24.0米；','规划建筑高度：27.6米；','2.乙学院','乙学院各层设置实验室。','总建筑面积：14600㎡；','建筑层数：地上5层；','层高：首层层高5.4米，二~五层层高4.5米，室内外高差0.3米；','消防建筑高度：24.0米；','规划建筑高度：27.9米；','3.南校门','总建筑面积：100㎡；','建筑层数：地上1层；']);
 const d=composeDocument([s],'乙学院');assert.equal(d.units.length,1);const u=d.units[0];
 assert.equal(u.area,'14600');assert.equal(u.floors,'5');assert.equal(u.fireHeight,'24.0');assert.equal(u.planningHeight,'27.9');assert.equal(u.height,'');assert.equal(u.structuralHeight,undefined);assert.match(u.storeys,/5.4米/);
 const state=createState({unit:'乙学院'});state.document=d;
 const table=reportTable(state,'units');assert.equal(table.rows.length,3);assert.match(table.rows[2].values[4],/27.9（规划）/);assert.match(table.rows[2].values[4],/24.0（消防）/);assert.match(referenceText(state,'overview'),/乙学院 14600/);
 assert.deepEqual(composeDocument([s],'其他学院').units,[]);
});
test('numbered PDF sections join wraps, omit task and construction prose, preserve scope and source evidence',()=>{
 const s=source('geo',['1.2 勘察目的、任务及要求','判定粉砂土液化，提供地下水资料。','1B1B二、场地工程地质条件2.1 地形地貌','拟建场地地貌属平原，大部分位','置被绿网覆盖。2.2 气象及水文条件','区域温度较高。2.4.1 地基土的构成与特征','（1）层杂填土：结构松','散，工程性质差。','（2）层粉质黏土：干强','测试建设工程','岩土工程初步勘察报告','工程编号：','K123','第','7','页','共','13','页','度中等，韧性中等。2.4.2 不良地质作用及特殊性岩土','场地内存在明塘。','4.1.2.2 建筑的场地类别','二号楼按Ⅳ类，其余按Ⅲ类考虑。4.1.2.5 场地饱和砂土液化判别','无液化土存在。4.1.2.6 软土震陷评价','根据规程第','6.3.4 条，本场地可不考虑软土震陷。','4.3.5 桩基施工建议','桩基施工发生液化流动，应配制泥浆。','3.2 地下水','潜水埋深0.5～1.5m。3.3 腐蚀性评价','水样正分析中，参考一期资料判断具微腐蚀性。']);
 const d=composeDocument([s]);const t=d.geotech.text;
 assert.match(t,/大部分位置被绿网覆盖/);assert.match(t,/干强度中等，韧性中等/);assert.match(t,/6.3.4 条，本场地可不考虑软土震陷/);assert.match(t,/二号楼按Ⅳ类，其余按Ⅲ类/);assert.match(t,/水样正分析中/);
 assert.doesNotMatch(t,/判定粉砂土|泥浆|K123|7页|区域温度/);assert.ok(d.geotech.evidence.some(f=>f.quote==='度中等，韧性中等。2.4.2 不良地质作用及特殊性岩土'));
});
test('PPT list includes saved expansion units even when architecture recognition is absent',()=>{
 const js=readFileSync(new URL('../../integrated-modules.js',import.meta.url),'utf8');
 const declaration=js.match(/const units=\(\)=>[^\n]+/)[0];
 const value=vm.runInNewContext(declaration+'; units()', {PROJECT:'项目整体',I:{units:[]},expansions:{'模型学院':{}},state:{steel:{units:{}},decisions:[]}});
 assert.deepEqual(Array.from(value),['项目整体','模型学院']);
});
