/* User-supplied GB 55001-2021 table 4.2.2 selection. No load-combination coefficients. */
(function(){
 const version='USER-LIVE-LOADS-20261003';
 const rows=[
  ['住宅、宿舍、旅馆、医院病房、托儿所、幼儿园','2.0'],
  ['办公楼、教室、医院门诊室','2.5'],
  ['食堂、餐厅、试验室、阅览室、会议室、一般资料档案室','3.0'],
  ['礼堂、剧场、影院、有固定座位看台、公共洗衣房','3.5'],
  ['商店、展览厅、车站、港口、机场大厅等','4.0'],
  ['健身房、演出舞台','4.5'],
  ['书库、档案库、储藏室（书架≤2.5m）','6.0'],
  ['密集柜书库','12.0'],
  ['通风机房、电梯机房','8.0'],
  ['厨房（餐厅）','4.0'],
  ['厨房（其他）','2.0'],
  ['浴室、卫生间、盥洗室','2.5'],
  ['走廊、门厅（教学楼及人员密集）','3.5'],
  ['楼梯（多层住宅）','2.0'],
  ['楼梯（其他）','3.5'],
  ['阳台（人员密集）','3.5'],
  ['阳台（其他）','2.5']
 ];
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const template=window.MeasureTemplate;
 const previous=template.sections.find(s=>s.includes('id="s1ch3_3"'));
 const rowHTML=(row,i)=>'<tr>'+[i+1,...row].map(v=>'<td class="ce" contenteditable="true">'+esc(v)+'</td>').join('')+'<td class="op"><button class="delbtn" data-wb-action="delete">删除</button></td></tr>';
 const controls='<button class="addbtn" data-wb-action="add">＋ 添加一行</button> <button class="addbtn" data-wb-action="renumber">一键重排序号</button>';
 const section='<h2 id="s1ch3_3">3.3 楼面均布活荷载</h2><div class="itbl" data-cols="3" data-floor-load-version="'+version+'" data-source-id="'+version+'"><table><tbody><tr><th>序号</th><th>类别</th><th>活荷载标准值（kN/m²）</th><th class="op">操作</th></tr>'+rows.map(rowHTML).join('')+'</tbody></table>'+controls+'</div>';
 template.sections=template.sections.map(s=>s===previous?section:s);
 template.paper=template.paper.replace(previous,section);
 function contents(table){return [...table.rows].slice(1).map(r=>[...r.cells].filter(c=>!c.classList.contains('op')).slice(1).map(c=>c.textContent.trim()));}
 function mergeRows(existing,defaults){
  if(JSON.stringify(existing)===JSON.stringify(defaults))return rows.map(r=>[...r]);
  // Keep bespoke project values and append missing categories only on first migration.
  const names=new Set(existing.map(r=>r[0]));
  return [...existing,...rows.filter(r=>!names.has(r[0]))];
 }
 function upgrade(html,signed=false){
  if(signed||!html)return html;
  const d=new DOMParser().parseFromString(html,'text/html'),h=d.getElementById('s1ch3_3');
  if(!h)return html;
  let box;for(let n=h.nextElementSibling;n&&!/^H[12]$/.test(n.tagName);n=n.nextElementSibling)if(n.matches('.itbl')){box=n;break;}
  if(!box||box.dataset.floorLoadVersion===version)return html;
  const original=new DOMParser().parseFromString(previous,'text/html').querySelector('table');
  const table=box.querySelector('table');if(!table)return html;
  const merged=mergeRows(contents(table),contents(original));
  const fresh=new DOMParser().parseFromString(section,'text/html').querySelector('.itbl');
  fresh.querySelector('tbody').innerHTML='<tr><th>序号</th><th>类别</th><th>活荷载标准值（kN/m²）</th><th class="op">操作</th></tr>'+merged.map(rowHTML).join('');
  box.replaceWith(fresh);
  return d.body.innerHTML;
 }
 function renumber(button){
  const table=button.closest('.itbl')?.querySelector('table');if(!table)return;
  let number=0;for(const row of table.rows){if(row.querySelector('th'))continue;const cell=row.querySelector('td:not(.op)');if(cell)cell.textContent=String(++number);}
 }
 window.FloorLiveLoads={version,rows,section,upgrade,renumber,mergeRows};
})();
