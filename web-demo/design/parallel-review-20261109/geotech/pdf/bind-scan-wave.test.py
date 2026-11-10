import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('bind',Path(__file__).with_name('bind-scan-wave.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.s={'name':'page-121','sha256':'a','status':'data-bands-ready','headerEvidence':'header.json','pixelBoxes':[[0,0,10,10]]}
        self.i={'name':'page-121','sha256':'a','status':'identified','fields':{'borehole':'ZK35','equivalentVelocity':'357.00'},'ocrEvidence':'identity.json'}
        self.tables=[[['序号','地层名称','','厚度(m)','层速度(m/s)'],['1','片岩','1.3','1.3','357'],['2','片岩','16.8','15.5','543']]]
    def test_preserves_identity_and_layer_values_separately(self):
        result=m.bind(self.s,self.i,self.tables)
        self.assertEqual(result['identity']['equivalentVelocity'],'357.00')
        self.assertEqual(result['rows'][1][-1],'543');self.assertEqual(result['identityUnits'],{})
    def test_different_page_or_hash_rejected(self):
        for key,value in [('name','page-124'),('sha256','b')]:
            with self.assertRaises(ValueError):m.bind(self.s,{**self.i,key:value},self.tables)
    def test_ambiguous_or_broken_table_rejected(self):
        for tables in [self.tables*2,[[self.tables[0][0],['2','片岩','1.3','1.3','357']]],[[self.tables[0][0],['1','片岩','1.3','1.3','357 543']]]]:
            with self.assertRaises(ValueError):m.bind(self.s,self.i,tables)
    def test_unidentified_source_rejected(self):
        with self.assertRaises(ValueError):m.bind(self.s,{**self.i,'status':'pending-identity'},self.tables)


if __name__=='__main__':unittest.main()
