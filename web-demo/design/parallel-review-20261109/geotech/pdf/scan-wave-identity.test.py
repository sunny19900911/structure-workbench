import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('identity',Path(__file__).with_name('scan-wave-identity.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class IdentityTests(unittest.TestCase):
    def document(self,text):return {'type':'table_body','content':'<table><tr><td>'+text+'</td></tr></table>'}
    def test_explicit_labels(self):
        r=m.identity(self.document('钻孔编号：ZK 35 孔口高程：106.25 终孔深度：22.50 等效速度：357.00'))
        self.assertEqual(r['status'],'identified');self.assertEqual(r['fields']['borehole'],'ZK35')
        self.assertEqual(r['fields']['equivalentVelocity'],'357.00');self.assertFalse(r['unitsInferred'])
    def test_layer_velocity_is_not_equivalent_velocity(self):
        r=m.identity(self.document('钻孔编号：ZK35 孔口高程：106.25 终孔深度：22.50 层速度(m/s)：543'))
        self.assertNotIn('equivalentVelocity',r['fields']);self.assertEqual(r['status'],'pending-identity')
    def test_conflicting_holes_are_not_silently_selected(self):
        r=m.identity([self.document('钻孔编号：ZK35'),self.document('钻孔编号：ZK36')])
        self.assertNotIn('borehole',r['fields']);self.assertEqual(r['conflicts']['borehole'],['ZK35','ZK36'])
    def test_missing_fields_are_not_calculated(self):
        r=m.identity(self.document('钻孔编号：ZK35 1 片岩 1.3 1.3 357 2 片岩 16.8 15.5 543'))
        self.assertEqual(r['fields'],{'borehole':'ZK35'})


if __name__=='__main__':unittest.main()
