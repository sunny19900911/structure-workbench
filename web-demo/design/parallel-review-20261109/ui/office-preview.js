// Preview only: all content comes from an explicit saved file revision.
const element=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
const safeImage=value=>typeof value==='string'&&/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
export function renderOfficePreview(host,record,view){
 const preview=element('article');preview.className='office-saved-preview';
 preview.dataset.type=record.type;preview.dataset.revision=record.fileRevision;
 preview.append(element('h2',record.title),element('p','内容预览 · 已保存版本 '+record.fileRevision+' · 完整版式请下载原文件'));
 if(record.type==='docx'){
  const order=view.ordered?.length?view.ordered:(view.paras||[]).map((_,index)=>({type:'p',index}));
  for(const item of order){
   if(item.type==='p')preview.append(element('p',view.paras?.[item.index]??item.text??''));
   if(item.type==='table'){
    const table=element('table'),meta=view.tableMeta?.[item.index];let previous=new Map();
    if(meta?.rows?.length){for(const row of meta.rows){const tr=element('tr'),current=new Map();
     for(const cell of row.cells){const span=cell.span||1;
      if(cell.verticalMerge==='continue'&&previous.has(cell.column)){const td=previous.get(cell.column);td.rowSpan=(td.rowSpan||1)+1;for(let c=0;c<span;c++)current.set(cell.column+c,td);continue;}
      const td=element(row.header?'th':'td',cell.text);td.colSpan=span;tr.append(td);if(cell.verticalMerge)for(let c=0;c<span;c++)current.set(cell.column+c,td);
     }previous=current;table.append(tr);
    }}else for(const row of view.tables?.[item.index]||[]){const tr=element('tr');for(const cell of row)tr.append(element('td',cell));table.append(tr);}
    preview.append(table);
   }
  }
  for(const image of view.images||[])if(safeImage(image.data)){const figure=element('figure'),img=element('img');img.src=image.data;img.alt=image.caption||'文档图片';figure.append(img,element('figcaption',image.caption||''));preview.append(figure);}
 }else if(record.type==='pptx'){
  for(const slide of view.slides||[]){
   const section=element('section');section.append(element('h3','第 '+slide.number+' 页'));
   const canvas=element('div');canvas.className='office-preview-slide';
   if(slide.width>0&&slide.height>0){canvas.style.aspectRatio=slide.width+'/'+slide.height;
    if(/^#[\da-f]{6}$/i.test(slide.background))canvas.style.background=slide.background;
    for(const shape of slide.shapes||[]){if(!['x','y','width','height'].every(k=>Number.isFinite(shape[k])))continue;
     const box=element('div');box.className='office-preview-shape';
     for(const [css,key] of [['left','x'],['top','y'],['width','width'],['height','height']])box.style[css]=100*shape[key]/(['left','width'].includes(css)?slide.width:slide.height)+'%';
     if(safeImage(shape.imageDataUrl)){const img=element('img');img.src=shape.imageDataUrl;img.alt=shape.name||'幻灯片图片';box.append(img);}
     else{box.textContent=shape.text||'';box.style.fontSize=(shape.fontSize||18)*12700/slide.width*100+'cqw';box.style.fontWeight=shape.bold?'700':'400';box.style.fontStyle=shape.italic?'italic':'normal';if(/^#[\da-f]{6}$/i.test(shape.color))box.style.color=shape.color;box.style.textAlign=({l:'left',ctr:'center',r:'right',just:'justify'})[shape.align]||'left';}
     canvas.append(box);
    }
   }
   section.append(canvas);preview.append(section);
  }
 }
 host.replaceChildren(preview);
}
