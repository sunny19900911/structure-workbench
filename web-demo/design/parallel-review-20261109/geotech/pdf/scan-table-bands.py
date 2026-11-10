"""Join explicitly reviewed vertical data bands without resampling their rows.

Usage: python scan-table-bands.py reviewed-manifest.json output-directory
Manifest records contain source image path and normalized bands. This is a
review-assisted OCR experiment, not automatic graph or column interpretation.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps


def join_bands(image, bands):
    if not bands:
        raise ValueError('No bands')
    top, bottom = bands[0][1], bands[0][3]
    previous_right = 0
    boxes = []
    for left, y1, right, y2 in bands:
        if not (0 <= left < right <= 1 and 0 <= y1 < y2 <= 1):
            raise ValueError('Band outside image')
        if y1 != top or y2 != bottom or left < previous_right:
            raise ValueError('Bands must preserve common row coordinates and x order')
        previous_right = right
        box = (round(left*image.width), round(y1*image.height),
               round(right*image.width), round(y2*image.height))
        if box[2] <= box[0] or box[3] <= box[1]:
            raise ValueError('Empty pixel band')
        boxes.append(box)
    crops = [image.crop(box).convert('RGB') for box in boxes]
    canvas = Image.new('RGB', (sum(c.width for c in crops), crops[0].height), 'white')
    offset = 0
    for crop in crops:
        canvas.paste(crop, (offset, 0))
        offset += crop.width
    return canvas, boxes


def main():
    records = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
    output = Path(sys.argv[2]); output.mkdir(parents=True, exist_ok=True)
    provenance = []
    for record in records:
        path = Path(record['source'])
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        if record.get('sha256') and before != record['sha256']:
            raise ValueError('Reviewed source hash changed')
        with Image.open(path) as image:
            canvas, boxes = join_bands(image, record['bands'])
        padded = ImageOps.expand(canvas, border=32, fill='white')
        name = f"page-{int(record['page'])}.png"
        padded.resize((padded.width*2, padded.height*2)).save(output/name)
        assert before == hashlib.sha256(path.read_bytes()).hexdigest()
        provenance.append({'source': str(path), 'sha256': before, 'page': record['page'],
                           'bands': record['bands'], 'pixelBoxes': boxes, 'output': name,
                           'selection': 'reviewed coordinates; not automatic detection',
                           'rowGeometryPreserved': True, 'automaticAdoption': False})
    (output/'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'images': len(provenance), 'automaticAdoption': False}))


if __name__ == '__main__':
    main()
