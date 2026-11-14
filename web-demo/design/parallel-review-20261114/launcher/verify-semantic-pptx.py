"""Verify actual image bytes on the expected slides of the UI-downloaded PPTX."""
from pathlib import Path
import hashlib
import json
import posixpath
import sys
import zipfile
from lxml import etree

qa = Path(sys.argv[1])
report = json.loads((qa / 'compiled-semantic.json').read_text(encoding='utf-8'))
namespaces = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
              'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
              'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def relationships(archive, path):
    rel_path = posixpath.join(posixpath.dirname(path), '_rels', posixpath.basename(path) + '.rels')
    return {item.get('Id'): posixpath.normpath(posixpath.join(posixpath.dirname(path), item.get('Target')))
            for item in etree.fromstring(archive.read(rel_path)) if item.get('TargetMode') != 'External'}

checks = []
with zipfile.ZipFile(report['pptx']) as archive:
    presentation = etree.fromstring(archive.read('ppt/presentation.xml'))
    links = relationships(archive, 'ppt/presentation.xml')
    slides = [links[item.get('{' + namespaces['r'] + '}id')]
              for item in presentation.findall('p:sldIdLst/p:sldId', namespaces)]
    assert len(slides) == 27
    for expected in report['expectedPictures']:
        path = slides[expected['page'] - 1]
        page = etree.fromstring(archive.read(path))
        pictures = page.findall('.//p:pic', namespaces)
        assert len(pictures) == 1, expected
        blip = pictures[0].find('.//a:blip', namespaces)
        image = relationships(archive, path)[blip.get('{' + namespaces['r'] + '}embed')]
        actual = hashlib.sha256(archive.read(image)).hexdigest()
        assert actual == expected['sha256'], expected
        checks.append({**expected, 'packageSlide': path, 'imagePart': image, 'verified': True})
result = {'pass': True, 'slides': 27, 'verifiedImages': checks}
(qa / 'native-pptx-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'pass': True, 'slides': 27, 'verifiedImages': len(checks)}))
