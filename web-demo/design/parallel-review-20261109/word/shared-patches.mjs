// Exact integration edits for shared files. Applied to QA HTTP responses only in this tree.
export function patchSharedHTML(html) {
 const needle='  YJKRAW = R;';
 if(!html.includes(needle))throw Error('parseYJK 挂载位置已变化');
 return html.replace(needle,'  window.WorkbenchModelResults?.correctModelResults(R, files, log);\n'+needle)
  .replace("per.push(['T'+p.n, p.T, p.x, p.y, p.tor]);","per.push(['T'+p.n, p.T, ['('+p.x+' + '+p.y+')',2], p.tor]);")
  .replace('地震作用（X 向地震与双向地震包络）','地震作用（本向及本向双向地震）')
  .replace('alt="QS-324 原始计算书封面"','alt="已清除历史签名与注册章的计算书封面模板"')
  .replace('Word 封面与目录原件预览','Word 封面与目录模板预览');
}

export function patchCalculationAPI(source) {
 const needle="          company: String(body.company || '').slice(0, 200),";
 if(!source.includes(needle))throw Error('计算书 payload 挂载位置已变化');
 return source.replace(needle,needle+"\n          unit: String(body.unit || '').slice(0, 200),\n          software: String(body.software || '').slice(0, 200),");
}

export function patchOfficeEditor(source) {
 const needle='editor().commands.focus();';
 if(!source.includes(needle))throw Error('Word 选区 focus 挂载位置已变化');
 return source.replace(needle,'editor().view.focus();');
}
