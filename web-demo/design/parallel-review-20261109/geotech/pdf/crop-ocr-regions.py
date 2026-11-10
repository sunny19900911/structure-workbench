"""Render explicitly reviewed PDF regions for local OCR; never infer cell values.

Usage: python crop-ocr-regions.py manifest.json output-dir
Coordinates are fractions of the rendered page, with source/page/field recorded.
"""
import hashlib
import json
import os
import sys
from pathlib import Path
from pdf2image import convert_from_path
from PIL import ImageOps

manifest = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
source = Path(manifest['input'])
before = hashlib.sha256(source.read_bytes()).hexdigest()
page = convert_from_path(str(source), dpi=360, first_page=manifest['page'],
                         last_page=manifest['page'], poppler_path=os.environ.get('POPPLER_BIN'))[0]
records = []
for region in manifest['regions']:
    name = region['id']
    if not name.replace('-', '').replace('_', '').isalnum():
        raise ValueError('Region id must be a filename-safe identifier')
    left, top, right, bottom = region['bbox']
    if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        raise ValueError('Invalid normalized bounding box')
    box = (round(left*page.width), round(top*page.height), round(right*page.width), round(bottom*page.height))
    ImageOps.expand(page.crop(box).convert('RGB'), border=32, fill='white').save(out / (name+'.png'))
    records.append({**region, 'pixelBox': box, 'image': name+'.png'})
after = hashlib.sha256(source.read_bytes()).hexdigest()
assert before == after, 'Source changed during reading'
(out.parent/'crop-provenance.json').write_text(json.dumps({
    'input': str(source), 'sha256': before, 'sourceUnchanged': True, 'page': manifest['page'],
    'dpi': 360, 'coordinates': 'manually reviewed; not automatic table detection', 'regions': records,
    'automaticAdoption': False,
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'regions':len(records), 'sourceUnchanged':True}))
