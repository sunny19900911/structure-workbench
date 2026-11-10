import importlib.util
from pathlib import Path
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('bands', Path(__file__).with_name('scan-table-bands.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class BandsTest(unittest.TestCase):
    def test_pixels_and_vertical_alignment_preserved(self):
        im = Image.new('RGB', (100, 60)); im.putpixel((10, 25), (1, 2, 3)); im.putpixel((90, 25), (4, 5, 6))
        original = im.tobytes()
        canvas, boxes = module.join_bands(im, [[0, 0, .2, 1], [.8, 0, 1, 1]])
        self.assertEqual(canvas.size, (40, 60))
        self.assertEqual(canvas.getpixel((10, 25)), (1, 2, 3))
        self.assertEqual(canvas.getpixel((30, 25)), (4, 5, 6))
        self.assertEqual(im.tobytes(), original)

    def test_different_y_or_overlapping_bands_rejected(self):
        for bands in [[[0, 0, .4, 1], [.8, .1, 1, 1]], [[0, 0, .4, 1], [.3, 0, .6, 1]]]:
            with self.assertRaises(ValueError): module.join_bands(Image.new('RGB', (100, 100)), bands)

    def test_bad_or_empty_coordinates_rejected(self):
        for bands in [[], [[-.1, 0, .4, 1]], [[0, 0, .001, 1]]]:
            with self.assertRaises(ValueError): module.join_bands(Image.new('RGB', (100, 100)), bands)


if __name__ == '__main__': unittest.main()
