"""Check the live Word-rendered institute branding against the original reference."""
from pathlib import Path
import json
import sys
from PIL import ImageChops
import pdfplumber
import pypdfium2 as pdfium

root = Path(__file__).resolve().parents[3]
qa = Path(sys.argv[1])
reference = root / 'qa/portable-release/calculation-cover-20261112/converted-reference-render/word-render.pdf'
live = qa / 'live-render/word-render.pdf'

def measure(path):
    with pdfplumber.open(path) as document:
        page = document.pages[0]
        logo = page.images[0]
        groups = {}
        for character in page.chars:
            if character['top'] > 700 and character['x0'] > 185:
                groups.setdefault(round(character['top'], 1), []).append(character)
        lines = [{'text': ''.join(character['text'] for character in row),
                  'bboxPt': [min(character['x0'] for character in row), min(character['top'] for character in row),
                             max(character['x1'] for character in row), max(character['bottom'] for character in row)]}
                 for top, row in sorted(groups.items())]
        result = {'pages': len(document.pages), 'logoBboxPt': [logo[key] for key in ('x0', 'top', 'x1', 'bottom')],
                  'companyLines': lines}
    document = pdfium.PdfDocument(str(path))
    page_image = document[0].render(scale=2).to_pil().convert('RGB')
    return result, page_image

expected, reference_page = measure(reference)
actual, live_page = measure(live)
assert actual['logoBboxPt'] == expected['logoBboxPt']
assert actual['companyLines'] == expected['companyLines'], 'Institute text or coordinates differ'
area = (240, 1390, 1100, 1570)
reference_crop = reference_page.crop(area)
live_crop = live_page.crop(area)
assert ImageChops.difference(reference_crop, live_crop).getbbox() is None, 'Branding pixels differ'
reference_crop.save(qa / 'reference-logo.png')
live_crop.save(qa / 'live-logo.png')
live_page.save(qa / 'live-render/page-1.png')
pdf = pdfium.PdfDocument(str(live))
for index in range(1, actual['pages']):
    pdf[index].render(scale=1).to_pil().save(qa / 'live-render' / f'page-{index + 1}.png')
pdf.close()
result = {'pass': True, 'companyInput': '', 'reference': str(reference), 'live': str(live),
          'expected': expected, 'actual': actual, 'logoDeltaPt': [0, 0, 0, 0],
          'instituteTextCoordinatesIdentical': True, 'brandingPixelsIdentical': True}
(qa / 'live-logo-measurement.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
