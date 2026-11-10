import copy
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('identity',Path(__file__).with_name('verify-sample-depth.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class TextPage:
    def __init__(self, values=('ZK17-1','3.2-3.4')):
        self.values=values
        self.glyphs=[(c,(i*70+5+j*4,80 if c!='-' else 85,i*70+8+j*4,90 if c!='-' else 86)) for i,s in enumerate(values) for j,c in enumerate(s)]
    def count_chars(self): return len(self.glyphs)
    def get_text_range(self,i,n): return self.glyphs[i][0]
    def get_charbox(self,i,loose=False):
        b=self.glyphs[i][1]
        return (b[0],80,b[2],90) if loose else b
    def get_text_bounded(self,left,bottom,right,top):return self.values[int(left/70)]

def table():
    a={'bbox':[0,0,70,30],'text':'ZK17-13'}
    b={'bbox':[70,0,140,30],'text':'.2-3.4'}
    return {'rows':[['土\n样\n编\n号','取\n土\n深\n度'],['--','m'],[a['text'],b['text']]],'cellOrigins':[[None,None],[None,None],[a,b]]}

class SampleDepthTests(unittest.TestCase):
    def test_hyphen_uses_font_baseline_without_relaxing_cell_bounds(self):
        d=table();m.verify_sample_depth(d,TextPage(),100)
        self.assertEqual(d['rows'][2],['ZK17-1','3.2-3.4'])
        self.assertTrue(d['sampleDepthVerification'][0]['verified'])
        self.assertEqual(d['cellOrigins'][2][0]['unreviewedText'],'ZK17-13')
    def test_wrong_unit_or_header_is_not_a_sample_table(self):
        for change in ['unit','title']:
            d=table()
            if change=='unit':d['rows'][1][1]='cm'
            else:d['rows'][0][0]='建筑编号'
            before=copy.deepcopy(d);m.verify_sample_depth(d,TextPage(),100);self.assertEqual(d,before)
    def test_digits_leaked_from_third_column_do_not_get_discarded(self):
        d=table();d['cellOrigins'][2][1]['text']='.2-3.421.'
        m.verify_sample_depth(d,TextPage(),100)
        self.assertFalse(d['sampleDepthVerification'][0]['verified'])
        self.assertEqual(d['rows'][2][1],'.2-3.421.')
        self.assertTrue(d['cellOrigins'][2][0]['requiresIdentityReview'])
    def test_measurement_spill_requires_the_whole_physical_prefix(self):
        d=table();d['cellOrigins'][2][1]['text']='.2-3.421.'
        d['cellOrigins'][2].append({'bbox':[140,0,210,30],'text':'3'})
        m.verify_sample_depth(d,TextPage(('ZK17-1','3.2-3.4','21.3')),100)
        self.assertEqual(d['rows'][2],['ZK17-1','3.2-3.4','21.3'])
        self.assertTrue(d['sampleDepthVerification'][0]['identityChanged'])
    def test_different_sample_digit_is_not_corrected_by_plausibility(self):
        d=table();m.verify_sample_depth(d,TextPage(('ZK18-1','3.2-3.4')),100)
        self.assertFalse(d['sampleDepthVerification'][0]['verified'])
    def test_crossing_glyph_stays_pending(self):
        d=table();t=TextPage();t.glyphs[0]=('Z',(-1,80,2,90))
        m.verify_sample_depth(d,t,100);self.assertFalse(d['sampleDepthVerification'][0]['verified'])

if __name__=='__main__':unittest.main()
