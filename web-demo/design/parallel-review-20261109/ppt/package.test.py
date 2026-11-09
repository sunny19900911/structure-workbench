import base64,importlib.util,io,unittest,zipfile
from pathlib import Path
from PIL import Image
from pptx import Presentation
from pptx.util import Inches
ROOT=Path(__file__).parents[3]
spec=importlib.util.spec_from_file_location('ppt',ROOT/'server/office-ppt-package.py');ppt=importlib.util.module_from_spec(spec);spec.loader.exec_module(ppt)
def edit(payload,**cmd):
    with ppt.b.load_package(payload,'pptx') as z:return ppt.edit(z,cmd)
def view(data):
    with ppt.b.load_package(data,'pptx') as z:return ppt.inspect(z)
def fixture():
    p=Presentation();s=p.slides.add_slide(p.slide_layouts[6]);t=s.shapes.add_textbox(Inches(1),Inches(.2),Inches(8),Inches(1));t.text='结构方案'
    t=s.shapes.add_textbox(Inches(1),Inches(2),Inches(8),Inches(4));t.name='模型图';t.text='模型图'
    out=io.BytesIO();p.save(out);return out.getvalue()
def image():
    out=io.BytesIO();Image.new('RGB',(120,60),'green').save(out,format='PNG');return 'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()
class Tests(unittest.TestCase):
    def test_library_placement_reopen_edit_and_preserved_parts(self):
        original=fixture();data=edit(original,op='ppt.image.import',name='模型图.png',data=image());v=view(data)
        self.assertEqual(len(v['slides'][0]['shapes']),2);item=v['imageLibrary'][0];slot=v['slides'][0]['shapes'][1]
        data=edit(data,op='ppt.image.place',imageId=item['id'],slide=1,shapeId=slot['id']);p=Presentation(io.BytesIO(data));shape=p.slides[0].shapes[1]
        self.assertEqual(shape.shape_type,13);self.assertEqual(shape.width/shape.height,2);self.assertEqual(shape.left,914400)
        data=edit(data,op='ppt.image.import',name='未知.png',data=image(),reason='未匹配图位');self.assertEqual(view(data)['imageLibrary'][1]['status'],'unplaced')
        # Native object remains editable after save and download; manual layout is retained.
        target=view(data)['slides'][0]['shapes'][1];data=edit(data,op='shape.geometry',slide=1,shapeId=target['id'],expectedGeometry={k:target[k] for k in ('x','y','width','height')},x=1800000)
        self.assertEqual(Presentation(io.BytesIO(data)).slides[0].shapes[1].left,1800000)
        with zipfile.ZipFile(io.BytesIO(original)) as a,zipfile.ZipFile(io.BytesIO(data)) as b:
            for name in a.namelist():
                if name not in ('ppt/slides/slide1.xml','ppt/slides/_rels/slide1.xml.rels','[Content_Types].xml','_rels/.rels'):self.assertEqual(a.read(name),b.read(name),name)
    def test_occupied_and_repeated_placement_rejected(self):
        data=edit(fixture(),op='ppt.image.import',name='模型图.png',data=image());v=view(data);item=v['imageLibrary'][0];slot=v['slides'][0]['shapes'][1]
        data=edit(data,op='ppt.image.place',imageId=item['id'],slide=1,shapeId=slot['id'])
        with self.assertRaises(ppt.b.OfficeError):edit(data,op='ppt.image.place',imageId=item['id'],slide=1)
        data=edit(data,op='ppt.image.import',name='模型图.png',data=image());v=view(data)
        with self.assertRaises(ppt.b.OfficeError):edit(data,op='ppt.image.place',imageId=v['imageLibrary'][1]['id'],slide=1,shapeId=v['slides'][0]['shapes'][1]['id'])
    def test_manual_slot_text_preserved_and_deleted_image_returns_to_library(self):
        data=fixture();slot=view(data)['slides'][0]['shapes'][1]
        data=edit(data,op='shape.text',slide=1,shapeId=slot['id'],expectedText='模型图',text='人工说明，不作为图位')
        self.assertFalse(view(data)['slides'][0]['shapes'][1]['imageSlot'])
        data=edit(data,op='ppt.image.import',name='新增图.png',data=image());item=view(data)['imageLibrary'][0]
        data=edit(data,op='ppt.image.place',imageId=item['id'],slide=1);v=view(data);picture=v['slides'][0]['shapes'][-1]
        data=edit(data,op='shape.delete',slide=1,shapeId=picture['id']);self.assertEqual(view(data)['imageLibrary'][0]['status'],'unplaced')
if __name__=='__main__':unittest.main()
