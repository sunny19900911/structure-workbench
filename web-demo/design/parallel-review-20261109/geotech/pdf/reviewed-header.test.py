import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('split', Path(__file__).with_name('split-range-mean.py'))
split = importlib.util.module_from_spec(spec)
spec.loader.exec_module(split)


class HeaderReview(unittest.TestCase):
    def test_review_is_explicit_and_bound_to_page_and_cell(self):
        with tempfile.TemporaryDirectory() as directory:
            page, cell = Path(directory)/'page.png', Path(directory)/'header.png'
            page.write_bytes(b'original page');cell.write_bytes(b'original header')
            digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
            grid = {'sourceImage': str(page), 'sha256': digest(page), 'cells': [{'row': 0, 'column': 4, 'image': str(cell)}]}
            review = {'method': 'visual-review', 'column': 4, 'sourceImageSha256': digest(page), 'headerImageSha256': digest(cell), 'label': '层顶标高', 'unit': 'm'}
            result = split.reviewed_headers(grid, [review])[4]
            self.assertEqual(result['headerRecognition'], 'visual-review-not-ocr')
            self.assertEqual(result['label'], '层顶标高m')
            for changes in [{'method': 'ocr'}, {'unit': 'MPa'}, {'column': 3}, {'sourceImageSha256': 'other'}]:
                with self.assertRaises(ValueError):split.reviewed_headers(grid, [{**review, **changes}])
            cell.write_bytes(b'changed')
            with self.assertRaises(ValueError):split.reviewed_headers(grid, [review])
            cell.write_bytes(b'original header');page.write_bytes(b'changed')
            with self.assertRaises(ValueError):split.reviewed_headers(grid, [review])


if __name__ == '__main__':
    unittest.main()
