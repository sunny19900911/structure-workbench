// Conservative matching shared by the native editor and the report composer.
export const imageName=value=>String(value||'').normalize('NFKC').replace(/\.(png|jpe?g|webp)$/i,'').replace(/[\s_\-—·.、()（）【】\[\]]/g,'').toLowerCase();
export function matchImageFiles(files,targets){
 const names=files.map(file=>imageName(file.name));
 const plans=files.map((file,index)=>{
  const name=names[index];
  if(names.filter(n=>n===name).length>1)return {file,reason:'同名图片'};
  const matches=targets.filter(t=>(t.aliases||[]).some(alias=>imageName(alias)===name));
  if(matches.length!==1)return {file,reason:matches.length?'匹配多个图位':'未匹配图位'};
  return {file,target:matches[0],reason:matches[0].occupied?'图位已有图片':''};
 });
 for(const plan of plans)if(plan.target&&plans.filter(p=>p.target?.key===plan.target.key).length>1)plan.reason='多张图片匹配同一图位';
 return plans;
}
export function nativeImageTargets(view){
 return view.slides.flatMap(slide=>{
  const slots=slide.shapes.filter(s=>s.imageSlot);
  return slots.map(shape=>({key:slide.number+':'+shape.id,slide:slide.number,shapeId:shape.id,occupied:shape.type==='pic',aliases:[shape.name,`${slide.number}-${shape.name}`,`${slide.title}-${shape.name}`,...(slots.length===1?[slide.title,shape.name.replace(/\s*·\s*图\d+$/,'')]:[])].filter(Boolean),name:shape.name,title:slide.title}));
 });
}
export async function readPptImage(file){
 if(!/^image\/(png|jpeg)$/.test(file.type)||file.size>1300000)throw Error(file.name+'：请选择小于 1.3 MB 的 PNG / JPEG 图片');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});
 const img=new Image();img.src=data;await img.decode();
 if(img.naturalWidth*img.naturalHeight>25000000)throw Error(file.name+'：图片像素过大');
 return {data,width:img.naturalWidth,height:img.naturalHeight};
}
