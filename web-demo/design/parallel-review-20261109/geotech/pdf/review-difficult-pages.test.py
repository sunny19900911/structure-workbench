import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('review',Path(__file__).with_name('review-difficult-pages.py'))
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
class ReviewTests(unittest.TestCase):
 def test_physical_page_is_one_based(self):
  self.assertEqual(review.page_index(1,91),0)
  self.assertEqual(review.page_index(17,91),16)
  self.assertEqual(review.page_index(91,91),90)
  for value in (0,92,True,1.5):
   with self.assertRaises(ValueError):review.page_index(value,91)
 def test_same_text_elsewhere_is_not_corroboration(self):
  line={'text':'2.0','bbox':[0,0,20,10],'score':.9}
  other={'text':'2.0','bbox':[50,50,70,60],'score':.9}
  self.assertEqual(review.compare([line.copy()],[other])[0]['agreement'],'review-required')
  self.assertEqual(review.compare([line.copy()],[line])[0]['agreement'],'same-text-two-scales')
if __name__=='__main__':unittest.main()
