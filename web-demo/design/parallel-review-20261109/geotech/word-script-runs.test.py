import importlib.util
from pathlib import Path
import tempfile
import unittest
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


reader = module('scripts', 'word-script-runs.py')
renderer = module('native', 'render-native-table.py')


class ScriptRuns(unittest.TestCase):
    def test_explicit_style_and_baseline_override_roundtrip(self):
        doc = Document()
        style = doc.styles.add_style('RaisedSource', WD_STYLE_TYPE.CHARACTER)
        style.font.superscript = True
        p = doc.add_paragraph('Q')
        p.add_run('4').font.subscript = True
        p.add_run('ml').style = style
        r = p.add_run('normal3')
        r.style = style
        baseline = OxmlElement('w:vertAlign')
        baseline.set(qn('w:val'), 'baseline')
        r._r.get_or_add_rPr().append(baseline)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'input.docx'
            doc.save(path)
            paragraphs, _ = reader.read_runs(path)
            self.assertEqual(paragraphs[0], [{'text': 'Q'}, {'text': '4', 'verticalAlign': 'subscript'}, {'text': 'ml', 'verticalAlign': 'superscript'}, {'text': 'normal3'}])
            output = Document()
            renderer.append_runs(output.add_paragraph(), {'text': p.text, 'textRuns': paragraphs[0]})
            path = Path(temp)/'output.docx'
            output.save(path)
            self.assertEqual(reader.read_runs(path)[0], paragraphs)

    def test_different_values_are_not_aligned(self):
        parts = [{'text': '20m'}, {'text': '3', 'verticalAlign': 'superscript'}]
        self.assertIsNone(reader.fit(parts, '30m3'))
        self.assertEqual(reader.fit(parts, '20m3'), parts)
        with self.assertRaises(ValueError):
            renderer.append_runs(Document().add_paragraph(), {'text': '30m3', 'textRuns': parts})

    def test_no_script_inference_from_units(self):
        doc = Document()
        p = doc.add_paragraph()
        renderer.append_runs(p, {'text': 'Q4 m3 SO42-'})
        self.assertFalse(any(r.font.superscript or r.font.subscript for r in p.runs))

    def test_cropped_and_continued_cells_follow_physical_provenance(self):
        # Output row/column deliberately differ from the source coordinates.
        cell = {'row': 0, 'column': 0, 'text': 'm3', 'sourceCell': {'source_id': 'A', 'table': 2, 'row': 4, 'column': 3}}
        parts = [{'text': 'm'}, {'text': '3', 'verticalAlign': 'superscript'}]
        data = {'source_id': 'A', 'sections': [{'title': '参数', 'blocks': [{'kind': 'geotech-source-table', 'locator': '提取表 9', 'scope': {'unit': '甲'}, 'continuation': {}, 'cells': [cell]}]}]}
        result, audit = reader.enrich(data, [], [{}, {(3, 2): parts}])
        self.assertEqual(result['sections'][0]['blocks'][0]['cells'][0]['textRuns'], parts)
        self.assertEqual(audit['formattedCells'], 1)
        self.assertNotIn('textRuns', cell)
        cell['sourceCell']['source_id'] = 'B'
        with self.assertRaises(ValueError):
            reader.enrich(data, [], [{}, {(3, 2): parts}])


if __name__ == '__main__':
    unittest.main()
