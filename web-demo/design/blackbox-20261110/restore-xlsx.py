"""Restore pinned SheetJS for source-mode material imports, never overwrite differing files."""
from pathlib import Path
import hashlib, json, tarfile
root = Path(__file__).resolve().parents[2]
archive = root / 'outputs/portable/download-cache/xlsx-0.18.5.tgz'
expected = '5b23e25faa2472e50679e5f6ee52fced3ae4c4b1e46e8dfebb221c59747461ee'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
records = []
with tarfile.open(archive, 'r:gz') as package:
    for original, relative in [('package/dist/xlsx.full.min.js', 'xlsx.full.min.js'), ('package/LICENSE', 'LICENSE')]:
        data = package.extractfile(original).read()
        dest = root / 'vendor/xlsx-0.18.5' / relative
        if dest.exists():
            assert dest.read_bytes() == data, 'Existing dependency differs'
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open('xb') as output:
                output.write(data)
        records.append({'file': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
report = {'version': '0.18.5', 'source_id': 'PINNED-XLSX-20261110', 'source': 'https://registry.npmjs.org/xlsx/-/xlsx-0.18.5.tgz', 'archiveSha256': expected, 'files': records}
(root / 'design/blackbox-20261110/xlsx-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
