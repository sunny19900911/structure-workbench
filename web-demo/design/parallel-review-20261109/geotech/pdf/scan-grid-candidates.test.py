import importlib.util
from pathlib import Path
import unittest
import numpy as np
from PIL import Image,ImageDraw

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

grid=load('scan-grid-candidates');split=load('split-range-mean')

class CandidateTests(unittest.TestCase):
    def test_grid_tracks_known_row_column_geometry(self):
        im=Image.new('L',(800,700),255);d=ImageDraw.Draw(im)
        for x in [100,200,350,600]:d.line((x,100,x,600),fill=0,width=3)
        for y in [100,200,350,500,600]:d.line((100,y,600,y),fill=0,width=3)
        result=grid.detect_grid(np.array(im))
        self.assertEqual(len(result['xs']),4);self.assertEqual(len(result['ys']),5)
        for got,want in zip(result['xs'],[100,200,350,600]):self.assertLessEqual(abs(got-want),2)
        for got,want in zip(result['ys'],[100,200,350,500,600]):self.assertLessEqual(abs(got-want),2)

    def test_blank_or_outer_border_is_not_a_table(self):
        im=Image.new('L',(800,700),255)
        self.assertIsNone(grid.detect_grid(np.array(im)))
        ImageDraw.Draw(im).rectangle((100,100,600,600),outline=0,width=3)
        self.assertIsNone(grid.detect_grid(np.array(im)))

    def test_fragmented_slightly_sloping_rules_remain_separate_columns(self):
        im=Image.new('L',(1600,1200),255);d=ImageDraw.Draw(im)
        for x in [100,1450]:d.line((x,100,x,1000),fill=0,width=3)
        expected=[100,300,500,700,900,1100,1300,1450]
        for x in expected[1:-1]:
            for y in range(100,1000,100):
                shift=(y//100)%3
                d.line((x+shift,y+6,x+shift,y+94),fill=0,width=2)
        for y in range(100,1001,100):d.line((100,y,1450,y),fill=0,width=2)
        result=grid.detect_grid(np.array(im))
        self.assertEqual(len(result['xs']),len(expected))
        for got,want in zip(result['xs'],expected):self.assertLessEqual(abs(got-want),4)

    def cell(self):
        im=Image.new('RGB',(220,160),'white');d=ImageDraw.Draw(im)
        for y in [30,70,110]:d.rectangle((20,y,75,y+14),fill='black')
        d.rectangle((130,70,180,84),fill='black');return im

    def test_range_mean_split_preserves_pixels_and_reading_order(self):
        im=self.cell();boxes=split.split(im);self.assertEqual(len(boxes),2)
        self.assertLess(boxes[0][0],boxes[1][0])
        count=lambda image:sum(image.convert('L').histogram()[:150])
        self.assertEqual(sum(count(im.crop(b)) for b in boxes),count(im))

    def test_single_edge_pixel_stays_in_crop_but_is_not_a_fourth_line(self):
        im=self.cell();im.putpixel((20,5),(0,0,0));boxes=split.split(im)
        self.assertEqual(len(boxes),2)
        count=lambda image:sum(image.convert('L').histogram()[:150])
        self.assertEqual(sum(count(im.crop(b)) for b in boxes),count(im))
        im.putpixel((21,5),(0,0,0));self.assertIsNone(split.split(im))

    def test_unclear_shape_is_not_forced(self):
        im=Image.new('RGB',(220,160),'white');ImageDraw.Draw(im).rectangle((20,50,180,70),fill='black')
        self.assertIsNone(split.split(im))

if __name__=='__main__':unittest.main()
