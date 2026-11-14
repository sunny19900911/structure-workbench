// Conservative matching shared by the native editor and the report composer.
export const imageName=value=>String(value||'').normalize('NFKC').replace(/\.(png|jpe?g|webp)$/i,'').replace(/[\s_\-—·.、()（）【】\[\]]/g,'').toLowerCase();
export function matchImageFiles(files,targets,{aliases=file=>[imageName(file.name)],suffix=false}={}){
 const names=files.map(file=>imageName(file.name));
 const plans=files.map((file,index)=>{
  const name=names[index];
  if(names.filter(n=>n===name).length>1)return {file,reason:'同名图片'};
  const candidates=aliases(file).map(imageName);
  const matches=targets.filter(t=>(t.aliases||[]).flatMap(name=>aliases({name})).map(imageName).some(alias=>candidates.some(candidate=>candidate===alias||(suffix&&alias.length>=5&&candidate.endsWith(alias)))));
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
function floorNumber(raw){
 if(/^\d+$/.test(raw))return String(Number(raw));
 const digits={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
 if(digits[raw])return String(digits[raw]);
 const tens=raw.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
 return tens?String((digits[tens[1]]||1)*10+(digits[tens[2]]||0)):null;
}
export function reportImageAliases(file){
 const name=String(file.name||'').normalize('NFKC').replace(/^\d+[_\s-]+/,'').replace(/_历史汇报(?=\.[^.]+$)/,'');
 const value=imageName(name),domains=[...new Set(value.match(/建筑|结构/g)||[])];
 const rawFloors=[...value.matchAll(/地下(?:室)?([一二三四五六七八九十\d]+)层|负([一二三四五六七八九十\d]+)层|b([1-9]\d*)(?!\d)|首层|小屋(?:面|顶)(?:层)?|屋(?:面|顶)(?:层)?|([一二三四五六七八九十\d]+)层/gi)];
 const floors=rawFloors.map(m=>m[1]||m[2]?'B'+floorNumber(m[1]||m[2]):m[3]?'B'+m[3]:m[4]?floorNumber(m[4]):m[0]==='首层'?'首层':m[0].startsWith('小屋')?'小屋面层':'屋面层');
 // Combined floors/topics are intentionally not narrowed to a convenient available slot.
 if(domains.length>1||new Set(floors).size>1||floors.some(f=>!f||f==='Bnull')||/[一二三四五六七八九十\d]+[、及和与至~～-][一二三四五六七八九十\d]+层/.test(name))return [];
 if(/地下/.test(value)&&!floors.some(f=>/^B/.test(f)))return [];
 const pile=/桩/.test(value),foundation=/基础/.test(value);
 if(pile&&foundation)return [];
 const model=/(?:yjk|盈建科).*模型|(?:总体|整体)结构模型|结构(?:总体|整体)模型/i.test(value);
 if(model)return floors.length||/局部|节点/.test(value)||domains.includes('建筑')?[]:['@ppt:model:global'];
 if(floors.length&&domains.length===1&&/平面|布置/.test(value)){
  return [`@ppt:plan:${domains[0]}:${floors[0]}`];
 }
 if(!floors.length&&/平面|布置|桩位/.test(value)){
  if(foundation&&!domains.includes('建筑'))return ['@ppt:foundation'];
  if(pile&&!domains.includes('建筑'))return ['@ppt:pile'];
 }
 return [name];
}
export async function readPptImage(file,{maxBytes=1300000,timeoutMs=15000}={}){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>maxBytes)throw Error('请选择不超过 '+(maxBytes/1024/1024).toFixed(1)+' MB 的 PNG / JPEG / WebP 图片');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();let timer;const finish=(fn,value)=>{clearTimeout(timer);r.onload=r.onerror=r.onabort=null;fn(value);};r.onload=()=>finish(resolve,r.result);r.onerror=()=>finish(reject,Error('图片读取失败'));r.onabort=()=>finish(reject,Error('图片读取已取消'));timer=setTimeout(()=>{finish(reject,Error('图片读取超时'));r.abort();},timeoutMs);r.readAsDataURL(file);});
 const img=new Image();img.src=data;let timer;
 try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('图片解码超时')),timeoutMs);})]);}catch(e){img.src='';throw Error(e.message||'图片无法解码');}finally{clearTimeout(timer);}
 if(img.naturalWidth*img.naturalHeight>25000000)throw Error(file.name+'：图片像素过大');
 return {data,width:img.naturalWidth,height:img.naturalHeight};
}
