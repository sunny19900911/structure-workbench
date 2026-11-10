"""Split an explicitly recognized numeric column using blank pixel gutters.

Usage: python split-range-mean.py grid.json header-results output-dir
Only accepts clear thickness/elevation headers with an explicit metre unit.
The 3-line + 1-line shape is a candidate, never inferred numeric content.
"""
import importlib.util
import json
import re
import hashlib
import sys
from pathlib import Path
from PIL import Image,ImageOps

spec=importlib.util.spec_from_file_location('layout',Path(__file__).with_name('ocr-line-layout.py'))
layout=importlib.util.module_from_spec(spec);spec.loader.exec_module(layout)

def bands(values):
    out=[]
    for i,v in enumerate(values):
        if not v:continue
        if out and i-out[-1][-1]<=4:out[-1].append(i)
        else:out.append([i])
    return out

def split(image):
    mask=image.convert('L').point(lambda v:255 if v<150 else 0)
    content=mask.getbbox()
    if not content:return None
    left,top,right,bottom=content
    empty=[];runs=[]
    for x in range(left,right):
        if mask.crop((x,top,x+1,bottom)).getbbox() is None:empty.append(x)
        elif empty:runs.append(empty);empty=[]
    if empty:runs.append(empty)
    candidates=[r for r in runs if len(r)>=max(6,(right-left)*.06) and left+(right-left)*.25<sum(r)/len(r)<left+(right-left)*.8]
    if not candidates:return None
    cut=round(sum(max(candidates,key=len))/len(max(candidates,key=len)))
    boxes=[(left,top,cut,bottom),(cut,top,right,bottom)]
    counts=[]
    for box in boxes:
        part=mask.crop(box)
        # A lone edge pixel is not a printed line. It remains inside the
        # returned original rectangles; this changes geometry detection only.
        counts.append(len(bands([part.crop((0,y,part.width,y+1)).histogram()[255] >= 2 for y in range(part.height)])))
    if counts != [3,1]:return None
    return boxes


def reviewed_headers(grid, reviews):
    selected = {}
    if reviews and hashlib.sha256(Path(grid['sourceImage']).read_bytes()).hexdigest() != grid['sha256']:
        raise ValueError('Source page image has changed')
    for review in reviews:
        if review.get('method') != 'visual-review' or review.get('sourceImageSha256') != grid['sha256']:
            raise ValueError('Reviewed header source does not match grid')
        cells = [c for c in grid['cells'] if c['row'] == 0 and c['column'] == review['column']]
        if len(cells) != 1 or hashlib.sha256(Path(cells[0]['image']).read_bytes()).hexdigest() != review['headerImageSha256']:
            raise ValueError('Reviewed header image has changed')
        if review.get('label') not in ('层厚', '层顶标高') or review.get('unit') != 'm':
            raise ValueError('Unsupported reviewed field or unit')
        if review['column'] in selected:
            raise ValueError('Duplicate reviewed header')
        selected[review['column']] = {'label': review['label']+'m', 'headerReview': review,
                                     'headerRecognition': 'visual-review-not-ocr'}
    return selected

if __name__=='__main__':
    gridfile,headers,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
    grid=json.loads(gridfile.read_text());selected={}
    for cell in grid['cells']:
        if cell['row']!=0:continue
        file=headers/(Path(cell['image']).stem+'.md')
        if not file.exists():continue
        raw=file.read_text(encoding='utf8');text=re.sub(r'[\s#]','',raw)
        if text in ['层厚m','层顶标高m']:
            selected[cell['column']]={'label':text,'rawHeader':raw,'headerResult':str(file)}
    if len(sys.argv) > 4:
        selected.update(reviewed_headers(grid, json.loads(Path(sys.argv[4]).read_text(encoding='utf8'))))
    records=[]
    for cell in grid['cells']:
        if cell['row']==0 or cell['column'] not in selected:continue
        image=Image.open(cell['image']).convert('RGB');boxes=split(image)
        record={**cell,**selected[cell['column']],'split':bool(boxes),'fields':[]}
        for key,box in zip(['range','mean'] if boxes else ['unsplit'],boxes or [(0,0,image.width,image.height)]):
            crop=ImageOps.expand(image.crop(box),border=32,fill='white');reflowed,mapping,status=layout.reflow(crop) if key=='range' else (crop,[],'unchanged')
            name=Path(cell['image']).stem+'-'+key+'.png';reflowed.save(out/name)
            record['fields'].append({'kind':key,'bboxInCellImage':box,'image':str(out/name),'reflowMapping':mapping,'reflowStatus':status})
        records.append(record)
    (out.parent/'split-provenance.json').write_text(json.dumps({'grid':str(gridfile),'automaticAdoption':False,'selectedHeaders':selected,'records':records},ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'columns':list(selected),'cells':len(records),'splitCells':sum(r['split'] for r in records)}))
