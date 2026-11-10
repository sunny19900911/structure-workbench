"""Read chart identity separately from layer values; preserve image provenance.

prepare selection.json output: crop metadata above a verified column header.
read selection.json ocr-dir output.json: parse explicit labels, never infer Vse.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
from html.parser import HTMLParser
from PIL import Image, ImageOps


class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self, data):
        self.parts.append(data)


def strings(value):
    if isinstance(value, dict):
        content=value.get('content')
        if isinstance(content,str) and value.get('type') in ('table_body','text','title','paragraph'):
            parser=Text(); parser.feed(content); yield ' '.join(parser.parts)
        for child in value.values(): yield from strings(child)
    elif isinstance(value,list):
        for child in value: yield from strings(child)


def identity(document):
    text=' '.join(strings(document))
    patterns={
        'borehole':r'钻孔编号\s*[:：]\s*([A-Za-z]+\s*\d+)(?!\d)',
        'collarElevation':r'孔口高程\s*[:：]\s*([+-]?\d+(?:\.\d+)?)',
        'endDepth':r'终孔深度\s*[:：]\s*(\d+(?:\.\d+)?)',
        'equivalentVelocity':r'等效速度\s*[:：]\s*(\d+(?:\.\d+)?)',
    }
    fields={}; conflicts={}
    for key,pattern in patterns.items():
        values=list(dict.fromkeys(re.sub(r'\s','',v) for v in re.findall(pattern,text)))
        if len(values)==1: fields[key]=values[0]
        elif values: conflicts[key]=values
    return {'fields':fields,'conflicts':conflicts,'rawText':text,
            'status':'identified' if len(fields)==4 and not conflicts else 'pending-identity',
            'unitsInferred':False,'automaticAdoption':False}


def main():
    mode=sys.argv[1]; selection=Path(sys.argv[2]); records=json.loads(selection.read_text(encoding='utf8'))
    if mode=='prepare':
        out=Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True); manifest=[]
        for r in records:
            if r['status']!='data-bands-ready': continue
            source=Path(r['source'])
            if hashlib.sha256(source.read_bytes()).hexdigest()!=r['sha256']:raise ValueError('Source changed')
            g=r['geometry'];x,y=g['origin'];xs=g['xs'];box=[x+xs[0],y,x+xs[-1],y+g['headerTop']]
            with Image.open(source) as image:
                crop=ImageOps.expand(image.crop(box).convert('RGB'),border=32,fill='white')
                crop.resize((crop.width*3,crop.height*3)).save(out/(r['name']+'.png'))
            manifest.append({'name':r['name'],'source':str(source),'sha256':r['sha256'],'pixelBox':box})
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    elif mode=='read':
        folder=Path(sys.argv[3]);result=[]
        for r in records:
            path=folder/(r['name']+'.json')
            if not path.exists():continue
            if hashlib.sha256(Path(r['source']).read_bytes()).hexdigest()!=r['sha256']:raise ValueError('Source changed')
            result.append({'name':r['name'],'source':r['source'],'sha256':r['sha256'],'ocrEvidence':str(path),'ocrSha256':hashlib.sha256(path.read_bytes()).hexdigest(),**identity(json.loads(path.read_text(encoding='utf8')))})
        Path(sys.argv[4]).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps({'charts':len(result),'identified':sum(r['status']=='identified' for r in result)}))
    else:raise ValueError('Expected prepare or read')


if __name__=='__main__':main()
