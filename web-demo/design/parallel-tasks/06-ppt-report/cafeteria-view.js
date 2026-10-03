const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const geometry=b=>`left:${b[0]/12.8}%;top:${b[1]/7.2}%;width:${b[2]/12.8}%;height:${b[3]/7.2}%;`;
const font=s=>`font-family:${esc(s.font)},SimSun,serif;font-size:${s.size/12.8}cqw;font-weight:${s.bold?'700':'400'};color:${s.color};text-align:${s.align};`;
export function cafeteriaHTML(page,imageSlot){
  const shapes=page.shapes.map(s=>{
    if(s.kind==='image')return `<div class="caf-shape caf-image" style="${geometry(s.box)}">${imageSlot(s.name)}</div>`;
    if(s.kind==='text')return `<div class="caf-shape caf-text ${s.linked?'caf-linked':''}" style="${geometry(s.box)}${font(s.style)}" ${s.editable?'contenteditable="true"':''} data-edit-id="${s.editId}" ${s.ai?'data-ai="true"':''}>${esc(s.text)}</div>`;
    const tableHeight=s.heights.reduce((a,b)=>a+b,0);
    return `<table class="caf-shape caf-table" data-native-table="${s.id}" style="${geometry([s.box[0],s.box[1],s.box[2],tableHeight])}"><colgroup>${s.cols.map(w=>`<col style="width:${w/s.box[2]*100}%">`).join('')}</colgroup><tbody>${s.rows.map((r,i)=>`<tr style="height:${s.heights[i]/tableHeight*100}%">${r.filter(c=>!c.skip).map(c=>`<td colspan="${c.colSpan}" rowspan="${c.rowSpan}" style="${font(c.style)}${c.fill?'background:#'+c.fill+';':''}" class="${c.linked?'caf-linked':''}" data-edit-id="${c.editId}" ${c.editable?'contenteditable="true"':''}>${esc(c.text)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
  return `<div class="caf-page">${page.number<3?'<div class="caf-band"></div>':page.number>=7?'<div class="caf-redline"></div>':''}${shapes}</div>`;
}
