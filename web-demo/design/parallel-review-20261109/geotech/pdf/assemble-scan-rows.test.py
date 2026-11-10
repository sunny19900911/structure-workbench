import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('assembly', Path(__file__).with_name('assemble-scan-rows.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    identity = dict(sourceSha256='source', pageImageSha256='page', physicalPage=17)
    return dict(identity=identity, expectedRows=[1, 2], headerEvidence={'3': {'label': '层厚m'}, '4': {'label': '层顶标高m'}},
                cells=[{'row': r, 'column': 2, 'bbox': [0, r, 2, r+1]} for r in (1, 2)],
                fields=[dict(identity=identity.copy(), row=r, key='soilName', bbox=[0, r, 2, r+1],
                             comparison={'status': 'view-agreement', 'automaticAdoption': False,
                                         'candidates': [{'value': '砂质粉土'}]}) for r in (1, 2)])


class AssemblyTest(unittest.TestCase):
    def test_same_name_stays_in_two_rows_and_missing_fields_remain_visible(self):
        source = fixture(); before = copy.deepcopy(source)
        result = module.assemble(source)
        self.assertEqual(len(result['rows']), 2)
        self.assertIn('layerCode', result['rows'][0]['missingFields'])
        self.assertFalse(result['automaticAdoption'])
        self.assertEqual(source, before)
        self.assertEqual(result['rows'][0]['reviewFields'], ['soilName'])
        self.assertEqual(result['rows'][0]['viewAgreementFields'], ['soilName'])
        self.assertEqual(result['rows'][0]['sourceVerification'], 'not-recorded')

    def test_wrong_source_page_geometry_or_duplicate_fails(self):
        for key in ['sourceSha256', 'pageImageSha256', 'physicalPage']:
            data = fixture(); data['fields'][0]['identity'][key] = 'other'
            with self.assertRaises(ValueError): module.assemble(data)
        data = fixture(); data['fields'][0]['bbox'] = [0, 0, 0, 0]
        with self.assertRaises(ValueError): module.assemble(data)
        data = fixture(); data['fields'].append(data['fields'][0])
        with self.assertRaises(ValueError): module.assemble(data)

    def test_invalid_or_single_view_is_not_ready(self):
        data = fixture(); data['fields'][0]['comparison']['status'] = 'review-invalid-format'
        result = module.assemble(data)
        self.assertEqual(result['rows'][0]['reviewFields'], ['soilName'])

    def test_wrong_unit_or_unbound_review_fails(self):
        data = fixture(); data['headerEvidence']['4']['label'] = '层顶埋深m'
        with self.assertRaises(ValueError): module.assemble(data)
        data = fixture(); data['headerEvidence']['4'].update(headerRecognition='visual-review-not-ocr', headerReview={'sourceImageSha256':'other','method':'visual-review'})
        with self.assertRaises(ValueError): module.assemble(data)


if __name__ == '__main__': unittest.main()
