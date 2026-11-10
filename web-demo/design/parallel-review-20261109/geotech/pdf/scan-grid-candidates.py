"""Conservative candidate grid from a scanned page, without field coordinates.

Usage: python scan-grid-candidates.py page.png output-dir
Requires existing QA OpenCV. Candidates are not semantic/merged-cell recovery.
"""
import hashlib
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps


def groups(values,gap=8):
    result=[]
    for value in values:
        if result and value-result[-1][-1]<gap:result[-1].append(int(value))
        else:result.append([int(value)])
    return result


def detect_grid(gray):
    height,width=gray.shape
    ink=cv2.threshold(gray,160,255,cv2.THRESH_BINARY_INV)[1]
    horizontal=cv2.morphologyEx(ink,cv2.MORPH_OPEN,np.ones((1,max(30,width//33)),np.uint8))
    vertical=cv2.morphologyEx(ink,cv2.MORPH_OPEN,np.ones((max(30,height//32),1),np.uint8))
    boxes=[cv2.boundingRect(c) for c in cv2.findContours(vertical,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)[0]]
    lines=[b for b in boxes if b[3]>height*.2 and b[2]<width*.015]
    if len(lines)<2:return None
    anchor=max(lines,key=lambda b:b[3]);top,bottom=anchor[1],anchor[1]+anchor[3]
    # Scanned thin rules may break at row junctions and drift a few pixels.
    # Accumulate vertical support in narrow x bands rather than requiring one
    # connected component to span most of the table. This mask is analysis
    # only; crops always use the unchanged source image.
    tolerance=max(2,round(width/750))
    support=cv2.dilate(vertical,np.ones((1,2*tolerance+1),np.uint8))
    coverage=(support[max(0,top):min(height,bottom)]>0).sum(axis=0)
    xs=[round(sum(g)/len(g)) for g in groups(np.where(coverage>=.55*(bottom-top))[0],gap=max(3,tolerance))]
    if len(xs)<4:return None
    projection=(horizontal[:,xs[0]:xs[-1]]>0).sum(axis=1)
    ys=[round(sum(g)/len(g)) for g in groups(np.where((projection>(xs[-1]-xs[0])*.15)&(np.arange(height)>=top-4)&(np.arange(height)<=bottom+4))[0])]
    if len(ys)<3:return None
    return {'xs':xs,'ys':ys,'bbox':[xs[0],ys[0],xs[-1],ys[-1]],'width':width,'height':height,'lineTolerancePixels':tolerance,'minVerticalCoverage':.55}


def merged_candidates(gray,grid):
    """Join only absent internal borders, preserving uncertain/nonrectangular cases."""
    height,width=gray.shape;xs,ys=grid['xs'],grid['ys'];cols,rows=len(xs)-1,len(ys)-1
    ink=cv2.threshold(gray,160,255,cv2.THRESH_BINARY_INV)[1]
    h=cv2.morphologyEx(ink,cv2.MORPH_OPEN,np.ones((1,max(30,width//33)),np.uint8))
    v=cv2.morphologyEx(ink,cv2.MORPH_OPEN,np.ones((max(30,height//32),1),np.uint8))
    tolerance=grid['lineTolerancePixels']+2
    parents=list(range(rows*cols));ambiguous=[]
    def root(a):
        while parents[a]!=a:a=parents[a]
        return a
    def consider(a,b,coverage):
        if coverage<=.05:parents[root(b)]=root(a)
        elif coverage<.5:ambiguous.append({'cells':[a,b],'coverage':coverage})
    for r in range(rows):
        for c in range(cols):
            a=r*cols+c
            if c+1<cols:
                y1,y2=ys[r]+tolerance,ys[r+1]-tolerance;x=xs[c+1]
                mask=v[y1:y2,max(0,x-tolerance):x+tolerance+1]
                coverage=float((mask>0).any(axis=1).mean()) if mask.size else 1
                raw=ink[y1:y2,max(0,x-tolerance):x+tolerance+1]
                if raw.size:coverage=max(coverage,float((raw>0).any(axis=1).mean()))
                consider(a,a+1,coverage)
            if r+1<rows:
                x1,x2=xs[c]+tolerance,xs[c+1]-tolerance;y=ys[r+1]
                mask=h[max(0,y-tolerance):y+tolerance+1,x1:x2]
                coverage=float((mask>0).any(axis=0).mean()) if mask.size else 1
                raw=ink[max(0,y-tolerance):y+tolerance+1,x1:x2]
                if raw.size:coverage=max(coverage,float((raw>0).any(axis=0).mean()))
                consider(a,a+cols,coverage)
    components={}
    for a in range(rows*cols):components.setdefault(root(a),[]).append(a)
    result=[]
    for members in components.values():
        rr=[a//cols for a in members];cc=[a%cols for a in members]
        r1,r2,c1,c2=min(rr),max(rr),min(cc),max(cc)
        rectangle=len(members)==(r2-r1+1)*(c2-c1+1)
        uncertain=any(any(a in members for a in edge['cells']) for edge in ambiguous)
        result.append({'row':r1,'column':c1,'rowSpan':r2-r1+1,'colSpan':c2-c1+1,'members':members,'rectangular':rectangle,'ambiguousBoundary':uncertain,'bbox':[xs[c1],ys[r1],xs[c2+1],ys[r2+1]]})
    return result,ambiguous


if __name__=='__main__':
    path,out=map(Path,sys.argv[1:3]);out.mkdir(parents=True,exist_ok=True)
    image=Image.open(path).convert('RGB');grid=detect_grid(np.array(image.convert('L')))
    report={'sourceImage':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'automaticAdoption':False,'grid':grid,'cells':[]}
    if grid:
        if '--inspect-merges' in sys.argv[3:]:
            merged,ambiguous=merged_candidates(np.array(image.convert('L')),grid)
            report['mergedCandidates']=merged;report['ambiguousEdges']=ambiguous
            report['mergeStatus']='unvalidated diagnostic only; text ink can mimic borders'
        for row,(top,bottom) in enumerate(zip(grid['ys'],grid['ys'][1:])):
            for col,(left,right) in enumerate(zip(grid['xs'],grid['xs'][1:])):
                if right-left<12 or bottom-top<12:continue
                inset=max(4,round(image.width/750))
                box=[left+inset,top+inset,right-inset,bottom-inset];name=f'r{row:02}-c{col:02}.png'
                folder=out/('headers' if row==0 else 'cells');folder.mkdir(exist_ok=True)
                ImageOps.expand(image.crop(box),border=32,fill='white').save(folder/name)
                report['cells'].append({'row':row,'column':col,'bbox':box,'image':str(folder/name),'mergedCellStatus':'unverified'})
    (out/'grid.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps({'gridFound':grid is not None,'rows':len(grid['ys'])-1 if grid else 0,'columns':len(grid['xs'])-1 if grid else 0,'cells':len(report['cells'])}))
