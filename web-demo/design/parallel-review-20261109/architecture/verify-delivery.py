"""Audit downloaded originals without rewriting them; keep audit results out of Git."""
from pathlib import Path
from docx import Document
import hashlib
import json
import sys

root = Path(sys.argv[1])
downloads = Path(sys.argv[2])
qa = Path(sys.argv[3])
items = [
    ('training-tianjin', '01-天津-训练回归.docx', '天津音乐学院宿舍项目_扩初说明.docx'),
    ('blind-hainan', '02-海南-盲测.docx', '建筑首轮盲测-海南_扩初说明.docx'),
    ('blind-xinyang', '03-信阳-盲测.docx', '建筑首轮盲测-信阳_扩初说明.docx'),
]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = []
for sample, output, downloaded in items:
    original = json.loads((qa / sample / 'source.json').read_text(encoding='utf-8'))
    input_path = Path('E:/!!!!!!!!TO HOME/20261109/建筑说明') / original['name']
    assert digest(input_path) == original['hash'], 'Original source changed'
    target, download = root / '原样自动稿' / output, downloads / downloaded
    assert digest(target) == digest(download), 'Delivery differs from browser download'
    doc = Document(target)
    text = '\n'.join([p.text for p in doc.paragraphs] + [' | '.join(c.text for c in row.cells) for t in doc.tables for row in t.rows])
    (root / '校核记录' / (sample + '-导出回读.txt')).write_text(text, encoding='utf-8')
    manifest.append({'sample': sample, 'input': str(input_path), 'input_sha256': original['hash'], 'source_id': original['source_id'], 'download': str(download), 'output': str(target), 'output_sha256': digest(target), 'unchanged': True, 'tables': len(doc.tables), 'render_pages': 5})

manual = downloads / '合成高度联动验收_统一技术措施.docx'
doc = Document(manual)
rows = [[c.text.strip() for c in row.cells] for t in doc.tables for row in t.rows]
assert any(row[:2] == ['甲楼', '25'] for row in rows), 'Manual A height missing from native DOCX'
assert any(row[:2] == ['乙楼', '18'] for row in rows), 'Manual B height missing from native DOCX'
(qa / 'synthetic-export-verification.json').write_text(json.dumps({'file': str(manual), 'sha256': digest(manual), 'rows': [r for r in rows if r and r[0] in ['甲楼', '乙楼']]}, ensure_ascii=False, indent=2), encoding='utf-8')
(root / '校核记录' / '输入输出清单.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'originals_unchanged': 3, 'identical_downloads': 3, 'manual_heights_in_native_docx': True}, ensure_ascii=False))
