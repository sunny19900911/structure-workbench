// Display one compact completion message; detailed evidence stays with sources.
export function sourceReview(blocks={}){
 const report=blocks.pdfReadReport||{};
 const pages=[...new Set([...(report.ocrReviewPages||[]),...(report.unrestoredTablePages||[]),
  ...(report.textReview||[]).map(p=>p.page),...(blocks.tableMeta||[]).filter(t=>t.cellOrigins?.some(r=>r.some(c=>c?.requiresReview))).map(t=>t.page)])]
  .filter(p=>Number.isInteger(p)&&p>0);
 return {pages,other:!pages.length&&!blocks.pdfReadReport&&!!blocks.warnings?.length};
}
export function completionSummary(items=[]){
 const failures=items.filter(x=>x.error).length;
 const pages=items.filter(x=>!x.error).reduce((n,x)=>n+new Set(x.review?.pages||[]).size,0);
 const other=items.some(x=>!x.error&&x.review?.other);
 const pending=[failures?failures+'份失败':'',pages?pages+'页待核':other?'部分内容待核':''].filter(Boolean);
 return '已处理'+(pending.length?'；'+pending.join('，'):'')+'。';
}
export function ocrReviewText(blocks={}){
 return (blocks.ocrReview?.pages||[]).map(p=>'PDF第'+p.page+'页 · OCR待核\n'+p.lines.map(l=>l.text).join('\n')).join('\n\n');
}
