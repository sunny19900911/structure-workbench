"""Offline page OCR. Two raster scales are consistency evidence, not correctness.

The result is a review artifact; never replaces native cells or design values.
Usage: python review-difficult-pages.py job.json output.json
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
import cv2
import numpy as np
import pypdfium2 as pdfium
from mineru.model.ocr.pp_ocr_v6_onnx import PPOCRv6ONNX

spec=importlib.util.spec_from_file_location('scan_grid',Path(__file__).with_name('scan-grid-candidates.py'))
grid_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(grid_module)

def normalized(text):
    return ''.join(str(text).split())

def page_index(number,count):
    if type(number) is not int or not 1<=number<=count:raise ValueError('Invalid page')
    return number-1

def lines_from(items,scale):
    lines=[]
    for item in (items[0] if items else None) or []:
        points,(text,score)=item
        xs=[float(p[0])/scale for p in points];ys=[float(p[1])/scale for p in points]
        lines.append({'text':str(text),'score':float(score),'bbox':[min(xs),min(ys),max(xs),max(ys)]})
    return sorted(lines,key=lambda x:(round(x['bbox'][1]/5),x['bbox'][0]))

def overlap(a,b):
    x=max(0,min(a[2],b[2])-max(a[0],b[0]));y=max(0,min(a[3],b[3])-max(a[1],b[1]))
    return x*y/max(1,min((a[2]-a[0])*(a[3]-a[1]),(b[2]-b[0])*(b[3]-b[1])))

def compare(first,second):
    used=set()
    for line in first:
        matches=[(i,b) for i,b in enumerate(second) if i not in used and normalized(line['text'])==normalized(b['text']) and overlap(line['bbox'],b['bbox'])>.5]
        if matches:
            i,b=max(matches,key=lambda x:overlap(line['bbox'],x[1]['bbox']));used.add(i)
            line['agreement']='same-text-two-scales';line['secondScore']=b['score']
        else:line['agreement']='review-required'
    return first

def main(job_path,output):
    job=json.loads(job_path.read_text(encoding='utf-8'));source=Path(job['input']);models=Path(job['models'])
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    if source_hash!=job['sourceHash']:raise ValueError('PDF hash mismatch')
    det=models/'ch_PP-OCRv6_tiny_det_infer.onnx';rec=models/'ch_PP-OCRv6_small_rec_infer.onnx'
    if not det.is_file() or not rec.is_file():raise FileNotFoundError('Existing local models required')
    model=PPOCRv6ONNX(str(det),str(rec),device='cpu',intra_op_num_threads=4,enable_merge_det_boxes=False)
    result={'schemaVersion':1,'sourceHash':source_hash,'engine':'local-PPOCRv6','automaticAdoption':False,'pages':[]}
    with pdfium.PdfDocument(source) as doc:
        for number in job['pages']:
            page=doc[page_index(number,len(doc))]
            try:
                reads=[];grid=None;image_hash=''
                for scale in (2.0,3.0):
                    bitmap=page.render(scale=scale)
                    try:rgb=np.array(bitmap.to_pil().convert('RGB'))
                    finally:bitmap.close()
                    if scale==2.0:
                        image_hash=hashlib.sha256(rgb.tobytes()).hexdigest()
                        grid=grid_module.detect_grid(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY))
                    reads.append(lines_from(model.ocr(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),det=True,rec=True),scale))
                lines=compare(*reads)
                result['pages'].append({'page':number,'status':'recognized' if lines else 'unrecognized','requiresReview':True,
                    'width':page.get_width(),'height':page.get_height(),'rasterSha256':image_hash,
                    'lines':lines,'secondPass':reads[1],
                    'tableCandidate':None if not grid else {'bbox':[v/2 for v in grid['bbox']],'rowBands':len(grid['ys'])-1,'columnBands':len(grid['xs'])-1,'restored':False}})
            finally:page.close()
            output.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
            print(json.dumps({'page':number,'lines':len(lines)}),flush=True)

if __name__=='__main__':main(Path(sys.argv[1]),Path(sys.argv[2]))
