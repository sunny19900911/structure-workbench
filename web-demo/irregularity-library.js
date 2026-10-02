import {IRREGULARITY_LIBRARY} from './irregularity-library-data.js';
export const irregularityCategories=IRREGULARITY_LIBRARY.categories;
export function irregularityAnswer(state,id) {
  const item=state.regularity?.items?.[id];
  if(item && Object.hasOwn(item,'answer'))return item.answer;
  const category=irregularityCategories.find(c=>c.id===id);
  const old=state.regularity?.rows?.find(r=>r.source===category?.rowSource)?.values?.[3]?.trim();
  return /^(有|是)$/.test(old||'')?'yes':/^(无|否)$/.test(old||'')?'no':'';
}
export function measureDraft(state,id) {
  const category=irregularityCategories.find(c=>c.id===id);
  const saved=state.regularity?.items?.[id]||{};
  const choice=saved.choice||'common';
  const historical=category.cases.find(c=>c.id===choice);
  const text=saved.drafts?.[choice]??historical?.text??category.common.text;
  return {category,choice,text,source_ids:historical?[historical.source_id]:category.common.source_ids,manual:Object.hasOwn(saved.drafts||{},choice)};
}
export function setIrregularityAnswer(state,id,answer) {
  if(!irregularityCategories.some(c=>c.id===id)||!['','yes','no'].includes(answer))throw Error('不规则项选择无效');
  state.regularity??={};state.regularity.items??={};state.regularity.items[id]??={};
  state.regularity.items[id].answer=answer;
  const draft=measureDraft(state,id);
  Object.assign(state.regularity.items[id],{source_ids:draft.source_ids,library_version:IRREGULARITY_LIBRARY.version,statement:draft.manual?'作者观点':draft.choice==='common'?'AI推断':'原文事实'});
}
export function setMeasureDraft(state,id,text) {
  const draft=measureDraft(state,id);
  state.regularity??={};state.regularity.items??={};state.regularity.items[id]??={};
  const item=state.regularity.items[id];item.drafts??={};item.drafts[draft.choice]=text;
  item.source_ids=draft.source_ids;item.statement='作者观点';
}
export function chooseMeasure(state,id,choice) {
  const category=irregularityCategories.find(c=>c.id===id);
  if(!category||(choice!=='common'&&!category.cases.some(c=>c.id===choice)))throw Error('措施来源无效');
  state.regularity??={};state.regularity.items??={};state.regularity.items[id]??={};
  const item=state.regularity.items[id];item.choice=choice;
  const draft=measureDraft(state,id);item.source_ids=draft.source_ids;
  item.statement=draft.manual?'作者观点':choice==='common'?'AI推断':'原文事实';
}
export function irregularityMeasureBlocks(state) {
  const result=[];
  for(const category of irregularityCategories){
    if(irregularityAnswer(state,category.id)!=='yes')continue;
    const draft=measureDraft(state,category.id);
    result.push({kind:'h3',text:`10.2.${result.filter(b=>b.kind==='h3').length+1} ${category.name}应对措施`});
    for(const text of draft.text.split('\n').filter(x=>x.trim()))result.push({kind:'p',text,source_ids:draft.source_ids,statement:draft.manual?'作者观点':draft.choice==='common'?'AI推断':'原文事实'});
  }
  return result;
}
