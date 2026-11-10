import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('guard', Path(__file__).with_name('ocr-column-guard.py'))
guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
box = lambda a,b: [[a,10],[b,10],[b,20],[a,20]]

class ColumnTests(unittest.TestCase):
    def test_inverse_transform_keeps_disjoint_source_pieces(self):
        crops=[[10,20,110,120],[500,20,550,120]]
        self.assertEqual(guard.band_box_to_source([224,84,304,104],crops),[
            {'sourceCrop':0,'bbox':[90,30,110,40]},
            {'sourceCrop':1,'bbox':[500,30,520,40]}])
    def test_inverse_transform_rejects_padding_and_inconsistent_crops(self):
        with self.assertRaises(ValueError):guard.band_box_to_source([20,80,100,100],[[10,20,110,120]])
        with self.assertRaises(ValueError):guard.band_box_to_source([80,80,100,100],[[10,20,110,120],[500,20,550,100]])
    def test_recrop_uses_whole_source_columns_and_keeps_identity(self):
        result=guard.column_recrop_boxes(box(80,140),[0,100,200],(200,100))
        self.assertEqual([r['bbox'] for r in result],[[0,10,100,20],[100,10,200,20]])
        self.assertEqual([r['column'] for r in result],[0,1])
        self.assertFalse(any(r['automaticAdoption'] for r in result))
        self.assertEqual(guard.column_recrop_boxes(box(20,80),[0,100,200],(200,100)),[])
    def test_recrop_rejects_unbound_geometry(self):
        with self.assertRaises(ValueError):guard.column_recrop_boxes(box(80,140),[0,100,200],(180,100))
        with self.assertRaises(ValueError):guard.column_recrop_boxes(box(80,140),[0,100,200],(200,15))
    def test_joined_number_remains_raw_and_has_no_adoptable_column(self):
        row={'box':box(30,160),'text':'26.017.9'}
        result=guard.guard_regions([row],[0,100,200])[0]
        self.assertEqual(result['text'],row['text'])
        self.assertEqual(result['box'],row['box'])
        self.assertEqual(result['columnCheck']['status'],'crosses-columns')
        self.assertIsNone(result['columnCheck']['column'])
    def test_box_touching_edge_does_not_overlap_next_column(self):
        self.assertEqual(guard.assign_column(box(20,100),[0,100,200])['column'],0)
        self.assertEqual(guard.assign_column(box(100,160),[0,100,200])['column'],1)
    def test_outside_box_is_not_clamped(self):
        self.assertEqual(guard.assign_column(box(-1,60),[0,100])['status'],'outside-columns')
    def test_invalid_geometry_is_rejected(self):
        for edges in [[0,0,100],[0,float('nan')],[100,0]]:
            with self.assertRaises(ValueError):guard.assign_column(box(1,2),edges)
        with self.assertRaises(ValueError):guard.assign_column(box(2,2),[0,100])

if __name__ == '__main__': unittest.main()
