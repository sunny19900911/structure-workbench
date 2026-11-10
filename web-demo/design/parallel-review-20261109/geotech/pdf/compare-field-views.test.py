import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('views', Path(__file__).with_name('compare-field-views.py'))
views = importlib.util.module_from_spec(spec)
spec.loader.exec_module(views)


class FieldViews(unittest.TestCase):
    def compare(self, kind, *texts):
        return views.compare(kind, [{'id': str(i), 'rawText': text} for i, text in enumerate(texts)])

    def test_comma_is_retained_as_invalid_not_repaired(self):
        result = self.compare('range', '3,20~6.20', '3.20~6.20')
        self.assertEqual(result['status'], 'review-invalid-format')
        self.assertEqual(result['views'][0]['rawText'], '3,20~6.20')
        self.assertEqual(result['candidates'], [{'value': '3.20~6.20', 'viewIds': ['1']}])
        self.assertFalse(result['automaticAdoption'])

    def test_empty_view_does_not_overwrite_readable_value(self):
        result = self.compare('mean', '1.90', '')
        self.assertEqual(result['status'], 'single-view-only')
        self.assertEqual(result['candidates'][0]['value'], '1.90')

    def test_numeric_conflicts_do_not_vote_or_choose(self):
        result = self.compare('mean', '1.90', '1.90', '7.90')
        self.assertEqual(result['status'], 'numeric-conflict')
        self.assertEqual(len(result['candidates']), 2)

    def test_minus_and_range_sign_are_not_discarded(self):
        result = self.compare('range', '## -25.88\\~ -28.62', '-25.88～-28.62')
        self.assertEqual(result['status'], 'view-agreement')
        self.assertEqual(result['candidates'][0]['value'], '-25.88~-28.62')
        self.assertEqual(self.compare('range', '25.88 28.62', '')['status'], 'review-invalid-format')

    def test_numeric_latex_wrappers_preserve_signs_without_evaluating_math(self):
        self.assertEqual(self.compare('range', '$$\n-11.69 \\sim -12.92\n$$', '-11.69~-12.92')['status'], 'view-agreement')
        self.assertEqual(self.compare('mean', '$$-12.17$$', '-12.17')['status'], 'view-agreement')
        for raw in ['$$3,20$$', '$$1+2$$', '$$\\frac{1}{2}$$', '$$12.17 m$$']:
            self.assertEqual(self.compare('mean', raw)['status'], 'review-invalid-format')


if __name__ == '__main__':
    unittest.main()
