import copy
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('names',Path(__file__).with_name('corroborate-layer-names.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


def fixture():
    chart={'sourceSha256':'a'*64,'page':77,'status':'candidate','layerNumberingVerified':True,
           'rows':[{'values':['土层1','1.3','杂填+','131.2','杂填+'],
                    'cells':[{'sourceColumn':2,'text':'杂填+','box':[[1,1],[2,1],[2,2],[1,2]]}]}]}
    evidence={'sourceSha256':'a'*64,'headings':[{'layer':1,'name':'杂填土','page':12,
              'box':[[1,1],[2,1],[2,2],[1,2]],'pageImageSha256':'b'*64,
              'rawText':'第(1)层：杂填土（Q4）','visuallyReviewed':True}]}
    return chart,evidence


class Corroboration(unittest.TestCase):
    def test_reading_retains_raw_and_inputs(self):
        chart,evidence=fixture();before=copy.deepcopy((chart,evidence))
        result=module.corroborate(chart,evidence)
        self.assertEqual(result['cells'][0]['proposedName'],'杂填土')
        self.assertEqual(result['cells'][0]['rawText'],'杂填+')
        self.assertFalse(result['automaticAdoption'])
        self.assertEqual((chart,evidence),before)

    def test_no_cross_project_or_unverified_mapping(self):
        chart,evidence=fixture();evidence['sourceSha256']='c'*64
        with self.assertRaises(ValueError):module.corroborate(chart,evidence)
        chart,evidence=fixture();chart['layerNumberingVerified']=False
        with self.assertRaises(ValueError):module.corroborate(chart,evidence)

    def test_conflicting_and_unreviewed_headings_remain_unresolved(self):
        for kind in ['conflict','unreviewed','missing']:
            chart,evidence=fixture()
            if kind=='conflict':evidence['headings'].append({**evidence['headings'][0],'name':'素填土'})
            if kind=='unreviewed':evidence['headings'][0]['visuallyReviewed']=False
            if kind=='missing':evidence['headings']=[]
            self.assertEqual(module.corroborate(chart,evidence)['cells'][0]['status'],'unresolved')

    def test_abbreviation_and_other_errors_not_rewritten(self):
        for raw in ['杂填','杂真土','强风化','131.2']:
            chart,evidence=fixture();chart['rows'][0]['cells'][0]['text']=raw
            self.assertNotIn('proposedName',module.corroborate(chart,evidence)['cells'][0])

    def test_name_must_be_explicit_in_heading_not_metadata_only(self):
        chart,evidence=fixture();evidence['headings'][0]['rawText']='第(1)层：素填土（Q4）'
        self.assertEqual(module.corroborate(chart,evidence)['cells'][0]['status'],'unresolved')


if __name__=='__main__':unittest.main()
