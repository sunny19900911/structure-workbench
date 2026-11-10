import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('views', Path(__file__).with_name('compare-field-views.py'))
views = importlib.util.module_from_spec(spec)
spec.loader.exec_module(views)


class LayerCodeTest(unittest.TestCase):
    def check(self, *texts):
        return views.compare('layer-code', [{'id': str(i), 'rawText': text} for i, text in enumerate(texts)])

    def test_explicit_circle(self):
        result = self.check('②3-1', r'$$ \textcircled{2} 3 - 1 $$')
        self.assertEqual(result['status'], 'view-agreement')
        self.assertEqual(result['candidates'][0]['value'], '②3-1')
        self.assertFalse(result['automaticAdoption'])

    def test_ambiguous_input_remains_invalid(self):
        for raw in ['71', '5', r'$$\textcircled{c}2{-}2$$', r'\textcircled{21}', '⑦1+2']:
            with self.subTest(raw=raw):
                result = self.check(raw)
                self.assertEqual(result['status'], 'review-invalid-format')
                self.assertEqual(result['candidates'], [])
                self.assertEqual(result['views'][0]['rawText'], raw)

    def test_conflict_not_voted_away(self):
        result = self.check('⑦1', '⑦1', '⑦2')
        self.assertEqual(result['status'], 'numeric-conflict')
        self.assertEqual(len(result['candidates']), 2)

    def test_context_requires_explicit_circle_and_same_name(self):
        self.assertEqual(views.layer_context('⑤粘土', '粘土'), '⑤')
        self.assertEqual(views.layer_context('## ⑦2-2\n\n粉砂', '粉砂'), '⑦2-2')
        for raw, name in [('5粘土', '粘土'), ('⑤粘土', '砂土'), ('⑤粘土', ''), ('⑤粘土⑥粘土', '粘土')]:
            self.assertEqual(views.layer_context(raw, name), '')


if __name__ == '__main__':
    unittest.main()
