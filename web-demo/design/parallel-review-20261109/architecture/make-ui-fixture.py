"""Synthetic input only, never a source of real project parameters."""
from docx import Document
from pathlib import Path
import sys

doc = Document()
for text in ['项目名称：高度联动合成验收', '建设地点：合成测试地点',
             '甲楼：建筑高度24m；消防高度22m；结构高度23m；抗震计算高度23.7m；±0.000相当于绝对标高56.5m。',
             '乙楼：建筑高度18m；抗震计算高度17m；±0.000相当于绝对标高99m。']:
    doc.add_paragraph(text)
table = doc.add_table(rows=0, cols=3)
for values in [['单体名称', '建筑面积（㎡）', '主要功能'], ['甲楼', '1200', '教学'], ['乙楼', '800', '办公']]:
    for cell, value in zip(table.add_row().cells, values):
        cell.text = value
target = Path(sys.argv[1])
target.parent.mkdir(parents=True, exist_ok=True)
doc.save(target)
