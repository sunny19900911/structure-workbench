import {showWordParameters} from './office-word-parameters.js';
// Tencent professional-ribbon interaction model; all writes use executeCommand.
const $=id=>document.getElementById(id);
const button=(label,action,icon='')=>`<button class="workspace-tool" data-action="${action}"><span aria-hidden="true">${icon}</span>${label}</button>`;
const group=(panels,caption,body)=>`<div class="ribbon-group extended-group" data-panels="${panels}" ${panels.includes('home')?'':'hidden'}><div class="tool-row">${body}</div><span class="group-caption">${caption}</span></div>`;
export function buildWordWorkspace(){
 const view=$('tab-view');for(const [id,label] of [['page','页面'],['reference','引用'],['review','审阅']]){const b=document.createElement('button');b.type='button';b.role='tab';b.id='tab-'+id;b.dataset.tab=id;b.setAttribute('aria-controls','office-ribbon');b.setAttribute('aria-selected','false');b.tabIndex=-1;b.textContent=label;view.before(b);}
 const tabs=document.querySelector('.office-tabs');tabs.insertAdjacentHTML('afterend','<div class="ribbon-utilities"><button data-action="parameters">参数</button><button data-action="search" title="查找替换 Ctrl+H">查找替换</button><select id="ribbon-mode" aria-label="工具栏显示"><option value="full">专业工具栏</option><option value="compact">简约工具栏</option><option value="hidden">隐藏工具栏</option></select></div>');
 document.querySelector('.ribbon-scroll').insertAdjacentHTML('beforeend',
  group('home','字体工具',button('增大字号','format.grow','A⁺')+button('减小字号','format.shrink','A⁻')+button('清除格式','format.clear','A⌫')+button('上标','format.superscript','x²')+button('下标','format.subscript','x₂'))+
  group('home','编辑',button('查找替换','search','⌕')+button('大纲','outline','☷'))+
  group('insert','链接与分隔符',button('链接','link','↗')+button('取消链接','link.remove','↙')+button('分页符','insert.pageBreak','▤')+button('换行符','insert.lineBreak','↵')+button('分隔线','insert.rule','━'))+
  group('page','页面布局',button('页面大小与方向','page.setup','▱')+button('页边距','page.margins','▣')+button('分栏','page.columns','▥'))+
  group('page','页眉页脚',button('页眉页脚距离','page.headerDistance','▤')+button('分页符','insert.pageBreak','↵'))+
  group('page view','导航',button('大纲','outline','☷')+button('查找替换','search','⌕'))+
  group('reference','目录',button('插入目录','toc.insert','☷')+button('更新目录','toc.update','↻'))+
  group('reference insert','注释',button('插入脚注','footnote','¹')+button('查看注释','notes','☰'))+
  group('review','修订',button('修订模式','tracking','✎')+button('修订所选文字','review.replace','✐'))+
  group('review','处理修订',button('接受所选修订','review.accept','✓')+button('拒绝所选修订','review.reject','×')+button('接受全部修订','review.acceptAll','✓✓')+button('拒绝全部修订','review.rejectAll','××'))+
  group('review','批注',button('新建批注','comment','▤')+button('查看批注','comments','☰'))+
  group('review','文档统计',button('字数统计','stats','字')+button('修订列表','changes','☰'))+
  group('view','工作区',button('全屏模式','fullscreen','⛶')+button('专注阅读','focus','▣')+button('字数统计','stats','字')));
 $('office-table-tools').insertAdjacentHTML('beforeend',button('合并单元格','table.merge')+button('拆分单元格','table.split')+button('标题行','table.header')+button('单元格底色','table.background')+button('删除表格','table.delete'));
 document.body.insertAdjacentHTML('beforeend','<aside id="word-sidepanel" hidden aria-label="文档导航"><header><strong id="word-panel-title"></strong><button id="word-panel-close" aria-label="关闭侧栏">×</button></header><div id="word-panel-body"></div></aside><footer class="word-statusbar"><button data-action="outline">大纲</button><button data-action="stats" id="word-count">字数统计</button><span>本机文档</span><button data-action="focus">专注阅读</button><button data-zoom="100">100%</button></footer><dialog id="word-dialog"><form id="word-dialog-form"><h2 id="word-dialog-title"></h2><div id="word-dialog-fields"></div><p id="word-dialog-error" role="alert"></p><div class="dialog-actions"><button type="button" id="word-dialog-cancel">取消</button><button type="submit">应用</button></div></form></dialog>');
}
function ask(title,fields){
 const dialog=$('word-dialog'),container=$('word-dialog-fields');$('word-dialog-title').textContent=title;$('word-dialog-error').textContent='';container.replaceChildren();
 for(const field of fields){const label=document.createElement('label');label.textContent=field.label;const input=document.createElement(field.options?'select':field.multiline?'textarea':'input');input.name=field.name;if(field.options)for(const [value,text] of field.options)input.add(new Option(text,value));else input.type=field.type||'text';input.value=field.value??'';if(field.min!=null)input.min=field.min;if(field.max!=null)input.max=field.max;if(field.type==='number')input.step='0.1';input.required=field.required!==false;if(field.change)input.onchange=()=>field.change(input.value,container);label.append(input);container.append(label);}
 dialog.showModal();return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;dialog.close();resolve(value);};dialog.oncancel=event=>{event.preventDefault();finish(null);};$('word-dialog-cancel').onclick=()=>finish(null);$('word-dialog-form').onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));for(const f of fields)if(f.type==='number')values[f.name]=Number(values[f.name]);finish(values);};});
}
export function mountWordWorkspace({getController,run,onError}){
 let tracking=false;
 const panel=(title)=>{$('word-sidepanel').hidden=false;$('word-panel-title').textContent=title;const body=$('word-panel-body');body.replaceChildren();return body;};
 $('word-panel-close').onclick=()=>{$('word-sidepanel').hidden=true;};
 function list(title,items,action){const body=panel(title);if(!items.length){body.textContent='暂无内容';return;}for(const item of items){const b=document.createElement(action?'button':'p');b.textContent=item.text||item.content||'(空白)';if(item.level)b.style.paddingLeft=(12+Math.min(8,item.level-1)*14)+'px';if(action)b.onclick=()=>action(item);body.append(b);}}
 function search(){const body=panel('查找和替换');body.innerHTML='<label>查找<input id="word-search" placeholder="输入要查找的文字"></label><label>替换为<input id="word-replacement" placeholder="输入替换文字"></label><div class="search-actions"><button id="word-find">查找</button><button id="word-replace-all">全部替换</button></div><p id="word-search-count" role="status"></p><div id="word-search-results"></div>';
  const find=()=>{const c=getController(),matches=c.find($('word-search').value),results=$('word-search-results');results.replaceChildren();$('word-search-count').textContent=`找到 ${matches.length} 处`;for(const item of matches.slice(0,200)){const b=document.createElement('button');b.textContent=item.text;b.onclick=()=>{const fresh=c.find($('word-search').value).find(m=>m.from===item.from&&m.text===item.text);if(fresh)c.selectRange(fresh);else find();};results.append(b);}};
  $('word-find').onclick=find;$('word-search').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();find();}};
  $('word-replace-all').onclick=async()=>{try{await run({name:'text.replaceAll',args:{search:$('word-search').value,text:$('word-replacement').value}});find();}catch{}};$('word-search').focus();
 }
 async function action(name){const c=getController();if(!c)return;
  if(name==='search')return search();
  if(name==='parameters')return showWordParameters(panel('项目参数'),{metadata:c.read().document,run,onError});
  if(name==='outline')return list('文档大纲',c.outline(),item=>c.selectRange({from:item.position,to:item.position}));
  if(name==='notes')return list('脚注',c.notes());
  if(name==='comments')return list('批注',c.comments());
  if(name==='changes')return list('修订列表',c.changes());
  if(name==='stats'){const s=c.statistics();return list('字数统计',[{text:`字符（不含空白）：${s.characters}`},{text:`英文单词：${s.words}`},{text:`段落：${s.paragraphs}`}]);}
  if(name==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();return;}
  if(name==='focus'){document.body.classList.toggle('word-focus');return;}
  if(name==='tracking'){tracking=!tracking;c.setReviewMode(tracking);document.querySelector('[data-action="tracking"]').setAttribute('aria-pressed',String(tracking));return;}
  if(name.startsWith('page.')){
   const sections=c.sections();if(!sections.length)throw Error('未找到文档节');const current=sections[0],fields=[{name:'sectionId',label:'应用于',value:current.address.sectionId,options:sections.map((s,i)=>[s.address.sectionId,`第 ${i+1} 节`])}];
   if(name==='page.setup')fields.push({name:'paper',label:'纸张',value:Math.max(current.pageSetup?.width||0,current.pageSetup?.height||0)>15?'A3':'A4',options:[['A4','A4 · 210 × 297 mm'],['A3','A3 · 297 × 420 mm'],['Letter','Letter · 215.9 × 279.4 mm']]},{name:'orientation',label:'方向',value:current.pageSetup?.orientation||'portrait',options:[['portrait','纵向'],['landscape','横向']]});
   if(name==='page.margins')for(const [key,label] of [['top','上'],['bottom','下'],['left','左'],['right','右']])fields.push({name:key,label:label+'边距（mm）',type:'number',value:Math.round((current.margins?.[key]??1)*254)/10,min:0,max:100});
   if(name==='page.columns')fields.push({name:'count',label:'栏数',value:String(current.columns?.count||1),options:[['1','一栏'],['2','两栏'],['3','三栏']]},{name:'gap',label:'栏间距（mm）',type:'number',value:Math.round((current.columns?.gap||.5)*254)/10,min:0,max:30});
   if(name==='page.headerDistance')for(const [key,label] of [['header','页眉距顶端'],['footer','页脚距底端']])fields.push({name:key,label:label+'（mm）',type:'number',value:Math.round((current.headerFooterMargins?.[key]||.5)*254)/10,min:0,max:50});
   fields[0].change=(id,container)=>{const s=sections.find(item=>item.address.sectionId===id),values={};if(name==='page.margins')for(const key of ['top','bottom','left','right'])values[key]=Math.round((s.margins?.[key]??1)*254)/10;if(name==='page.columns'){values.count=s.columns?.count||1;values.gap=Math.round((s.columns?.gap??.5)*254)/10;}if(name==='page.setup'){values.paper=Math.max(s.pageSetup?.width||0,s.pageSetup?.height||0)>15?'A3':'A4';values.orientation=s.pageSetup?.orientation||'portrait';}if(name==='page.headerDistance')for(const key of ['header','footer'])values[key]=Math.round((s.headerFooterMargins?.[key]??.5)*254)/10;for(const [key,value] of Object.entries(values))container.querySelector('[name='+key+']').value=value;};
   const args=await ask('页面设置',fields);if(args){if(args.count)args.count=Number(args.count);await run({name,args});}return;
  }
  const forms={comment:['新建批注',[{name:'content',label:'批注内容',multiline:true}],'comment.add'],link:['插入链接',[{name:'url',label:'网址',value:'https://'}],'link.set'],footnote:['插入脚注',[{name:'content',label:'脚注内容',multiline:true}],'note.insert'],endnote:['插入尾注',[{name:'content',label:'尾注内容',multiline:true}],'note.insert'],'review.replace':['修订所选文字',[{name:'text',label:'修改为',multiline:true}],'review.replace'],'table.background':['单元格底色',[{name:'color',label:'颜色',type:'color',value:'#e8efff'}],'table.background'],table:['插入表格',[{name:'rows',label:'行数',type:'number',value:3,min:1,max:50},{name:'columns',label:'列数',type:'number',value:3,min:1,max:20}],'table.insert']};
  if(forms[name]){const [title,fields,command]=forms[name],args=await ask(title,fields);if(args){if(name==='footnote'||name==='endnote')args.type=name;await run({name:command,args});}return;}
  await run({name});
 }
 document.querySelectorAll('[data-action]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>action(b.dataset.action).catch(onError);});
 $('office-table').onclick=()=>action('table').catch(onError);
 const mode=$('ribbon-mode');mode.onchange=()=>{document.body.dataset.ribbon=mode.value;};
 document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='F1'){e.preventDefault();mode.value=mode.value==='hidden'?'full':'hidden';mode.onchange();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='h'){e.preventDefault();search();}if(e.key==='Escape')document.body.classList.remove('word-focus');});
}
