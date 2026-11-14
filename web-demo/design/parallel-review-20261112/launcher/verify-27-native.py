"""Read the exported PowerPoint through python-pptx and inspect its slide XML."""
from pathlib import Path
from zipfile import ZipFile
from PIL import Image
from pptx import Presentation
import hashlib
import json
import sys

report_path = Path(sys.argv[1])
browser = json.loads(report_path.read_text(encoding='utf-8'))
path = Path(browser['pptx'])
deck = Presentation(path)
assert len(deck.slides) == 27
with ZipFile(path) as archive:
    assert archive.testzip() is None
    assert all(archive.read(name) for name in archive.namelist() if name.endswith('.xml'))

with Image.open(browser['sourceImage']) as image:
    width, height = image.size
x, y, w, h = browser['referenceBox']
ratio = min(w / width, h / height)
iw, ih = width * ratio, height * ratio
expected = [round(value * 9525) for value in [x + (w - iw) / 2, y + (h - ih) / 2, iw, ih]]
source_hash = hashlib.sha256(Path(browser['sourceImage']).read_bytes()).hexdigest()
slides = []
for number in range(12, 28):
    slide = deck.slides[number - 1]
    pictures = [shape for shape in slide.shapes if shape.shape_type == 13]
    assert len(pictures) == 1, number
    picture = pictures[0]
    box = [picture.left, picture.top, picture.width, picture.height]
    assert all(abs(a - b) <= 2 for a, b in zip(box, expected)), (number, box, expected)
    assert hashlib.sha256(picture.image.blob).hexdigest() == source_hash
    slides.append({'number': number, 'pictures': 1, 'box': box})
result = {'pptx': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
          'pages': 27, 'singlePicturePages': slides, 'referenceOriginalPage': 19,
          'imageBytesPreserved': True, 'nativeReader': 'python-pptx'}
(report_path.parent / (sys.argv[2] if len(sys.argv) > 2 else 'native-27-layout.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'pages': 27, 'singlePicturePages': len(slides), 'imageBytesPreserved': True}))
