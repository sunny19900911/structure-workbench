import {matchImageFiles,reportImageAliases} from '../../../office-ppt-assets.js';
import {cafeteriaTemplate} from '../../ppt-template/cafeteria-template.js';

export const singleImageLayoutId='cafeteria-single-20261112';
export const singleImageEditVersion='cafeteria-single-v2';
const titles=[
 'B1建筑平面布置图','首层建筑平面布置图','一层建筑平面布置图','二层建筑平面布置图',
 '三层建筑平面布置图','四层建筑平面布置图','屋面层建筑平面布置图','结构模型与构件',
 '基础布置图','桩平面布置图','首层结构平面布置图','二层结构平面布置图',
 '三层结构平面布置图','四层结构平面布置图','屋面层结构平面布置图','小屋面层结构平面布置图'
];
// Keep the source template immutable: every new page is derived from old slide 19.
const source=cafeteriaTemplate.pages[18];
export const singleImagePages=[...cafeteriaTemplate.pages.slice(0,11),...titles.map((title,index)=>{
 const number=index+12,name=number===19?'盈建科模型':title;
 const aliases=[name];
 if(number>=22){aliases.push(title.replace('平面布置图','布置'),title.replace('平面布置图','平面'));if(number>=26)aliases.push(title.replace('层结构平面布置图','结构布置'),title.replace('层结构平面布置图','结构平面'));}
 return {...structuredClone(source),number,title,sourceSlideNumber:19,editVersion:singleImageEditVersion,aliases,slots:[name],shapes:source.shapes.map(shape=>{
  const item=structuredClone(shape);
  if(item.kind==='image')item.name=name;
  if(item.kind==='text')item.text=item.id==='4'?String(number-1):item.id==='9'?(number<=18?'01  建筑设计':'02  结构设计'):title;
  return item;
 })};
})];

// Only explicit topic matches are moved. Basement top, first-floor ambiguity,
// details and special transfer drawings have no unambiguous destination.
const oldToNew={15:23,16:24,17:25,19:27,20:19,21:22,22:23,23:24,24:26,25:27};
const oldKeys=new Map(cafeteriaTemplate.pages.flatMap(page=>page.slots.map(name=>[`${page.number-1}-${name}`,{page:page.number,name}])));
function stableId(value){
 return [2166136261,2246822507,3266489909,668265263].map(seed=>{let h=seed;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16).padStart(8,'0');}).join('');
}
export function migrateSingleImageDraft(draft={},layoutId){
 if(draft.layoutId===singleImageLayoutId)return reconcileUnplacedImages(draft);
 const images={},moves=[],edits={},provenance={},oldEdits={},oldProvenance={};
 const entries=Object.entries(draft.images||{});
 for(const [key,data] of entries)if(key.startsWith('__unplaced__')||oldKeys.get(key)?.page<=11)images[key]=data;
 // Ascending old slide/slot order determines which image occupies a single slot.
 const rank=new Map([...oldKeys.keys()].map((key,i)=>[key,i]));
 for(const [key,data] of entries.filter(([key])=>!Object.hasOwn(images,key)).sort((a,b)=>(rank.get(a[0])??Infinity)-(rank.get(b[0])??Infinity))){
  const old=oldKeys.get(key),page=singleImagePages[(oldToNew[old?.page]||0)-1];
  let target=page?`${page.number-1}-${page.slots[0]}`:null;
  const reason=target&&!Object.hasOwn(images,target)?'按图意迁移':target?'同主题多图保留':'无明确对应图位';
  if(!target||Object.hasOwn(images,target)){
   let salt=0;do{target=`__unplaced__${stableId(key+':'+salt++)}__旧第${old?.page||'?'}页 ${old?.name||key}`;}while(Object.hasOwn(images,target));
  }
  images[target]=data;moves.push({from:key,to:target,reason});
 }
 for(const [key,value] of Object.entries(draft.edits||{}))(/^(?:cafeteria-v1):(\d+):/.test(key)&&Number(key.split(':')[1])>=12?oldEdits:edits)[key]=value;
 for(const [key,value] of Object.entries(draft.provenance||{}))(/^(?:cafeteria-v1):(\d+):/.test(key)&&Number(key.split(':')[1])>=12?oldProvenance:provenance)[key]=value;
 return reconcileUnplacedImages({...draft,layoutId:singleImageLayoutId,edits,provenance,images,layoutMigration:{from:'cafeteria-v1-25',to:singleImageLayoutId,moves,oldEdits,oldProvenance}});
}

export function reportImageTargets(images={}){
 return singleImagePages.flatMap(page=>page.slots.map(name=>({key:`${page.number-1}-${name}`,aliases:[name,...(page.aliases||[]),...(page.slots.length===1?[page.title]:[])],occupied:Object.hasOwn(images,`${page.number-1}-${name}`)})));
}
export function reconcileUnplacedImages(draft={}){
 const images={...(draft.images||{})},moves=[];
 const candidates=Object.keys(images).filter(key=>key.startsWith('__unplaced__')&&key.length>46).map(key=>({key,name:key.slice(46)}));
 // A migrated old slide/slot label is not an original filename. Its deliberately
 // ambiguous legacy mapping must not be overridden by recurring name matching.
 const originals=candidates.filter(file=>!/^旧第(?:\d+|\?)页 /.test(file.name));
 for(const plan of matchImageFiles(originals,reportImageTargets(images),{aliases:reportImageAliases,suffix:true})){
  if(!plan.target||plan.reason||Object.hasOwn(images,plan.target.key))continue;
  images[plan.target.key]=images[plan.file.key];delete images[plan.file.key];moves.push({from:plan.file.key,to:plan.target.key,reason:'按专业楼层及图意匹配'});
 }
 if(!moves.length)return draft;
 return {...draft,images,imageMatches:[...(draft.imageMatches||[]),...moves]};
}
