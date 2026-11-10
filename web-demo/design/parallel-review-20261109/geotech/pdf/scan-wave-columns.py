"""Locate a seven-column borehole wave chart using OCR layout and ruled geometry.

prepare: python scan-wave-columns.py prepare images layout-ocr output
finish:  python scan-wave-columns.py finish output header-ocr
The header crops require OCR between phases. No page-specific coordinates or
numeric expected values are used. Unsupported geometry/headers remain pending.
"""
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps


def locate_columns(image, bbox):
    width, height = image.size
    if len(bbox) != 4 or not (0 <= bbox[0] < bbox[2] <= 1 and 0 <= bbox[1] < bbox[3] <= 1):
        return None
    x1, y1, x2, y2 = [round(v*(width if i%2 == 0 else height)) for i, v in enumerate(bbox)]
    gray = np.array(image.convert('L'))[y1:y2, x1:x2]
    hh, ww = gray.shape
    if min(hh, ww) < 100: return None
    ink = cv2.threshold(gray, 160, 255, cv2.THRESH_BINARY_INV)[1]
    vertical = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((max(30, hh//20), 1), np.uint8))
    lines = [cv2.boundingRect(c) for c in cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]]
    lines = [b for b in lines if b[3] > .65*hh and b[2] < .015*ww]
    groups = []
    tolerance = max(3, round(ww/220))
    for line in sorted(lines, key=lambda b:b[1]):
        if groups and abs(line[1]-groups[-1][0][1]) <= tolerance: groups[-1].append(line)
        else: groups.append([line])
    candidates = [g for g in groups if len(g) >= 5]
    if len(candidates) != 1: return None
    top = round(sum(b[1] for b in candidates[0])/len(candidates[0]))
    selected = [b for b in lines if b[1] <= top+tolerance and b[1]+b[3] > .9*hh]
    xs = sorted(set(round(b[0]+b[2]/2) for b in selected))
    if len(xs) != 8: return None
    widths = np.diff(xs)
    # Four data columns, a pattern strip, the wide curve area, then velocity.
    if int(np.argmax(widths)) != 5 or widths[5] < .4*(xs[-1]-xs[0]): return None
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, max(30, ww//20)), np.uint8))
    ys = np.where((horizontal > 0).sum(axis=1) > .9*(xs[-1]-xs[0]))[0]
    below = [int(y) for y in ys if y > top+max(10, round(hh*.008))]
    if not below: return None
    bottom = below[0]
    if not .015*hh < bottom-top < .12*hh: return None
    return {'origin': [x1, y1], 'xs': xs, 'headerTop': top, 'headerBottom': bottom,
            'bottom': max(b[1]+b[3] for b in selected), 'tableBox': bbox}


class Rows(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row=[]
        elif tag in ('td', 'th'): self.cell=''
    def handle_data(self, text):
        if self.cell is not None: self.cell+=text
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            if self.row is not None: self.row.append(re.sub(r'\s', '', self.cell))
            self.cell=None
        elif tag == 'tr' and self.row is not None: self.rows.append(self.row); self.row=None


def verified_header(document):
    tables=[]
    def visit(x):
        if isinstance(x, dict):
            if x.get('type') == 'table_body' and isinstance(x.get('content'), str):
                parser=Rows(); parser.feed(x['content']); tables.append(parser.rows)
            for value in x.values(): visit(value)
        elif isinstance(x, list):
            for value in x: visit(value)
    visit(document)
    if len(tables) != 1 or not tables[0] or any(len(r)<6 for r in tables[0]): return False
    rows=tables[0]
    fields=[''.join(r[i] for r in rows) for i in range(5)]
    speed=''.join(r[-1] for r in rows)
    return (fields[0]=='序号' and fields[1]=='地层名称'
            and fields[2] in ('深度(m)', '深度（m）')
            and fields[3] in ('厚度(m)', '厚度（m）')
            and fields[4].startswith('柱状') and '图' in ''.join(''.join(r) for r in rows)
            and speed in ('层速度(m/s)', '层速度（m/s）'))


def prepare(images, layout, output):
    (output/'headers').mkdir(parents=True, exist_ok=True); records=[]
    for source in sorted(images.glob('*.png')):
        data=json.loads((layout/(source.stem+'.json')).read_text(encoding='utf8'))
        boxes=[b['bbox'] for page in data['pages'] for b in page['blocks'] if b['type']=='table']
        with Image.open(source) as image:
            found=[g for box in boxes if (g:=locate_columns(image, box))]
            record={'source':str(source), 'name':source.stem, 'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                    'automaticAdoption':False, 'status':'pending-geometry'}
            if len(found)==1:
                g=found[0]; x,y=g['origin']; xs=g['xs']
                crop=image.crop((x+xs[0], y+g['headerTop'], x+xs[-1], y+g['headerBottom'])).convert('RGB')
                padded=ImageOps.expand(crop, border=32, fill='white')
                padded.resize((padded.width*3, padded.height*3)).save(output/'headers'/source.name)
                record.update(geometry=g,status='pending-header')
            records.append(record)
    (output/'geometry.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'images':len(records),'geometryCandidates':sum(r['status']=='pending-header' for r in records)}))


def finish(output, headers):
    records=json.loads((output/'geometry.json').read_text(encoding='utf8'));(output/'bands').mkdir(exist_ok=True)
    for r in records:
        if r['status']!='pending-header': continue
        header=headers/(r['name']+'.json')
        if not header.exists() or not verified_header(json.loads(header.read_text(encoding='utf8'))):
            r['status']='pending-header-review';continue
        source=Path(r['source'])
        if hashlib.sha256(source.read_bytes()).hexdigest()!=r['sha256']: raise ValueError('Source changed')
        with Image.open(source) as image:
            g=r['geometry'];x,y=g['origin'];xs=g['xs']
            boxes=[(x+xs[0],y+g['headerTop'],x+xs[4],y+g['bottom']),
                   (x+xs[6],y+g['headerTop'],x+xs[7],y+g['bottom'])]
            crops=[image.crop(b).convert('RGB') for b in boxes]
            canvas=Image.new('RGB',(sum(c.width for c in crops),crops[0].height),'white');offset=0
            for crop in crops:canvas.paste(crop,(offset,0));offset+=crop.width
            padded=ImageOps.expand(canvas,border=32,fill='white')
            padded.resize((padded.width*2,padded.height*2)).save(output/'bands'/(r['name']+'.png'))
            r.update(status='data-bands-ready',pixelBoxes=boxes,headerEvidence=str(header))
    (output/'selection.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'selected':sum(r['status']=='data-bands-ready' for r in records),'total':len(records),'automaticAdoption':False}))


if __name__=='__main__':
    if sys.argv[1]=='prepare': prepare(*map(Path,sys.argv[2:5]))
    elif sys.argv[1]=='finish': finish(*map(Path,sys.argv[2:4]))
    else: raise ValueError('Expected prepare or finish')
