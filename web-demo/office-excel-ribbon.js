import {mountParameterMenu} from './office-excel-parameters.js';
// Functional ribbon based on observed online-spreadsheet control groups.
// No remote code, branding, account features, or placeholder commands.
export const RIBBON_TABS=['开始','插入','数据','公式','视图'];
const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=text;return e;};

export function mountExcelRibbon({tabs,tools,activeTab,onTab,run,selection,cellStyle,sheet,options,onError,parameters=()=>[],insertParameter}){
 const action=(name,args={})=>Promise.resolve().then(()=>run(name,args)).catch(onError);
 const button=(label,title,fn,className='')=>{const b=node('button',className,label);b.type='button';b.title=title||label;b.setAttribute('aria-label',title||label);b.onclick=()=>Promise.resolve().then(fn).catch(onError);return b;};
 const menu=(label,items)=>{const d=node('details','excel-dropdown'),s=node('summary','',label+' ▾'),panel=node('div','excel-dropdown-panel');d.append(s,panel);panel.append(...items);return d;};
 const choose=(label,entries,change,value='')=>{const select=node('select');select.setAttribute('aria-label',label);select.title=label;for(const [key,text] of entries)select.add(new Option(text,key));select.value=value;select.onchange=()=>Promise.resolve().then(()=>change(select.value)).catch(onError);return select;};
 const group=(label,...children)=>{const g=node('div','excel-ribbon-group'),content=node('div','excel-ribbon-controls');content.append(...children);g.append(content,node('span','excel-ribbon-caption',label));tools.append(g);return content;};
 const row=(...children)=>{const e=node('div','excel-ribbon-row');e.append(...children);return e;};
 const target=()=>({sheet:sheet().name,range:selection().range});
 const style=patch=>action('range.style',{...target(),style:patch});
 const toggle=(label,title,key)=>{const b=button(label,title,()=>style({[key]:!Boolean(cellStyle()[key])}),'excel-toggle');b.dataset.styleKey=key;b.setAttribute('aria-pressed',String(Boolean(cellStyle()[key])));return b;};
 const colored=(label,title,key,initial)=>{const wrap=node('label','excel-color-control'),input=node('input');input.type='color';input.value=initial||'#000000';input.setAttribute('aria-label',title);input.onchange=()=>style({[key]:input.value});wrap.title=title;wrap.append(node('span','',label),input);return wrap;};
 const number=()=>choose('数字格式',[['','数字格式'],['general','常规'],['integer','整数'],['decimal','两位小数'],['thousands','千分位'],['percent','百分比'],['scientific','科学计数'],['date','日期'],['text','文本']],v=>v&&action('range.format',{...target(),format:v}));
 const insertMenu=()=>menu('插入',[
  ...[['row.insert','向上插入行'],['column.insert','向左插入列'],['row.delete','删除选中行'],['column.delete','删除选中列']].map(([name,label])=>button(label,null,()=>{const s=selection();return action(name,{sheet:sheet().name,index:name.startsWith('row')?s.r1:s.c1,count:name.startsWith('row')?s.r2-s.r1+1:s.c2-s.c1+1});})),
  button('新增工作表',null,async()=>{const name=prompt('工作表名称');if(name){await run('sheet.add',{name});await run('sheet.select',{sheet:name});}}),
  button('重命名工作表',null,async()=>{const name=prompt('工作表名称',sheet().name);if(name)await run('sheet.rename',{sheet:sheet().name,name});}),
  button('删除当前工作表',null,()=>action('sheet.delete',{sheet:sheet().name}))
 ]);
 const freeze=()=>menu('冻结',[
  button('冻结首行',null,()=>action('sheet.freeze',{sheet:sheet().name,rows:1,columns:0})),
  button('冻结首列',null,()=>action('sheet.freeze',{sheet:sheet().name,rows:0,columns:1})),
  button('冻结到当前单元格',null,()=>action('sheet.freeze',{sheet:sheet().name,rows:selection().r1-1,columns:selection().c1-1})),
  button('取消冻结',null,()=>action('sheet.freeze',{sheet:sheet().name,rows:0,columns:0}))
 ]);
 const sum=()=>menu('Σ 求和', ['SUM','AVERAGE','MIN','MAX','COUNT'].map((fn,i)=>button(['求和','平均值','最小值','最大值','计数'][i],null,()=>action('selection.aggregate',{function:fn}))));
 const sorting=()=>menu('排序',[
  button('升序（保留首行标题）',null,()=>action('range.sort',{...target(),column:selection().c1,direction:'asc',header:true})),
  button('降序（保留首行标题）',null,()=>action('range.sort',{...target(),column:selection().c1,direction:'desc',header:true}))
 ]);
 const filter=()=>{const d=menu('筛选',[]),p=d.lastElementChild;const value=node('input');value.placeholder='筛选值';value.setAttribute('aria-label','筛选值');const op=choose('筛选条件',[['contains','包含'],['equal','等于'],['greaterThan','大于'],['lessThan','小于']],()=>{},'contains');const column=choose('筛选列',[],()=>{});d.ontoggle=()=>{if(!d.open)return;const s=selection(),previous=column.value;column.replaceChildren();for(let c=s.c1;c<=s.c2;c++){let label='',n=c;for(;n;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;column.add(new Option(label+' 列',String(c)));}if([...column.options].some(o=>o.value===previous))column.value=previous;};p.append(node('span','excel-menu-note','选区首行为标题'),column,op,value,
  button('应用筛选',null,()=>action('sheet.filter',{...target(),column:Number(column.value),operator:op.value,value:value.value})),
  button('清除筛选',null,()=>action('sheet.clearFilter',{sheet:sheet().name})));return d;};
 const conditional=()=>{const d=menu('条件格式',[]),p=d.lastElementChild;const op=choose('条件格式规则',[['greaterThan','大于'],['lessThan','小于'],['equal','等于']],()=>{},'greaterThan'),v=node('input');v.type='number';v.value='0';v.setAttribute('aria-label','条件格式数值');const color=node('input');color.type='color';color.value='#fff2cc';color.setAttribute('aria-label','条件格式颜色');p.append(op,v,color,button('应用规则',null,()=>action('range.conditional',{...target(),operator:op.value,value:Number(v.value),color:color.value})),button('清除选区规则',null,()=>action('range.clearConditional',target())));return d;};
 const find=()=>{const d=menu('查找替换',[]),p=d.lastElementChild,q=node('input'),replacement=node('input');q.placeholder='查找内容';q.setAttribute('aria-label','查找内容');replacement.placeholder='替换为';replacement.setAttribute('aria-label','替换为');p.append(q,replacement,button('查找下一处',null,()=>action('sheet.find',{sheet:sheet().name,text:q.value,after:selection().address})),button('替换选区文字',null,()=>action('range.replace',{...target(),find:q.value,replacement:replacement.value})));return d;};
 const sizes=()=>menu('行高列宽',[
  button('设置行高',null,()=>{const value=prompt('行高（磅，12–200）','24');if(value!==null)return action('row.height',{sheet:sheet().name,index:selection().r1,count:selection().r2-selection().r1+1,height:Number(value)});}),
  button('设置列宽',null,()=>{const value=prompt('列宽（字符宽度，4–80）','16');if(value!==null)return action('column.width',{sheet:sheet().name,index:selection().c1,count:selection().c2-selection().c1+1,width:Number(value)});})
 ]);
 const protect=()=>button(sheet().protected?'解除保护':'保护工作表',null,()=>action('sheet.protect',{sheet:sheet().name,enabled:!sheet().protected}));
 const tableStyles=()=>menu('表格样式',[...['blue','green','gray'].map((theme,i)=>button(['蓝色表头','绿色表头','灰色表头'][i],null,()=>action('range.tableStyle',{...target(),theme})))]);
 const clear=()=>menu('清除',[
  button('清除内容',null,()=>action('range.clear',target())),button('清除格式',null,()=>action('range.clearStyle',target())),button('清除条件格式',null,()=>action('range.clearConditional',target()))
 ]);
 const fonts=()=>{const f=choose('字体',[['','默认字体'],...['等线','微软雅黑','宋体','仿宋','Arial','Calibri','Times New Roman'].map(v=>[v,v])],font=>font&&style({font}),cellStyle().font||'');f.className='excel-font-select';return f;};
 const fontSize=()=>choose('字号',[['','字号'],...[8,9,10,11,12,14,16,18,20,24,28,36,48,72].map(v=>[String(v),String(v)])],v=>v&&style({fontSize:Number(v)}),String(cellStyle().fontSize||11));
 tabs.replaceChildren(...RIBBON_TABS.map(name=>{const b=button(name,null,()=>onTab(name),'excel-ribbon-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(name===activeTab));return b;}));tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Excel功能页签');
 tools.replaceChildren();tools.setAttribute('role','toolbar');tools.setAttribute('aria-label',activeTab);
 if(activeTab==='开始'){
  group('编辑',row(button('↶','撤销',()=>action('history.undo')),button('↷','重做',()=>action('history.redo'))),row(button('格式刷',null,()=>action('selection.formatPainter')),clear()));
  group('字体',row(fonts(),fontSize()),row(toggle('B','加粗','bold'),toggle('I','倾斜','italic'),toggle('U','下划线','underline'),toggle('S̶','删除线','strike'),colored('A','字体颜色','fontColor','#202124'),colored('▰','填充颜色','fillColor','#fff2cc')));
  group('样式',row(menu('边框',[...['all','outside','none'].map((border,i)=>button(['所有边框','外侧边框','无边框'][i],null,()=>style({border})))]),tableStyles()),row(conditional(),button('清除格式',null,()=>action('range.clearStyle',target()))));
  group('对齐',row(choose('水平对齐',[['','水平对齐'],['left','左对齐'],['center','居中'],['right','右对齐']],v=>v&&style({horizontal:v})),choose('垂直对齐',[['','垂直对齐'],['top','顶端'],['center','居中'],['bottom','底端']],v=>v&&style({vertical:v}))),row(toggle('换行','自动换行','wrapText'),menu('合并',[button('合并单元格',null,()=>action('range.merge',target())),button('取消合并',null,()=>action('range.unmerge',target()))])));
  group('数字',number(),row(button('%','百分比样式',()=>action('range.format',{...target(),format:'percent'})),button(',','千位分隔样式',()=>action('range.format',{...target(),format:'thousands'}))));
  group('数据',row(filter(),sorting()),row(freeze(),sum()));
  group('项目',mountParameterMenu({parameters,insert:insertParameter,onError}));
  group('操作',row(insertMenu(),protect()),row(find(),button('打印',null,()=>action('sheet.print',{sheet:sheet().name}))));
 }else if(activeTab==='插入'){
  group('表格结构',insertMenu(),sizes());group('单元格',button('合并单元格',null,()=>action('range.merge',target())),button('取消合并',null,()=>action('range.unmerge',target())));group('格式',tableStyles(),number());group('项目',mountParameterMenu({parameters,insert:insertParameter,onError}));
 }else if(activeTab==='数据'){
  group('整理数据',filter(),sorting());group('标记数据',conditional(),clear());group('工作表',freeze(),protect());group('查找',find());
 }else if(activeTab==='公式'){
  group('常用函数',sum(),button('IF 条件判断',null,()=>action('selection.formula',{formula:'=IF(A1>0,"是","否")'})));
  group('计算',button('重新计算',null,()=>action('workbook.recalculate')),button(options.showFormulas?'显示结果':'显示公式',null,()=>action('view.options',{showFormulas:!options.showFormulas})));
 }else{
  group('窗格',freeze(),sizes());group('显示',row(button(options.gridlines?'隐藏网格线':'显示网格线',null,()=>action('view.options',{gridlines:!options.gridlines})),button(options.showZeros?'隐藏零值':'显示零值',null,()=>action('view.options',{showZeros:!options.showZeros}))),row(button(options.highlight?'关闭行列高亮':'高亮所在行列',null,()=>action('view.options',{highlight:!options.highlight})),button(options.dark?'浅色显示':'深色显示',null,()=>action('view.options',{dark:!options.dark}))));
  group('缩放',choose('显示比例',[50,75,90,100,110,125,150,200].map(v=>[String(v),v+'%']),v=>action('view.options',{zoom:Number(v)}),String(options.zoom)));group('打印',button('打印工作表',null,()=>action('sheet.print',{sheet:sheet().name})));
 }
 return {sync(){for(const b of tools.querySelectorAll('[data-style-key]'))b.setAttribute('aria-pressed',String(Boolean(cellStyle()[b.dataset.styleKey])));}};
}
