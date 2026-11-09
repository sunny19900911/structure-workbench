import test from 'node:test';
import assert from 'node:assert/strict';
import {composeDocument} from '../../document-intake.js';
import {fragments} from '../../intake-core.js';
const source=(paras,extra={})=>{const blocks={paras,tables:[],...extra};return {slot:'geo',name:'报告.docx',source_id:'current-survey',blocks,fragments:fragments(blocks)};};
const part=(d,a,b)=>d.geotech.text.split(a)[1]?.split(b)[0]||'';
test('Chinese section numbers may change and geological-age subheadings retain strata',()=>{
 const d=composeDocument([source(['三、场地条件','（二）地形地貌','场地为丘陵。','（三）地层分布及成因','1、近期人类活动形成的地层','①素填土：松散。','2、第四系冲积地层','②粉土：稍密。','（四）水文地质','潜水埋深有季节变化。'])]);
 assert.match(part(d,'4.2 场地地层岩性构成','4.3'),/①素填土.*\n②粉土/s);assert.doesNotMatch(part(d,'4.2 场地地层岩性构成','4.3'),/潜水/);
});
test('no-space decimal DOC chapters retain layers, seismic results and antifloat separately',()=>{
 const d=composeDocument([source(['2.3地层结构','第①层素填土。','第②2层泥炭质土。','3.6.2抗震设防烈度','抗震设防烈度为7度，设计基本地震加速度为0.10g，设计地震分组为第二组。','3.6.5软土震陷','②2层应考虑震陷。','5.3抗浮水位建议','永久期按周边地坪考虑，施工期应降水。'])]);
 assert.match(d.geotech.text,/②2层应考虑震陷/);assert.equal(d.parameters.eq_group,'第二组');assert.equal(d.parameters.pga,'0.10g');assert.match(d.waterText,/永久期.*施工期/);assert.doesNotMatch(d.geotech.text,/永久期/);
});
test('automatic Word headings and no-numeral liquid-soil title route to right chapters',()=>{
 const d=composeDocument([source(['场地地震效应评价','抗震设防烈度为8度。','液化土','场地没有可液化土。','软土震陷','②1层存在震陷。'],{paragraphMeta:[{headingLevel:1},{},{headingLevel:2},{},{headingLevel:2},{}]})]);
 assert.match(part(d,'4.4.3','4.4.4'),/没有可液化土/);assert.match(part(d,'4.4.1','4.4.2'),/8度/);
});
test('task, bibliography and construction contents cannot become geological conclusions',()=>{
 const d=composeDocument([source(['1.2勘察目的和任务','1.2.1地下水','应查明地下水。','1.3勘察依据','1、《中国地震动参数区划图》','规范要求查明液化。','2.1地形地貌','实际场地平坦。','2.2地层结构','①黏土。','4.1基础方案','建议采用桩基础。','4.2桩基施工建议','施工需要配制泥浆。'])]);
 assert.doesNotMatch(d.geotech.text,/应查明|规范要求|泥浆/);assert.match(d.foundation,/建议采用桩基础/);assert.doesNotMatch(d.foundation,/泥浆/);
});
test('one populated chapter is useful; a missing terrain chapter does not disable section parsing',()=>{
 const d=composeDocument([source(['4.1场地土类型及场地类别','东区Ⅱ类，西区Ⅲ类。','4.2软土震陷','无震陷性软土。'])]);assert.match(d.geotech.text,/东区Ⅱ类，西区Ⅲ类/);assert.equal(d.parameters.site_class,'');
});
test('numbered normative clauses and decimal measurements inside prose stay in the paragraph',()=>{
 const s=source(['3.6.5 软土震陷','根据规程第','6.3.4 条，本场地可不考虑震陷，厚度为0.50m。']);s.name='报告.pdf';
 const d=composeDocument([s]);assert.match(d.geotech.text,/第6.3.4 条.*0.50m/);
});
test('images after paragraph 300 are not discarded because of report length',()=>{
 const d=composeDocument([source(['地形地貌','场地平坦。'],{images:[{afterParagraph:500,caption:'图5 岩溶分布',data:'data:image/png;base64,AA'}]})]);assert.equal(d.geotech.images.length,1);
});
