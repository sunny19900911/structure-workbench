import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import cv2
import numpy as np

spec = importlib.util.spec_from_file_location('layer_boxes', Path(__file__).with_name('read-layer-boxes.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def region(text, x, y):
    return [[[x-12, y-8], [x+12, y-8], [x+12, y+8], [x-12, y+8]], [text, .99]]


def fixture():
    image = np.full((850, 1000), 255, np.uint8)
    centers = [150, 270, 390, 510, 630, 750]
    rules = [[80, y, 850, y-6] for y in [180, 380, 650]]
    for x1, y1, x2, y2 in rules:
        cv2.line(image, (x1, y1), (x2, y2), 0, 2)
    raw = [region(text, x, 140) for text, x in zip(module.HEADERS, centers)]
    values = [['土层1', '2.1', '杂填土', '130.2', '杂填土'],
              ['土层2', '6.5', '强风化砂岩', '409.7', '强风化']]
    for index, row in enumerate(values):
        for col, text in zip(module.SELECTED, row):
            # Description sits near row top; numerical cells are centered.
            y = [210, 410][index] if col == 2 else [280, 510][index]
            raw.append(region(text, centers[col], y))
    return image, raw, rules, values


class PhysicalRows(unittest.TestCase):
    def test_skewed_source_rules_recover_top_aligned_names(self):
        image, raw, _, values = fixture()
        result = module.read_chart(image, raw)
        self.assertEqual(result['status'], 'candidate')
        self.assertEqual([r['values'] for r in result['rows']], values)
        self.assertFalse(result['automaticAdoption'])

    def test_missing_or_extra_rules_do_not_guess_rows(self):
        image, raw, rules, _ = fixture()
        for bad in [rules[:2], rules + [[80, 700, 850, 694]]]:
            with patch.object(module, 'horizontal_rules', return_value=bad):
                self.assertEqual(module.read_chart(image, raw)['reason'], 'incomplete-or-extra-row-rules')

    def test_wrong_profile_and_duplicate_header(self):
        image, raw, _, _ = fixture()
        for bad in [raw[1:], raw + [raw[0]]]:
            self.assertEqual(module.read_chart(image, bad)['reason'], 'missing-or-duplicate-header')

    def test_multiple_values_in_cell_preserved_as_unresolved(self):
        image, raw, rules, _ = fixture()
        with patch.object(module, 'horizontal_rules', return_value=rules):
            result = module.read_chart(image, raw + [region('406.7', 630, 530)])
        self.assertEqual(result['reason'], 'missing-or-multiple-cell-texts')
        self.assertNotIn('rows', result)

    def test_box_crossing_rule_remains_review_candidate(self):
        image, raw, rules, values = fixture()
        raw[8] = region('杂填土', 390, 183)
        with patch.object(module, 'horizontal_rules', return_value=rules):
            result = module.read_chart(image, raw)
        self.assertEqual([r['values'] for r in result['rows']], values)
        self.assertTrue(result['rows'][0]['cells'][2]['boundaryReview'])
        self.assertFalse(result['automaticAdoption'])


if __name__ == '__main__':
    unittest.main()
