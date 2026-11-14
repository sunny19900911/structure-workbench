"""Restore the existing release's pinned PDF.js browser dependency, without network or overwrite."""
from pathlib import Path, PurePosixPath
import hashlib, json, tarfile

root = Path(__file__).resolve().parents[2]
archive = root / 'outputs/portable/download-cache/pdfjs-dist-3.11.174.tgz'
expected = '11402926f38e7d5c71e63f4c3fdcfcb9172afd5bd202900994cecfa8ee7a98c4'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected, 'Pinned archive hash differs'
target = root / 'vendor/pdfjs-3.11.174'
records = []
with tarfile.open(archive, 'r:gz') as package:
    for member in package.getmembers():
        if not member.isfile():
            continue
        original = member.name
        relative = {'package/build/pdf.min.js': 'pdf.min.js', 'package/build/pdf.worker.min.js': 'pdf.worker.min.js', 'package/LICENSE': 'LICENSE'}.get(original)
        if original.startswith(('package/cmaps/', 'package/standard_fonts/')):
            relative = original[len('package/'):]
        if not relative:
            continue
        assert '..' not in PurePosixPath(relative).parts
        data = package.extractfile(member).read()
        dest = target / relative
        if dest.exists():
            assert dest.read_bytes() == data, f'Existing dependency differs: {relative}'
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open('xb') as output:
                output.write(data)
        records.append({'file': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
assert {'pdf.min.js', 'pdf.worker.min.js', 'LICENSE'} <= {r['file'] for r in records}
report = {'version': '3.11.174', 'source_id': 'PINNED-PDFJS-20261110', 'source': 'https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-3.11.174.tgz', 'archiveSha256': expected, 'files': records}
(root / 'design/blackbox-20261110/pdfjs-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'restored': len(records), 'bytes': sum(r['bytes'] for r in records), 'core': records[:3]}, ensure_ascii=False))
