"""Merge explicit PDF inputs without changing page sizes (Windows fallback)."""
import json
import sys
from pypdf import PdfReader, PdfWriter

paths = json.load(sys.stdin)
writer = PdfWriter()
for path in paths:
    reader = PdfReader(path)
    if reader.is_encrypted:
        raise ValueError("Encrypted PDF is not supported")
    writer.append(reader)
with open(sys.argv[1], "wb") as stream:
    writer.write(stream)
writer.close()
