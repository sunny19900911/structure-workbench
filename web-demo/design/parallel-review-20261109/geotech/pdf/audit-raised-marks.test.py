import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location('marks',Path(__file__).with_name('audit-raised-marks.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
audit=module.audit_raised_marks

class RaisedMarkTests(unittest.TestCase):
    def crop(self):
        g=np.full((32,82),255,dtype=np.uint8)
        g[9:26,25:30]=30;g[9:26,39:44]=30
        return g
    def test_faint_raised_mark_preserves_raw_and_pixels(self):
        g=self.crop();g[9:11,49:55]=180;before=g.copy()
        result=audit(g,'OH')
        self.assertEqual(result['status'],'review-required')
        self.assertEqual(result['marks'][0]['bbox'],[49,9,55,11])
        self.assertEqual(result['rawText'],'OH')
        self.assertFalse(result['automaticAdoption'])
        np.testing.assert_array_equal(g,before)
    def test_plus_dot_baseline_and_border_are_not_raised_dash(self):
        for kind in ['plus','dot','baseline','border']:
            with self.subTest(kind=kind):
                g=self.crop()
                if kind=='plus':g[9:11,49:55]=30;g[7:14,51:53]=30
                if kind=='dot':g[9:11,49:51]=30
                if kind=='baseline':g[23:25,49:55]=30
                if kind=='border':g[0:2,:]=30
                self.assertEqual(audit(g,'OH')['marks'],[])
    def test_charge_present_and_missing_geometry_are_not_certified(self):
        g=self.crop();g[9:11,49:55]=180
        for text in ['OH⁻','OH-','Na+']:
            self.assertEqual(audit(g,text)['status'],'not-assessed')
        self.assertEqual(audit(np.full((32,82),255,np.uint8),'OH')['status'],'not-assessed')
    def test_invalid_inputs_rejected(self):
        with self.assertRaises(ValueError):audit(np.zeros((32,82,3),np.uint8),'OH')
        with self.assertRaises(ValueError):audit(self.crop(),None)

if __name__=='__main__':unittest.main()
