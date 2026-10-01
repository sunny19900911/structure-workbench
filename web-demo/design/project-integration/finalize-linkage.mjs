import {readFileSync,writeFileSync} from 'node:fs';
const update=(f,fn)=>writeFileSync(f,fn(readFileSync(f,'utf8')));
update('project-workspace.js',s=>s.replace("label:k,before:","label:document.querySelector('[data-k=\"'+k+'\"]')?.closest('.fld')?.querySelector('label')?.textContent||k,before:")
 .replace("sessionStorage.setItem('wb:active-project',id);","sessionStorage.setItem('wb:active-project',id);localStorage.setItem('wb:last-project',id);")
 .replace("if(data)await save();await list();","if(data)await save();else status(part.blocked?'恢复稿有版本冲突，请先下载备份':'已载入项目 · 修订 '+part.revision);await list();")
 .replace("||sessionStorage.getItem('wb:active-project');","||sessionStorage.getItem('wb:active-project')||localStorage.getItem('wb:last-project');"));
update('calculation-book.js',s=>s.replace("const current = Object.prototype.hasOwnProperty.call(editMap, cell.coordinate) ? editMap[cell.coordinate] : cell.display;","const current = cell.formula&&window.WorkbenchProjects?.mode!=='sample' ? '【导出时重算／宏表需复核】' : Object.prototype.hasOwnProperty.call(editMap, cell.coordinate) ? editMap[cell.coordinate] : cell.display;")
 .replace("state.textContent = `${data.used_range} · ${data.formula_count} 个公式`;","state.textContent = `参考模板 · ${data.used_range} · ${data.formula_count} 个公式（需核对本项目输入）`;")
 .replace("'黄色输入格可编辑；该宏表含自定义函数，公式格保留只读，导出时使用工作簿已有结果。'","'历史模板参考：该宏表含自定义函数，本页不能重算；导出仍使用模板已有结果，必须在Excel复算并核对后采用。'"));
update('workbuddy-integrated-studio.html',s=>s.replace('恢复样本目录','恢复通用目录').replace('封面母件原样保留；目录按四个固定大标题分组编辑','封面沿用母件版式，历史项目与人员信息在导出时替换；目录按四个固定大标题分组编辑')
 .replace('文件只用于本次生成，在本机转为 A3 Word，不写回原始资料。','文件随当前项目保存，在本机转为 A3 Word，不写回原始资料。')
 .replace("const o={_fmt:'workbench-project-snapshot/1'};","const o={_fmt:'workbench-project-snapshot/1',project_id:window.WorkbenchProjects?.id||null,parameter_version:window.WorkbenchProjects?.parameterVersion||0};")
 .replace("  return RCOUT;","  window.WorkbenchProjects?.contentChanged('模型批次变更');\n  return RCOUT;")
 .replace("  STLAST=stCalc();","  STLAST=stCalc();window.WorkbenchProjects?.scheduleSave();"));
update('expansion-workbench.js',s=>s.replace("canSign(){return Boolean(state?.signed)||", "canSign(){return Boolean(state?.signed&&state.measuresVersion===window.WorkbenchProjects.parameterVersion)||")
 .replace("state.signed=null;changed('撤回签发');","state.signed=null;syncParams();changed('撤回签发');"));
update('design/parallel-tasks/06-ppt-report/prototype.js',s=>s.replace('saveDraft();','saveDraft().catch(()=>{});').replace('await saveDraft().catch(()=>{});','await saveDraft();'));
