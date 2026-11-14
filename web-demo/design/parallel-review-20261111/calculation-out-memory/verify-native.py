import json
import sys
import zipfile
from pathlib import Path
from docx import Document

path = Path(sys.argv[1])
with zipfile.ZipFile(path) as package:
    assert package.testzip() is None
doc = Document(path)
text = '\n'.join(p.text for p in doc.paragraphs)
markers = ['QA_RAW_MASS_20261111', 'QA_RAW_DISP_20261111', 'QA_RAW_PERIOD_20261111']
for marker in markers:
    assert marker in text, marker
for name in ['WMASS.OUT', 'WDISP.OUT', 'WZQ.OUT']:
    assert name in text, name
sizes = [[round(s.page_width.mm, 1), round(s.page_height.mm, 1)] for s in doc.sections]
assert all(abs(w - 420) < 0.2 and abs(h - 297) < 0.2 for w, h in sizes), sizes
result = {'pass': True, 'docx': str(path), 'markers': markers, 'pageSizesMm': sizes, 'paragraphs': len(doc.paragraphs)}
path.with_name('native-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
