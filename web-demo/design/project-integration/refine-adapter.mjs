import {readFileSync,writeFileSync} from 'node:fs';
let s=readFileSync('project-legacy-adapter.js','utf8');
s=s.replace('parameters:wbMeasureSnapshot().params,','parameters:wbMeasureSnapshot().params,spec:specCapture(),');
const a=s.indexOf('function blank(name){'),b=s.indexOf('const p=Object.fromEntries',a);
s=s.slice(0,a)+'function blank(name){'+s.slice(b);
s=s.replace('paper:d.body.innerHTML,model:null','paper:genericPaper(),spec:{rows:\'\',text:\'\'},model:null');
s=s.replace("paper.innerHTML=safePaper(s.paper||blank('未命名项目').paper);",`paper.innerHTML=safePaper(s.paper||genericPaper());
  const spec=document.querySelector('#spec-itbl tbody');if(spec)spec.innerHTML=safePaper('<table><tbody>'+(s.spec?.rows||'')+'</tbody></table>');
  if(spec){const nested=spec.querySelector('tbody');if(nested)spec.innerHTML=nested.innerHTML;}
  const text=document.getElementById('spec-ta');if(text)text.value=s.spec?.text||'';
  ['specprev','spec-sum','spec-out','spec-ledger'].forEach(id=>document.getElementById(id)?.replaceChildren());
  ['st-yjk','st-bldg','st-geo'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='当前项目资料见②来源清单';});`);
// Sanitizing a fragment containing tr directly would lose its cells; preserve the table context.
s=s.replace("rows:t?safePaper(t.innerHTML):''","rows:t?safePaper('<table><tbody>'+t.innerHTML+'</tbody></table>'):''");
s=s.replace("spec.innerHTML=safePaper('<table><tbody>'+(s.spec?.rows||'')+'</tbody></table>')","spec.innerHTML=safePaper(s.spec?.rows||'')");
s=s.replace(" const oldGo=window.goStage;",` document.querySelector('#spec-itbl')?.addEventListener('click',e=>{const b=e.target.closest('[data-wb-action]');if(b?.dataset.wbAction==='delete')delRow(b);window.WorkbenchProjects?.scheduleSave();});
 const oldGo=window.goStage;`);
writeFileSync('project-legacy-adapter.js',s);
let h=readFileSync('workbuddy-integrated-studio.html','utf8');
h=h.replace("+CARDS.length+'</b><br>'","+CARDS.filter(c=>c.id!=='c7'&&c.id!=='c8').length+'</b><br>'");
h=h.replace('（本项目属扭转不规则，取是）','（是否适用由当前项目模型和布置确定）').replace('（本措施默认 1.4）','（应按当前项目确认）').replace('①为唯一编辑入口；⑦据此选择604的10个母件，待确认不等于“无”','①为唯一编辑入口；待确认不等于“无”');
writeFileSync('workbuddy-integrated-studio.html',h);
