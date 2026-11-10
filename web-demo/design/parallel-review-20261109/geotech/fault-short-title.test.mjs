import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedGeotechSections,geotechDestination} from '../../../geotech-numbered-sections.js';
const source=(paras,name='合成.docx')=>({source_id:'synthetic',name,blocks:{paras,tables:[],ordered:paras.map((_,index)=>({type:'p',index})),pdfReadReport:{paragraphsReflowed:true}}});

test('short fault-zone result heading preserves its following distance and activity conditions',()=>{
 for(const title of ['断裂带','断裂带评价','场地断裂带','场地断裂带评价'])for(const name of ['报告.docx','报告.pdf']){
  const result=numberedGeotechSections(source(['2.2 区域地质构造','2.2.1 '+title,'场地西侧存在断裂，距离约3km。','该段为非活动断裂，其余区段未评价。','2.3 地下水','水位埋深为2m。'],name));
  assert.match(result.buckets[7].join(''),/距离约3km/);assert.match(result.buckets[7].join(''),/其余区段未评价/);
  assert.doesNotMatch(result.buckets[7].join(''),/水位埋深/);assert.match(result.buckets[11].join(''),/水位埋深/);
 }
});

test('task descendants and construction-monitoring titles remain excluded',()=>{
 const result=numberedGeotechSections(source(['一、勘察任务','1.1 断裂带','应查明场地断裂分布和活动性。','二、地下水','场地水位埋深2m。']));
 assert.doesNotMatch(result?.buckets.flat().join('')||'',/应查明/);
 for(const title of ['断裂带监测','断裂带施工','断裂带勘察方法'])assert.equal(geotechDestination(title),-1);
});
