import {singleImageLayoutId,migrateSingleImageDraft} from './single-image-layout.js';
// v4 stores each image once. Migrate every unit, including inactive units, on read.
export function restorePptDraft(saved,unit){
 const drafts={...(saved.unitDrafts||{})};
 if(saved.unit&&!drafts[saved.unit])drafts[saved.unit]={edits:saved.edits||{},provenance:saved.provenance||{},images:saved.images||{}};
 if(!saved.unit&&!drafts['项目整体']&&(saved.images||saved.edits))drafts['项目整体']={edits:saved.edits||{},provenance:saved.provenance||{},images:saved.images||{}};
 for(const key of Object.keys(drafts))drafts[key]=migrateSingleImageDraft(drafts[key],saved.templateLayout);
 return {drafts,current:drafts[unit]||{layoutId:singleImageLayoutId}};
}
export function serializePptDraft(unit,parameterVersion,drafts,current){
 return {layoutVersion:4,templateLayout:singleImageLayoutId,unit,parameterVersion,unitDrafts:{...drafts,[unit]:{...drafts[unit],...current,layoutId:singleImageLayoutId}}};
}
