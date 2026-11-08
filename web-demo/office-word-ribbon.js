// UI-only ribbon. Document mutations continue through office-editor.executeCommand.
const paths={
 document:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
 undo:'<path d="m7 4-4 4 4 4M3 8h11a6 6 0 0 1 0 12H9"/>',
 redo:'<path d="m17 4 4 4-4 4M21 8H10a6 6 0 0 0 0 12h5"/>',
 plus:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 table:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-6 4 4 3-5 5 7"/>',
 alignLeft:'<path d="M3 4h18M3 9h12M3 14h18M3 19h12"/>',
 alignCenter:'<path d="M3 4h18M6 9h12M3 14h18M6 19h12"/>',
 alignRight:'<path d="M3 4h18M9 9h12M3 14h18M9 19h12"/>',
 alignJustify:'<path d="M3 4h18M3 9h18M3 14h18M3 19h18"/>',
 listBullet:'<path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r=".7"/><circle cx="3" cy="12" r=".7"/><circle cx="3" cy="19" r=".7"/>',
 listNumber:'<path d="M9 5h12M9 12h12M9 19h12M2 3h2v5M2 11c3-2 4 1 0 4h3M2 18h3l-2 2h2v2H2"/>',
 indent:'<path d="M3 4h18M10 9h11M10 14h11M3 20h18m-17-12 4 4-4 4"/>',
 outdent:'<path d="M3 4h18M10 9h11M10 14h11M3 20h18M6 8l-4 4 4 4"/>',
 highlight:'<path d="m14 3 6 5-8 10-6-5zM6 13l-2 5 4 2 4-2M3 22h12"/>'
};
export function mountWordRibbon({zoom}){
 document.querySelectorAll('[data-icon]').forEach(element=>{const path=paths[element.dataset.icon];if(path)element.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';});
 const tabs=[...document.querySelectorAll('[data-tab]')],menus=[...document.querySelectorAll('.ribbon-menu')];
 function closeMenus(){menus.forEach(menu=>{menu.open=false;});}
 function chooseTab(tab){
  closeMenus();tabs.forEach(item=>{const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;});
  document.querySelectorAll('[data-panels]').forEach(group=>{group.hidden=!group.dataset.panels.split(' ').includes(tab.dataset.tab);});
  document.getElementById('office-ribbon').setAttribute('aria-labelledby',tab.id);
 }
 tabs.forEach((tab,index)=>{tab.onclick=()=>chooseTab(tab);tab.onkeydown=event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;chooseTab(tabs[next]);tabs[next].focus();};});
 menus.forEach(menu=>menu.addEventListener('toggle',()=>{
  if(!menu.open)return;menus.filter(item=>item!==menu).forEach(item=>{item.open=false;});
  const rect=menu.querySelector('summary').getBoundingClientRect(),panel=menu.querySelector('.ribbon-popover');
  panel.style.top=Math.min(rect.bottom+8,window.innerHeight-panel.offsetHeight-12)+'px';
  panel.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-panel.offsetWidth-12))+'px';
 }));
 document.addEventListener('pointerdown',event=>{if(!event.target.closest('.ribbon-menu'))closeMenus();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=menus.find(menu=>menu.open);closeMenus();open?.querySelector('summary').focus();}});
 window.addEventListener('resize',closeMenus);
 document.querySelectorAll('[data-insert]').forEach(button=>{button.onmousedown=event=>event.preventDefault();button.onclick=()=>document.getElementById('office-'+button.dataset.insert).click();});
 document.querySelectorAll('[data-zoom]').forEach(button=>{button.onclick=()=>zoom(button.dataset.zoom);});
 document.querySelectorAll('.color-tool input').forEach(input=>input.addEventListener('input',()=>input.parentElement.style.setProperty('--swatch',input.value)));
 document.querySelectorAll('.insert-popover button').forEach(button=>button.addEventListener('click',closeMenus));
}

export function syncRibbonSelection(editor){
 for(const [name,mark] of [['format.bold','bold'],['format.italic','italic'],['format.underline','underline'],['format.strike','strike']]){
  document.querySelector('[data-command="'+name+'"]')?.setAttribute('aria-pressed',String(editor.isActive(mark)));
 }
}
