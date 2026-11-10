import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('verify', Path(__file__).with_name('verify-numeric-rows.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class TextPage:
    def __init__(self, values=('107.5', '103.70')):
        self.values = values
        self.glyphs = [(c, (i*50+5+j*4, 80, i*50+8+j*4, 90)) for i, s in enumerate(values) for j, c in enumerate(s)]
        self.font_boxes = [r for _, r in self.glyphs]
    def count_chars(self): return len(self.glyphs)
    def get_text_range(self, i, n): return self.glyphs[i][0]
    def get_charbox(self, i, loose=False): return self.font_boxes[i] if loose else self.glyphs[i][1]
    def get_text_bounded(self, left, bottom, right, top): return self.values[int(left/50)]


def table():
    return {'cellOrigins': [[{'bbox': [0, 0, 50, 30], 'text': '', 'unreviewedText': '107.510', 'requiresReview': True},
                            {'bbox': [50, 0, 100, 30], 'text': '', 'unreviewedText': '3.70', 'requiresReview': True}]], 'rows': [['', '']]}


class NumericGeometryTests(unittest.TestCase):
    def test_recovery_requires_complete_row_character_conservation(self):
        data = table(); m.resolve_numeric_rows(data, TextPage(), 100)
        self.assertEqual(data['rows'], [['107.5', '103.70']])
        self.assertEqual(data['cellOrigins'][0][0]['unreviewedText'], '107.510')
        self.assertFalse(data['cellOrigins'][0][0]['requiresReview'])

    def test_changed_digit_is_not_accepted(self):
        data = table(); before = copy.deepcopy(data)
        m.resolve_numeric_rows(data, TextPage(('107.6', '103.70')), 100)
        self.assertEqual(data, before)

    def test_glyph_crossing_border_is_not_accepted(self):
        data = table(); before = copy.deepcopy(data); text = TextPage()
        text.glyphs[0] = ('1', (-1, 80, 2, 90))
        m.resolve_numeric_rows(data, text, 100); self.assertEqual(data, before)

    def test_disagreement_with_bounded_reading_is_not_accepted(self):
        data = table(); before = copy.deepcopy(data); text = TextPage()
        text.values = ('107.51', '03.70')
        m.resolve_numeric_rows(data, text, 100); self.assertEqual(data, before)

    def test_multiline_and_ranges_stay_pending(self):
        for values in [('107.\n5', '103.70'), ('107-5', '103.70')]:
            data = table(); before = copy.deepcopy(data)
            m.resolve_numeric_rows(data, TextPage(values), 100); self.assertEqual(data, before)

    def test_trailing_label_does_not_hide_an_independent_numeric_run(self):
        data = table()
        data['cellOrigins'][0].append({'bbox':[100,0,150,30], 'text':'clay'})
        m.resolve_numeric_rows(data, TextPage(('107.5','103.70','clay')), 100)
        self.assertEqual(data['rows'], [['107.5','103.70','clay']])

    def test_character_loss_into_adjacent_label_does_not_get_fixed(self):
        data = table(); data['cellOrigins'][0][1]['unreviewedText'] = '3.7'
        data['cellOrigins'][0].append({'bbox':[100,0,150,30], 'text':'0clay'})
        before=copy.deepcopy(data)
        m.resolve_numeric_rows(data, TextPage(('107.5','103.70','clay')), 100)
        self.assertEqual(data, before)

    def test_short_minus_glyph_does_not_imply_a_second_baseline(self):
        d=table();d['cellOrigins'][0][0]['unreviewedText']='103.50-';d['cellOrigins'][0][1]['unreviewedText']='1.00'
        t=TextPage(('103.50','-1.00'))
        char,box=t.glyphs[6];t.glyphs[6]=(char,(box[0],85,box[2],86))
        m.resolve_numeric_rows(d,t,100)
        self.assertEqual(d['rows'],[['103.50','-1.00']])


if __name__ == '__main__': unittest.main()
