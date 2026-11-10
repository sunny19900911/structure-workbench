// Supplementary extracted source data. These charts are not design selections
// and never clear unresolved-page markers or overwrite native report text.
export function attachOcrCharts(blocks,report,supplement){
 if(supplement.schemaVersion!==1||supplement.sourcePDFSha256!==report.sha256)throw new Error('OCR supplement belongs to another PDF version');
 if(!Array.isArray(supplement.charts)||!Array.isArray(supplement.completePages)||supplement.completePages.length)throw new Error('Unsupported OCR completion claim');
 const seen=new Set(),charts=[];
 for(const chart of supplement.charts){
  if(chart.sourcePDFSha256!==report.sha256||!report.pages.some(p=>p.page===chart.page)||chart.pageComplete!==false||chart.automaticAdoption!==false)throw new Error('Invalid OCR source or scope');
  if(chart.scope!=='wave-chart-layer-results'||!/^\w+\d+$/.test(chart.identity?.borehole||'')||!Array.isArray(chart.rows)||!chart.rows.length)throw new Error('Unsupported OCR chart');
  if(chart.columns?.join('|')!=='序号|地层名称|深度(m)|厚度(m)|层速度(m/s)'||Object.keys(chart.identityUnits||{}).length)throw new Error('Unverified OCR units');
  if(!/^[a-f0-9]{64}$/.test(chart.sourceImageSha256)||!['identityEvidence','headerEvidence','layerEvidence'].every(k=>/^[a-f0-9]{64}$/.test(chart.evidenceHashes?.[k]||'')))throw new Error('Missing OCR evidence hashes');
  if(!Array.isArray(chart.pixelBoxes)||!chart.pixelBoxes.length||!Array.isArray(chart.sourceImageSize)||chart.sourceImageSize.length!==2)throw new Error('Missing OCR geometry');
  for(const box of chart.pixelBoxes){const [x0,y0,x1,y1]=box;if(box.length!==4||!box.every(Number.isFinite)||!(0<=x0&&x0<x1&&x1<=chart.sourceImageSize[0]&&0<=y0&&y0<y1&&y1<=chart.sourceImageSize[1]))throw new Error('Invalid OCR geometry');}
  for(const [i,row] of chart.rows.entries())if(row.length!==5||row[0]!==String(i+1)||!row[1]||!row.slice(2).every(v=>/^\d+(?:\.\d+)?$/.test(v)))throw new Error('Unresolved OCR layer');
  const key=JSON.stringify([chart.page,chart.pixelBoxes]);if(seen.has(key))throw new Error('Duplicate OCR region');seen.add(key);
  charts.push({...structuredClone(chart),locator:`PDF第${chart.page}页 ${chart.identity.borehole}波速柱状图`,sourceKind:'ocr-chart'});
 }
 blocks.ocrCharts=charts;
 blocks.pdfReadReport={...blocks.pdfReadReport,ocrApplied:charts.length>0,ocrScope:'selected-charts-only',ocrCompletePages:[],ocrChartPages:[...new Set(charts.map(c=>c.page))].sort((a,b)=>a-b),ocrChartCount:charts.length};
 if(charts.length)blocks.warnings.push(`已附${charts.length}张OCR柱状图来源数据；只覆盖图中选定字段，未自动采用参数，原待核页状态保留。`);
 return blocks;
}
