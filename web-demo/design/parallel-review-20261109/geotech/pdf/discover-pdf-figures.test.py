import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('figures',Path(__file__).with_name('discover-pdf-figures.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def page(captions):
    return {'width':600,'height':800,'blocks':[{'kind':'paragraph','text':t,'bbox':b} for t,b in captions]}

class Figures(unittest.TestCase):
    def test_repeated_streams_are_indexed_without_exclusion_or_loss_of_locations(self):
        a={'decodedStreamSha256':'a'*64,'decodeMetadata':{'sourceSize':[10,10]},'page':1,'index':0,'bbox':[10,10,20,20]}
        groups=module.raster_groups([a,{**a,'page':2},{**a,'decodeMetadata':{'sourceSize':[5,20]}}])
        self.assertEqual(len(groups),2)
        self.assertEqual(groups[0]['occurrenceCount'],2)
        self.assertEqual(groups[0]['pageCount'],2)
        self.assertFalse(groups[0]['automaticExclusion'])
        self.assertEqual(len(groups[0]['occurrences']),2)

    def test_map_and_legend_group_but_side_by_side_maps_stay_separate(self):
        p=page([('附图1：构造分区图',[70,510,230,530]),('附图2：活动断裂图',[365,510,535,530])])
        result=module.discover(p,[[40,100,270,500],[330,100,570,380],[340,388,560,500]])
        self.assertEqual([c['bbox'] for c in result['candidates']],[[40,100,270,500],[330,100,570,500]])
        self.assertEqual(len(result['candidates'][1]['imageRegions']),2)
        self.assertFalse(result['candidates'][1]['visuallyReviewed'])

    def test_two_captions_for_one_image_remain_pending(self):
        result=module.discover(page([('图1：A',[50,510,250,530]),('图2：B',[50,540,250,560])]),[[40,100,270,500]])
        self.assertTrue(all(c['status']=='pending' for c in result['candidates']))
        self.assertEqual(len(result['unassigned']),1)

    def test_page_scan_is_not_a_figure(self):
        result=module.discover(page([('图1：A',[50,710,250,730])]),[[0,0,600,800]])
        self.assertEqual(result['ignored'][0]['reason'],'page-sized-raster')
        self.assertEqual(result['candidates'][0]['status'],'pending')

    def test_rotation_invalid_bounds_and_no_caption_do_not_guess(self):
        p=page([]);p['orientation']={'clockwiseRotation':90}
        self.assertEqual(module.discover(p,[[10,10,100,100]])['status'],'pending-rotation')
        result=module.discover(page([]),[[-1,10,100,100],[10,10,100,100]])
        self.assertEqual(len(result['ignored']),1);self.assertEqual(len(result['unassigned']),1)
        self.assertEqual(result['candidates'],[])

    def test_distant_caption_and_body_reference_not_attached(self):
        result=module.discover(page([('图1：A',[50,650,250,670]),('参见图2：B',[50,510,250,530])]),[[40,100,270,500]])
        self.assertEqual(len(result['candidates']),1)
        self.assertEqual(result['candidates'][0]['status'],'pending')

if __name__=='__main__':unittest.main()
