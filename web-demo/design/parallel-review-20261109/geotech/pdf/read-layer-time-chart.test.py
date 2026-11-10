import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('layer_chart',Path(__file__).with_name('read-layer-time-chart.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
HEAD='<tr><td>土层 深度(m) 土层描述 柱状图 速度m/s 岩性描述</td><td>单孔测试波速--时距图</td></tr>'


class ChartTest(unittest.TestCase):
    def test_graph_values_and_pattern_are_not_data_fields(self):
        text='<table>'+HEAD+'<tr><td>土层1</td><td>1.2</td><td>杂填土</td><td>||||</td><td>129.4</td><td>杂填土</td><td rowspan="2">0 500 1000</td></tr><tr><td>土层2</td><td>3.4</td><td>黏土</td><td></td><td>171.9</td><td>黏土</td></tr></table>'
        r=m.read_chart(text)
        self.assertEqual([x['values'] for x in r['rows']], [['土层1','1.2','杂填土','129.4','杂填土'],['土层2','3.4','黏土','171.9','黏土']])
        self.assertNotIn('厚度', ''.join(r['headers']))

    def test_measurement_point_table_and_wrong_units_are_not_this_profile(self):
        self.assertIsNone(m.read_chart('<table><tr><td>深度(m)</td><td>Ts(ms)</td><td>S波视速度(m/s)</td></tr></table>'))
        text='<table>'+HEAD.replace('速度m/s','速度km/s')+'<tr><td>土层1</td><td>1</td><td>土</td><td></td><td>2</td><td>土</td></tr></table>'
        self.assertIsNone(m.read_chart(text))

    def test_bad_numeric_and_ambiguous_columns_remain_pending(self):
        for cells in [['土层1','1.2','土','','12,4','土'],['土层1','1.2','土','12.4','土']]:
            text='<table>'+HEAD+'<tr>'+''.join('<td>'+v+'</td>' for v in cells)+'</tr></table>'
            r=m.read_chart(text);self.assertEqual(len(r['pending']),1);self.assertEqual(r['rows'],[])


if __name__=='__main__':unittest.main()
