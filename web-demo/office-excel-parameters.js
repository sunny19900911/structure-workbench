// Parameters are the generated workbook's own snapshot, never another project's state.
export function workbookParameters(view) {
 const sheet=view.sheets?.find(s=>s.name==='项目参数');
 if(!sheet)return [];
 const cells=new Map(sheet.cells.map(c=>[c.address,c]));
 if(cells.get('A2')?.text!=='参数'||cells.get('B2')?.text!=='取值')return [];
 return sheet.cells.filter(c=>/^A[3-9]$|^A\d{2,}$/.test(c.address)).map(c=>{
  const row=c.address.slice(1),value=cells.get('B'+row);
  return {id:c.address,name:c.text||'',value:value?.value??'',unit:cells.get('C'+row)?.text||'',available:!value?.calculationStatus||value.calculationStatus==='calculated'};
 }).filter(p=>p.name).sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
}

export function parameterInput(value,textFormat=false) {
 if(typeof value==='boolean')return value?'TRUE':'FALSE';
 const text=String(value??'');
 // Values that look like formulas, booleans or zero-padded identifiers stay literal.
 return !textFormat&&typeof value==='string'&&(/^[=']/.test(text)||/^0\d/.test(text)||/^(TRUE|FALSE)$/.test(text))?"'"+text:text;
}

export function mountParameterMenu({parameters,insert,onError}) {
 const menu=document.createElement('details');menu.className='excel-dropdown excel-parameters';
 const title=document.createElement('summary');title.textContent='参数 ▾';
 const panel=document.createElement('div');panel.className='excel-dropdown-panel';
 const note=document.createElement('span');note.className='excel-menu-note';note.textContent='当前文件的项目参数';
 const search=document.createElement('input');search.type='search';search.placeholder='搜索参数';search.setAttribute('aria-label','搜索参数');
 const list=document.createElement('select');list.size=6;list.setAttribute('aria-label','项目参数');
 const apply=document.createElement('button');apply.type='button';apply.textContent='插入选中参数';
 const fill=()=>{const previous=list.value,q=search.value.trim().toLocaleLowerCase();const items=parameters().filter(p=>[p.name,p.value,p.unit].join(' ').toLocaleLowerCase().includes(q));list.replaceChildren(...items.map(p=>{const o=new Option(p.name+'：'+String(p.value)+(p.unit?' '+p.unit:''),p.id);o.disabled=!p.available;return o;}));list.value=items.some(p=>p.id===previous&&p.available)?previous:items.find(p=>p.available)?.id||'';apply.disabled=!list.value;};
 search.oninput=fill;list.onchange=()=>{apply.disabled=!list.value;};
 menu.ontoggle=()=>{if(menu.open){fill();search.focus();}};
 apply.onclick=async()=>{apply.disabled=true;try{await insert(list.value);menu.open=false;}catch(e){onError(e);}finally{apply.disabled=!list.value;}};
 panel.append(note,search,list,apply);menu.append(title,panel);return menu;
}
