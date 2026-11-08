"""Synthetic merged-header DOCX only; writes to the caller's isolated QA path."""
import sys, zipfile
from xml.sax.saxutils import escape

def cell(text, span=1, merge='', header=False):
    props = ('<w:gridSpan w:val="%s"/>' % span if span > 1 else '')
    props += ('<w:vMerge w:val="%s"/>' % merge if merge else '')
    return '<w:tc><w:tcPr>'+props+'</w:tcPr><w:p><w:r><w:t>'+escape(text)+'</w:t></w:r></w:p></w:tc>'

def row(cells, header=False):
    return '<w:tr>'+('<w:trPr><w:tblHeader/></w:trPr>' if header else '')+''.join(cells)+'</w:tr>'

table = '<w:tbl><w:tblGrid>'+('<w:gridCol w:w="2000"/>'*4)+'</w:tblGrid>'
table += row([cell('土层名称及代号', merge='restart'),cell('室内土工试验',span=3)],True)
table += row([cell('',merge='continue'),cell('含水率（%）'),cell('天然重度（kN/m³）'),cell('承载力特征值（kPa）')],True)
table += row([cell('④4粉质黏土'),cell('26.8'),cell('19.0'),cell('180')])
table += '</w:tbl>'
document = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+table+'</w:body></w:document>'
with zipfile.ZipFile(sys.argv[1]) as src, zipfile.ZipFile(sys.argv[2], 'w',zipfile.ZIP_DEFLATED) as dest:
    for item in src.infolist():
        dest.writestr(item, document.encode() if item.filename=='word/document.xml' else src.read(item.filename))
