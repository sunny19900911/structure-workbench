import importlib.util
from pathlib import Path
import unittest
from PIL import Image, ImageDraw

spec=importlib.util.spec_from_file_location('layout',Path(__file__).with_name('ocr-line-layout.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class LayoutTests(unittest.TestCase):
    def sample(self, count):
        image=Image.new('RGB',(120,180),'white');draw=ImageDraw.Draw(image)
        for i in range(count):draw.rectangle((20,10+i*30,55,18+i*30),fill=(40+i,40+i,40+i))
        return image

    def test_pixel_rectangles_are_exact_and_ordered(self):
        original=self.sample(3);out,mapping,status=module.reflow(original)
        self.assertEqual(len(mapping),3)
        for item in mapping:
            self.assertEqual(original.crop(item['sourceBox']).tobytes(),out.crop(item['outputBox']).tobytes())
        self.assertEqual(sum(original.convert('L').histogram()[:150]),sum(out.convert('L').histogram()[:150]))
        self.assertEqual([m['sourceBox'][1] for m in mapping],sorted(m['sourceBox'][1] for m in mapping))

    def test_single_and_many_lines_remain_unchanged(self):
        for count in [1,5]:
            original=self.sample(count);out,mapping,status=module.reflow(original)
            self.assertEqual(original.tobytes(),out.tobytes());self.assertEqual(mapping,[])

    def test_unassigned_punctuation_forces_unchanged(self):
        original=self.sample(3);original.putpixel((100,150),(0,0,0))
        out,mapping,status=module.reflow(original)
        self.assertEqual(original.tobytes(),out.tobytes());self.assertIn('conservation',status)

    def test_outer_pixel_is_carried_with_original_rectangle(self):
        original=self.sample(3);original.putpixel((30,0),(0,0,0))
        out,mapping,status=module.reflow(original)
        self.assertEqual(len(mapping),3)
        self.assertEqual(mapping[0]['sourceBox'][1],0)
        for item in mapping:
            self.assertEqual(original.crop(item['sourceBox']).tobytes(),out.crop(item['outputBox']).tobytes())
        self.assertEqual(sum(original.convert('L').histogram()[:150]),sum(out.convert('L').histogram()[:150]))

if __name__=='__main__':unittest.main()
