"""Check real merged output against the chosen source PDFs, without writing sources."""
import hashlib
import json
import sys
from pathlib import Path

from pypdf import PdfReader


def digest(data):
    return hashlib.sha256(data).hexdigest()


root = Path(sys.argv[1])
output = Path(sys.argv[2])
record = Path(sys.argv[3])
sources = [
    root / "荷载校核图形/荷载校核.pdf",
    root / "计算书/上部/设计结果简图.pdf",
    root / "计算书/基础/基础计算及设计结果.pdf",
    root / "计算书/施工图/板计算简图.pdf",
]
merged = PdfReader(output)
source_records = []
offset = 0
for source in sources:
    reader = PdfReader(source)
    for index, page in enumerate(reader.pages):
        target = merged.pages[offset + index]
        assert list(page.mediabox) == list(target.mediabox)
        assert page.rotation == target.rotation
        assert digest(page.get_contents().get_data()) == digest(target.get_contents().get_data())
        assert page.extract_text() == target.extract_text()
    source_records.append({"path": str(source), "pages": len(reader.pages), "sha256": digest(source.read_bytes())})
    offset += len(reader.pages)
assert offset == len(merged.pages) == 17
record.parent.mkdir(parents=True, exist_ok=True)
record.write_text(json.dumps({"passed": True, "output": str(output), "pages": offset, "sha256": digest(output.read_bytes()), "sources": source_records, "checks": ["source order", "all page content streams", "all extracted text", "page dimensions and rotation"]}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"passed": True, "pages": offset, "sources": len(source_records)}))
