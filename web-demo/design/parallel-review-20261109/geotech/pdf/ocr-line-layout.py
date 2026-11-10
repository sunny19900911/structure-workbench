"""Experimental OCR input: place isolated printed lines side by side.

Only moves existing ink rectangles; no generated characters or inferred values.
Input is an explicitly reviewed cell crop, not an arbitrary document page.
Usage: python ocr-line-layout.py crop-dir output-dir
"""
import json
import hashlib
import sys
from pathlib import Path
from PIL import Image


def reflow(image):
    gray = image.convert('L')
    ink = gray.point(lambda v: 255 if v < 150 else 0)
    bands = []
    for y in range(gray.height):
        if ink.crop((0, y, gray.width, y+1)).histogram()[255] < 2:
            continue
        if bands and y-bands[-1][1] <= 4:
            bands[-1][1] = y+1
        else:
            bands.append([y, y+1])
    if not 2 <= len(bands) <= 4:
        return image.copy(), [], 'unchanged: not 2-4 isolated lines'
    boxes=[]
    for top,bottom in bands:
        box=ink.crop((0,top,gray.width,bottom)).getbbox()
        boxes.append((max(0,box[0]-3),max(0,top-3),min(gray.width,box[2]+3),min(gray.height,bottom+3)))
    # Preserve isolated outer pixels excluded by line detection. Extend only
    # the first/last tile vertically, without deleting ink or moving it within
    # the tile. Interior punctuation and out-of-column ink still trigger the
    # conservation guard below rather than being silently reassigned.
    extent = ink.getbbox()
    if extent:
        boxes[0] = (boxes[0][0], min(boxes[0][1], extent[1]), boxes[0][2], boxes[0][3])
        boxes[-1] = (boxes[-1][0], boxes[-1][1], boxes[-1][2], max(boxes[-1][3], extent[3]))
    height=max(b[3]-b[1] for b in boxes)
    output=Image.new('RGB',(64+sum(b[2]-b[0] for b in boxes)+16*(len(boxes)-1),height+64),'white')
    mapping=[];x=32
    for b in boxes:
        tile=image.crop(b).convert('RGB');y=32+(height-tile.height)//2
        output.paste(tile,(x,y));mapping.append({'sourceBox':b,'outputBox':(x,y,x+tile.width,y+tile.height)})
        x+=tile.width+16
    # Reject any operation that loses or duplicates dark pixels (including
    # punctuation outside the detected lines). No OCR text informs this check.
    if sum(gray.histogram()[:150]) != sum(output.convert('L').histogram()[:150]):
        return image.copy(), [], 'unchanged: ink conservation failed'
    return output,mapping,'reflowed: original pixel rectangles only'


if __name__=='__main__':
    src,out=map(Path,sys.argv[1:3]);out.mkdir(parents=True,exist_ok=True)
    records=[]
    for path in sorted(src.glob('*.png')):
        with Image.open(path) as original:
            result,mapping,status=reflow(original)
            result.save(out/path.name)
            records.append({'input':str(path),'inputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'output':str(out/path.name),'outputSha256':hashlib.sha256((out/path.name).read_bytes()).hexdigest(),'status':status,'mapping':mapping})
    (out.parent/'line-layout-provenance.json').write_text(json.dumps({'automaticAdoption':False,'records':records},indent=2),encoding='utf8')
