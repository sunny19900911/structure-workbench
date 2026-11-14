import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),qa=join(root,'qa/portable-release/blackbox');
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{for(const port of [5452,5451,5460]){
 const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
 // UTF-8 matches the real workbench document; a license text navigation has no declared encoding.
 await page.route('**/__dependency-qa.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>依赖验证</title>'}));
 await page.goto('http://127.0.0.1:'+port+'/__dependency-qa.html');
 await page.addScriptTag({url:'/vendor/pdfjs-3.11.174/pdf.min.js'});
 const result=await page.evaluate(async bytes=>{
  pdfjsLib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs-3.11.174/pdf.worker.min.js';
  const document=await pdfjsLib.getDocument({data:Uint8Array.from(bytes),cMapUrl:'/vendor/pdfjs-3.11.174/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs-3.11.174/standard_fonts/'}).promise;
  const text=(await(await document.getPage(1)).getTextContent()).items.map(x=>x.str).join('');const result={version:pdfjsLib.version,pages:document.numPages,text};await document.destroy();return result;
 },[...await readFile(join(qa,'pdf-smoke.pdf'))]);
 assert.equal(result.version,'3.11.174');assert.equal(result.pages,2);assert.match(result.text,/123\.45/);
 await page.addScriptTag({url:'/vendor/xlsx-0.18.5/xlsx.full.min.js'});
 const spreadsheet=await page.evaluate(()=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['QA',123.45]]),'材料');const raw=XLSX.write(book,{type:'array',bookType:'xlsx'}),read=XLSX.read(raw,{type:'array'}),cell=read.Sheets[read.SheetNames[0]]?.B1;return {version:XLSX.version,sheetNames:read.SheetNames,type:cell?.t,value:cell?.v,encoding:document.characterSet};});assert.equal(spreadsheet.version,'0.18.5');assert.deepEqual(spreadsheet.sheetNames,['材料']);assert.equal(spreadsheet.type,'n');assert.equal(spreadsheet.value,123.45);
 results.push({port,...result,spreadsheet,network:'non-local blocked'});await page.close();
}await writeFile(join(qa,'pdf-runtime-result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}finally{await browser.close();}
