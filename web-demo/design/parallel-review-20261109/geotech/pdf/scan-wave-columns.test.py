import importlib.util
from pathlib import Path
import unittest
from PIL import Image,ImageDraw

spec=importlib.util.spec_from_file_location('wave_columns',Path(__file__).with_name('scan-wave-columns.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def panel(remove=None):
    im=Image.new('RGB',(720,1000),'white');d=ImageDraw.Draw(im)
    xs=[20,45,160,210,260,310,650,700]
    for i,x in enumerate(xs):
        if i!=remove:d.line((x,10 if i in (0,7) else 200,x,960),fill='black',width=2)
    # A plot axis starts below the header; it must not create another column.
    d.line((350,255,350,960),fill='black',width=2)
    for y in [10,200,255,960]:d.line((20,y,700,y),fill='black',width=2)
    return im


def header(labels):
    return {'type':'table_body','content':'<table><tr>'+''.join('<td>'+x+'</td>' for x in labels)+'</tr></table>'}


class WaveColumnsTest(unittest.TestCase):
    def test_header_origin_excludes_plot_axis_at_two_scales(self):
        for scale in [1,2]:
            im=panel().resize((720*scale,1000*scale))
            g=m.locate_columns(im,[0,0,1,1]);self.assertIsNotNone(g)
            self.assertEqual(len(g['xs']),8)
            self.assertTrue(all(abs(x-350*scale)>5 for x in g['xs']))
            self.assertLess(abs(g['headerTop']-200*scale),5)

    def test_missing_rule_and_blank_image_rejected(self):
        self.assertIsNone(m.locate_columns(panel(remove=4),[0,0,1,1]))
        self.assertIsNone(m.locate_columns(Image.new('RGB',(720,1000),'white'),[0,0,1,1]))

    def test_invalid_box_rejected(self):
        self.assertIsNone(m.locate_columns(panel(),[-.1,0,1,1]))

    def test_explicit_header_and_units_required(self):
        labels=['序号','地层名称','深度(m)','厚度(m)','柱状图','0 250 500','层速度(m/s)']
        self.assertTrue(m.verified_header(header(labels)))
        for index,value in [(1,''),(2,'深度'),(3,'厚度(cm)'),(6,'等效速度(m/s)')]:
            changed=labels.copy();changed[index]=value
            self.assertFalse(m.verified_header(header(changed)))

    def test_multiple_header_candidates_rejected(self):
        labels=['序号','地层名称','深度(m)','厚度(m)','柱状图','0','层速度(m/s)']
        self.assertFalse(m.verified_header([header(labels),header(labels)]))


if __name__=='__main__':unittest.main()
