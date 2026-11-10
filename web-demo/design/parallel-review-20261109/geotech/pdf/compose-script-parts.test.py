import unittest,importlib.util
from pathlib import Path
from copy import deepcopy
spec=importlib.util.spec_from_file_location('parts',Path(__file__).with_name('compose-script-parts.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class CompositionTests(unittest.TestCase):
    def evidence(self):
        digest='a'*64
        return {'geometryReviewed':True,'cropSha256':digest,'cropSize':[82,32],
         'linearizedRaw':'SO 4 2-', 'parts':[
          {'role':'body','raw':'SO','bbox':[18,4,44,29],'cropSha256':digest},
          {'role':'lowered','raw':'4','bbox':[43,17,51,30],'cropSha256':digest},
          {'role':'raised','raw':'2-','bbox':[50,2,66,17],'cropSha256':digest}]}
    def test_preserves_raw_and_spatial_not_plain_digit_sequence(self):
        e=self.evidence();before=deepcopy(e);out=m.compose_parts(e)
        self.assertEqual(out['text'],'SO₄²⁻');self.assertFalse(out['automaticAdoption'])
        self.assertEqual(e,before);self.assertEqual(out['evidence'],before)
    def test_ambiguity_or_view_conflict_is_not_repaired(self):
        for key,value in [('charge','='),('lower','{4'),('view','SO 4 2+')]:
            e=self.evidence()
            if key=='charge':e['parts'][2]['raw']=value
            elif key=='lower':e['parts'][1]['raw']=value
            else:e['linearizedRaw']=value
            self.assertEqual(m.compose_parts(e)['status'],'unresolved')
    def test_mixed_unreviewed_or_wrong_geometry_rejected(self):
        for variant in ['mixed','unreviewed','inverted','outside','duplicate']:
            e=self.evidence()
            if variant=='mixed':e['parts'][2]['cropSha256']='b'*64
            if variant=='unreviewed':e['geometryReviewed']=False
            if variant=='inverted':e['parts'][2]['bbox']=[50,20,66,31]
            if variant=='outside':e['parts'][2]['bbox']=[50,2,90,17]
            if variant=='duplicate':e['parts'].append(deepcopy(e['parts'][0]))
            self.assertEqual(m.compose_parts(e)['status'],'unresolved',variant)

if __name__=='__main__':unittest.main()
