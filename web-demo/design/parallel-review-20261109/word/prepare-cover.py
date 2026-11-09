"""Regenerate the derived cover, keeping the external historical original read-only."""
import importlib.util
import sys
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('builder', ROOT / 'scripts/build-calculation-book.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
source, target = map(Path, sys.argv[1:3])
document = Document(source)
builder.clean_cover_identity(document)
builder.apply_current_cover(document, {key: '{{' + key + '}}' for key in ['project_name', 'project_code', 'stage', 'unit', 'company', 'software', 'discipline']})
document.core_properties.title = '结构计算书封面模板'
document.core_properties.subject = '当前项目参数填写，人员签名留空'
document.save(target)
