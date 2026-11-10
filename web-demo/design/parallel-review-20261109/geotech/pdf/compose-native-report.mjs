// Native PDF blocks enter the existing document composer. OCR remains a separate
// review artifact until its values/identifiers have been checked against images.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fragments} from '../../../../intake-core.js';
import {composeDocument} from '../../../../document-intake.js';
import {restoreHorizontalContinuations} from './horizontal-continuation.mjs';
import {attachOcrCharts} from './attach-ocr-charts.mjs';
import {attachNativeImages} from './attach-native-images.mjs';
import {auditTextGlyphs} from './audit-text-glyphs.mjs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function nativeReportSource(input,{expectedHash,supplement,imageSupplement}={}){
 if(!/^[a-f0-9]{64}$/.test(expectedHash||'')||input?.sha256!==expectedHash)throw new Error('PDF source hash mismatch');
 if(!Array.isArray(input.pages)||!input.pages.length||input.pageCount!==input.pages.length||input.pages.some((p,i)=>p.page!==i+1||!Array.isArray(p.blocks)||!['native','ocr_pending'].includes(p.method)))throw new Error('Incomplete or invalid PDF page inventory');
 const report=structuredClone(input);
 const blocks={paras:[],paragraphMeta:[],tables:[],tableMeta:[],ordered:[],images:[],warnings:[]};
 const repeated=new Map();
 for(const page of report.pages)for(const b of page.blocks.filter(b=>b.kind==='paragraph')){
  if(b.text.length<120&&(b.bbox[3]<page.height*.12||b.bbox[1]>page.height*.9)){const key=b.text.replace(/\d+/g,'#');repeated.set(key,(repeated.get(key)||0)+1);}
 }
 const excludedHeaders=[],textReview=[];
 for(const page of report.pages)for(const b of restoreHorizontalContinuations(page.blocks)){
  if(b.kind==='paragraph'){
   const numberedHeader=b.text.replace(/\s/g,'').match(/共(\d+)页第(\d+)页$/);
   if(b.bbox[3]<page.height*.12&&numberedHeader&&Number(numberedHeader[1])===report.pageCount&&Number(numberedHeader[2])===page.page){excludedHeaders.push({page:page.page,text:b.text,reason:'matching-page-inventory-header'});continue;}
   if(b.bbox[1]>page.height*.85&&/^(?:第\s*)?\d+\s*页(?:\s*共\s*\d+\s*页)?$/.test(b.text)){excludedHeaders.push({page:page.page,text:b.text});continue;}
   if((b.bbox[3]<page.height*.12||b.bbox[1]>page.height*.9)&&(repeated.get(b.text.replace(/\d+/g,'#'))||0)>=3){excludedHeaders.push({page:page.page,text:b.text});continue;}
   const index=blocks.paras.length;blocks.paras.push(b.text);blocks.paragraphMeta.push({page:page.page,bbox:b.bbox,column:b.column,method:'native',...(page.orientation?{orientation:page.orientation,sourceBBox:b.sourceBBox,coordinateSpace:b.coordinateSpace}:{})});blocks.ordered.push({type:'p',index});
   const glyphReview=auditTextGlyphs(b.text);
   if(glyphReview){
    blocks.paragraphMeta[index].textReview=glyphReview;
    textReview.push({paragraph:index,page:page.page,bbox:b.bbox,...glyphReview});
   }
  }else if(b.kind==='table'){
   const index=blocks.tables.length,previous=blocks.ordered.at(-1),prior=previous?.type==='table'?blocks.tableMeta[previous.index]:null;
   const nextColumn=prior&&(prior.page===page.page&&b.column===prior.column+1||prior.page===page.page-1&&b.column===0&&prior.column===(prior.columnCount||1)-1);
   const continuation=nextColumn&&blocks.tables[previous.index][0]?.length===b.rows[0]?.length&&Math.abs((prior.bbox[2]-prior.bbox[0])-(b.bbox[2]-b.bbox[0]))<3;
   blocks.tables.push(b.rows);blocks.tableMeta.push({page:page.page,bbox:b.bbox,column:b.column,columnCount:page.columnSplit===null?1:2,method:'native',rawRows:b.rawRows,cellOrigins:b.cellOrigins,gridExpanded:b.gridExpanded,glyphReflowed:!!b.glyphReflowed,numericBoundaryWarnings:b.numericBoundaryWarnings||[],...(continuation?{continuationOf:previous.index}:{})});blocks.ordered.push({type:'table',index});
   if(b.numericBoundaryResolutions?.length)blocks.tableMeta[index].numericBoundaryResolutions=b.numericBoundaryResolutions;
   if(page.orientation)Object.assign(blocks.tableMeta[index],{orientation:page.orientation,sourceBBox:b.sourceBBox,coordinateSpace:b.coordinateSpace});
   if(b.sampleDepthVerification?.length)blocks.tableMeta[index].sampleDepthVerification=b.sampleDepthVerification;
   if(b.numericBoundaryWarnings?.length){
    const pending=b.cellOrigins?.some(row=>row.some(c=>c?.requiresReview));
    blocks.warnings.push(pending?`第${page.page}页提取表${index+1}存在跨单元格数字，未解决的冲突格留空待原页复核；原读取文字及坐标已保留。`:`第${page.page}页提取表${index+1}的跨格数字已按独立字形坐标及连续数值区字符守恒校验恢复；原读取文字及坐标已保留。`);
   }
   if(b.horizontalContinuation)Object.assign(blocks.tableMeta[index],{horizontalContinuation:true,sourceFragments:b.sourceFragments});
  }
 }
 const ocrPages=report.pages.filter(p=>p.method==='ocr_pending').map(p=>p.page);
 const mixedTextPages=report.pages.filter(p=>p.method==='ocr_pending'&&p.blocks.some(b=>b.kind==='paragraph')).map(p=>p.page);
 blocks.numericBoundaryAuditPages=report.pages.filter(p=>p.numericBoundaryAudited).map(p=>p.page);
 blocks.pageOrientations=report.pages.filter(p=>p.orientation).map(p=>({page:p.page,...p.orientation}));
 if(ocrPages.length)blocks.warnings.push('以下页的图片内容仍待OCR复核；已有文字层按来源保留，未将未审OCR结果编入正文：'+ocrPages.join('、'));
 blocks.pdfReadReport={pageCount:report.pageCount,nativePages:report.pageCount-ocrPages.length,ocrReviewPages:ocrPages,restoredTables:blocks.tables.length,ocrApplied:false,paragraphsReflowed:true,gridRulingMode:report.gridRulingMode||'unspecified',excludedHeaders,excludedMargins:report.pages.flatMap(p=>(p.excludedMargins||[]).map(m=>({page:p.page,...m})))};
 blocks.pdfReadReport.mixedTextPages=mixedTextPages;
 blocks.pdfReadReport.excludedNonprintingGlyphs=report.pages.flatMap(p=>(p.excludedNonprintingGlyphs||[]).map(g=>({page:p.page,...g})));
 blocks.pdfReadReport.textReview=textReview;
 blocks.pdfReadReport.unrestoredTablePages=report.pages.filter(p=>p.tableReviewRequired).map(p=>p.page);
 if(textReview.length)blocks.warnings.push('以下页的正文含未映射字形，原文和位置已保留，须对照原页核查；不能据文字层读取成功认定公式正确：'+[...new Set(textReview.map(r=>r.page))].join('、'));
 if(supplement)attachOcrCharts(blocks,report,supplement);
 if(imageSupplement)attachNativeImages(blocks,report,imageSupplement);
 const source={slot:'geo',name:report.name,source_id:'CURRENT-geo-'+report.sha256.slice(0,20),hash:report.sha256,blocks,fragments:fragments(blocks)};
 return source;
}

async function main(root){
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 const summaries=[];
 for(const item of manifest){
 const dir=join(root,item.id),report=JSON.parse(await readFile(join(dir,'native-report.json'),'utf8'));
 const expectedHash=createHash('sha256').update(await readFile(item.input)).digest('hex');
 let supplement;
 try{supplement=JSON.parse(await readFile(join(dir,'ocr-supplement.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const source=nativeReportSource(report,{expectedHash,supplement}),blocks=source.blocks,ocrPages=blocks.pdfReadReport.ocrReviewPages;
 const document=composeDocument([source]);
 await writeFile(join(dir,'native-source.json'),JSON.stringify(source));
 await writeFile(join(dir,'document.json'),JSON.stringify(document,null,2));
 await writeFile(join(dir,'bundle.json'),JSON.stringify({sources:[source],facts:[],unmapped:[],issues:blocks.warnings,confirmations:[]}));
 await writeFile(join(dir,'地勘自动整理.txt'),document.geotech.text+'\n\n'+document.foundation);
 summaries.push({id:item.id,paras:blocks.paras.length,nativeTables:blocks.tables.length,composedTables:document.geotech.tables.map(t=>({key:t.key,rows:t.rows.length})),sections:document.geotech.sections,ocrReviewPages:ocrPages});
}
await writeFile(join(root,'composition.json'),JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries.map(({sections,...s})=>s)));

}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main(process.argv[2]);
