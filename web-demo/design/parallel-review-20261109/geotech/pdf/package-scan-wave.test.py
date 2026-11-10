import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('package',Path(__file__).with_name('package-scan-wave.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class HeaderTests(unittest.TestCase):
    def test_whitespace_and_graph_columns_do_not_change_units(self):
        self.assertTrue(m.header_matches([[['序号','地层名称','深度 (m)','厚度 (m)','柱状 图','0 250 500','层速度 (m/s)']]]))
    def test_wrong_units_or_layer_meaning_are_rejected(self):
        for value in ['层速度(km/s)','等效速度(m/s)','层速度']:
            self.assertFalse(m.header_matches([[['序号','地层名称','深度(m)','厚度(m)','柱状图',value]]]))
    def test_multiple_headers_are_ambiguous(self):
        header=[['序号','地层名称','深度(m)','厚度(m)','柱状图','层速度(m/s)']]
        self.assertFalse(m.header_matches([header,header]));self.assertFalse(m.header_matches([]))


if __name__=='__main__':unittest.main()
