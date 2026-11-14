"""Targeted regressions: evidence locations, scope, no historical fact adoption."""
import copy
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile, ZIP_DEFLATED
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm
from PIL import Image
from lxml import etree as E
from requirements import compare, extract, digest


class RequirementsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def sample(self, name='sample.docx', missing=False, special=False):
        doc = Document()
        doc.sections[0].page_width = Mm(420)
        doc.sections[0].page_height = Mm(297)
        doc.add_heading('第一章 结构设计', 1)
        doc.add_heading('1 工程概况', 1)
        doc.add_paragraph('历史建筑高度 88.88m；不得转成当前工程采用值。')
        doc.add_heading('本单体建筑高度为88.88m，采用隔震技术。', 2)  # Bad style in real sample.
        doc.add_paragraph('表1 单体信息')
        table = doc.add_table(rows=2, cols=2)
        for row, values in zip(table.rows, [['单体','高度'], ['原项目', '88.88m']]):
            for cell, value in zip(row.cells, values): cell.text = value
        if special: doc.add_heading('2 隔震设计', 1)
        elif not missing: doc.add_heading('2 设计依据', 1)
        if not missing:
            png = BytesIO(); Image.new('RGB', (12, 12), 'white').save(png, format='PNG'); png.seek(0)
            doc.add_picture(png, width=Mm(40))
            doc.add_paragraph('图2 模型图位')
        path = self.root / name; doc.save(path)
        return path

    def test_source_locations_resolve_and_input_unchanged(self):
        path = self.sample(); before = digest(path); result = extract(path)
        self.assertEqual(before, digest(path))
        with ZipFile(path) as z:
            root = E.fromstring(z.read('word/document.xml'))
            for item in result['requirements']:
                self.assertEqual(len(root.xpath(item['locator']['xpath'], namespaces={'w': E.QName(root).namespace})), 1, item['locator'])
                self.assertEqual(item['source_id'], 'docx:' + before)
        self.assertEqual(result['counts'], {'heading': 3, 'table': 1, 'image': 1, 'page': 1})

    def test_no_sample_values_adopted_even_in_misstyled_heading(self):
        result = extract(self.sample())
        self.assertNotIn('88.88', str(result['requirements']))
        self.assertTrue(result['excluded_candidates'])
        self.assertTrue(all(r['mandatory'] is False for r in result['requirements']))

    def test_conditional_children_are_not_missing_mandatory_items(self):
        ref = extract(self.sample(special=True)); target = extract(self.sample('target.docx', missing=True))
        items = compare(ref, target)['checks']
        self.assertTrue(any(r['scope'] == 'applicability_unknown' for r in items if r['kind'] == 'image'))
        self.assertEqual(next(r['status'] for r in items if r['title'] == '2 隔震设计'), 'applicability_unknown')

    def test_no_blind_ordinal_or_duplicate_title_matching(self):
        ref = extract(self.sample()); target = copy.deepcopy(ref)
        heading = next(x for x in target['requirements'] if x['title'] == '2 设计依据')
        twin = copy.deepcopy(heading); twin['id'] += '-copy'; target['requirements'].append(twin)
        result = compare(ref, target)
        self.assertEqual(next(x['status'] for x in result['checks'] if x['title'] == '2 设计依据'), 'ambiguous')
        for r in ref['requirements']:
            if r['kind'] == 'table': r['match_key'] = ''
        self.assertEqual(next(x['status'] for x in compare(ref, target)['checks'] if x['kind'] == 'table'), 'not_assessed')

    def test_real_target_geometry_change_and_order_are_detected(self):
        source = self.sample(); doc = Document(source)
        doc.sections[0].left_margin = Mm(50)
        doc.tables[0].cell(0,0).merge(doc.tables[0].cell(0,1))
        target = self.root/'changed.docx'; doc.save(target)
        checks = compare(extract(source), extract(target))['checks']
        self.assertEqual(next(x['status'] for x in checks if x['kind'] == 'page'), 'difference')
        self.assertIn('rows', [d['property'] for x in checks if x['kind'] == 'table' for d in x['differences']])
        ref = extract(source); actual = copy.deepcopy(ref)
        headings = [r for r in actual['requirements'] if r['kind'] == 'heading']
        headings[1]['locator']['body_index'], headings[2]['locator']['body_index'] = headings[2]['locator']['body_index'], headings[1]['locator']['body_index']
        self.assertTrue(any(d['property'] == 'heading_order' for x in compare(ref, actual)['checks'] for d in x.get('differences', [])))

    def test_drawing_without_image_is_not_a_picture_requirement(self):
        path = self.sample(); doc = Document(path)
        run = doc.paragraphs[0].add_run(); run._r.append(OxmlElement('w:drawing')); doc.save(path)
        result = extract(path)
        self.assertEqual(result['counts']['image'], 1)
        self.assertTrue(any(x['kind'] == 'drawing' for x in result['excluded_candidates']))

    def test_identical_native_document_and_numbered_title_changes(self):
        path = self.sample(); reference = extract(path)
        self.assertTrue(all(x['status'] == 'same' for x in compare(reference, extract(path))['checks']))
        doc = Document(path); doc.paragraphs[1].text = '7 工程概况'
        target = self.root/'renumbered.docx'; doc.save(target)
        result = compare(reference, extract(target))
        self.assertNotEqual(next(x['status'] for x in result['checks'] if x['title'] == '1 工程概况'), 'not_found')
        self.assertIsNone(result['pass_rate'])

    def test_multiple_sections_are_not_silently_matched_by_index(self):
        path = self.sample(); doc = Document(path); doc.add_section(); doc.save(path)
        result = extract(path)
        self.assertEqual(result['counts']['page'], 2)
        self.assertTrue(all(x['status'] == 'not_assessed' for x in compare(result, result)['checks'] if x['kind'] == 'page'))


if __name__ == '__main__':
    unittest.main()
