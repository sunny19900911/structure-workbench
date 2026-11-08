"""Preview navigation only; PDF rendering remains the original Word PDF."""
import json,re,sys
from pypdf import PdfReader
print(json.dumps([re.sub(r'\s+','',p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages],ensure_ascii=False))
