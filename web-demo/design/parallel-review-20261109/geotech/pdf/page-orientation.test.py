import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
import pdfplumber
from reportlab.pdfgen import canvas

spec=importlib.util.spec_from_file_location('orientation',Path(__file__).with_name('page-orientation.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class OrientationTests(unittest.TestCase):
    def test_both_sideways_directions_become_forward_text(self):
        for direction in [90,270]:
            content=io.BytesIO();c=canvas.Canvas(content,pagesize=(600,600))
            c.translate(300,300);c.rotate(direction);c.setFont('Helvetica',10)
            for i in range(5):c.drawString(-150,-i*20,'TEST sample row %s value 123.45'%i)
            c.save();raw=content.getvalue()
            with pdfplumber.open(io.BytesIO(raw)) as doc:
                angle=m.rotation_for(doc.pages[0].chars)
                self.assertEqual(angle,direction)
                normalized=m.rotated_bytes(io.BytesIO(raw),0,angle)
                with pdfplumber.open(io.BytesIO(normalized)) as after:
                    p=after.pages[0]
                    self.assertTrue(all(ch['upright'] for ch in p.chars))
                    self.assertIn('TEST sample row 0 value 123.45',p.extract_text())
                    self.assertEqual(len(doc.pages[0].chars),len(p.chars))
    def test_mixed_direction_and_small_labels_are_not_rotated(self):
        side={'text':'1','matrix':(0,-1,1,0,0,0)}
        upright={'text':'1','matrix':(1,0,0,1,0,0)}
        self.assertEqual(m.rotation_for([side]*90+[upright]*10),0)
        self.assertEqual(m.rotation_for([side]*20),0)
        self.assertEqual(m.rotation_for([upright]*100),0)
    def test_original_coordinates_round_trip_for_both_directions(self):
        box=[100,40,220,90]
        for angle in [90,270]:
            self.assertEqual(m.source_box(m.normalized_box(box,angle,1191,842),angle,1191,842),box)
    def test_only_near_axis_edges_are_corrected(self):
        edges=[{'x0':x,'x1':x+1e-12,'top':0,'bottom':100} for x in [10,20]]
        edges += [{'x0':10,'x1':20,'top':y,'bottom':y+1e-12} for y in [0,100]]
        edges += [{'x0':10,'x1':20,'top':0,'bottom':100}]
        settings=m.orthogonal_table_settings(SimpleNamespace(edges=edges))
        self.assertEqual(len(settings['explicit_vertical_lines']),2)
        self.assertEqual(len(settings['explicit_horizontal_lines']),2)
    def test_nested_cells_keep_source_location(self):
        value={'bbox':[40,971,90,1091],'cellOrigins':[[{'bbox':[40,971,90,1091]}]]}
        m.annotate_source_boxes(value,270,1191,842)
        self.assertEqual(value['sourceBBox'],[100,40,220,90])
        self.assertEqual(value['cellOrigins'][0][0]['sourceBBox'],value['sourceBBox'])

if __name__=='__main__':unittest.main()
