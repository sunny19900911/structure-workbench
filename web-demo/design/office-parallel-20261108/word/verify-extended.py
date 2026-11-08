from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
import json

folder=Path('qa/portable-release/mcp/office-word-extended-built')
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W='{'+ns['w']+'}'
def read(name):
    with ZipFile(folder/name) as z:
        parts={p:E.fromstring(z.read(p)) for p in z.namelist() if p.endswith('.xml')}
        return parts
p=read('with-revisions.docx');root=p['word/document.xml']
assert root.xpath('count(//w:ins)',namespaces=ns)==1
assert root.xpath('count(//w:del)',namespaces=ns)==1
assert root.xpath('//w:vertAlign/@w:val',namespaces=ns).count('subscript')>=1
assert root.xpath('//w:vertAlign/@w:val',namespaces=ns).count('superscript')>=1
assert root.xpath('//w:footnoteReference/@w:id',namespaces=ns)==['1']
assert '脚注保存验收。' in ''.join(p['word/footnotes.xml'].xpath('//w:t/text()',namespaces=ns))
assert root.xpath('//w:commentReference/@w:id',namespaces=ns)
assert '批注内容验收。' in ''.join(p['word/comments.xml'].xpath('//w:t/text()',namespaces=ns))
assert any('TOC ' in t for t in root.xpath('//w:instrText/text()',namespaces=ns))
assert len(root.xpath('//w:hyperlink',namespaces=ns))>=2
assert 'e8efff' in [s.lower() for s in root.xpath('//w:tcPr/w:shd/@w:fill',namespaces=ns)]
assert 'page' in root.xpath('//w:br/@w:type',namespaces=ns)
accepted=read('accepted.docx')['word/document.xml']
assert not accepted.xpath('//w:ins|//w:del',namespaces=ns)
text=''.join(accepted.xpath('//w:t/text()',namespaces=ns))
assert '已接受的基本信息' in text and '修订后的基本信息' not in text
assert '此处为人工修改测试段落。' in text
assert text.count('批量替换文本')==25
sect=accepted.find('w:body/w:sectPr',ns)
assert sect.find('w:pgSz',ns).get(W+'orient')=='portrait'
assert abs(int(sect.find('w:pgSz',ns).get(W+'w'))-210/25.4*1440)<2
assert abs(int(sect.find('w:pgMar',ns).get(W+'top'))-21/25.4*1440)<2
assert sect.find('w:cols',ns).get(W+'num')=='1'
assert abs(int(sect.find('w:pgMar',ns).get(W+'header'))-10/25.4*1440)<2
assert abs(int(sect.find('w:pgMar',ns).get(W+'footer'))-12/25.4*1440)<2
report={'passed':True,'pageSetup':True,'marginsAfterUI':21,'columns':1,'headerFooterDistances':True,'footnoteAndComment':True,'TOCFieldAndHyperlink':True,'superSubscript':True,'tableShadingAndPageBreak':True,'trackedReplacementAndDecisions':True,'replaceAllCount':25}
(folder/'extended-docx-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report))
