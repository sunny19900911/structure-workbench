import base64
import importlib.util
import io
import unittest
import zipfile
from pathlib import Path
from PIL import Image
from pptx import Presentation

ROOT=Path(__file__).parents[3]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
ppt=module('ppt_extension',ROOT/'server/office-ppt-package.py')
fixture=module('existing_fixture',ROOT/'design/office-editor/package.test.py')

def parts(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:return {n:z.read(n) for n in z.namelist()}
def package(items):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        for name,data in items.items():z.writestr(name,data)
    return out.getvalue()
def edit(payload,**command):
    with ppt.b.load_package(payload,'pptx') as z:return ppt.edit(z,command)
def view(data):
    with ppt.b.load_package(data,'pptx') as z:return ppt.inspect(z)
def png():
    data=io.BytesIO();Image.new('RGB',(80,40),'green').save(data,format='PNG');return 'data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()

class PptTests(unittest.TestCase):
    def test_text_paragraph_format_geometry_and_independent_reopen(self):
        before=fixture.presentation()
        data=edit(before,op='shape.text',slide=1,shapeId='2',expectedText='框架结构说明',text='框架结构修改稿\n柱网与抗侧力体系')
        data=edit(data,op='shape.format',slide=1,shapeId='2',fontSize=32,fontFace='Arial',underline=True,bold=False,italic=True,color='#456789',align='ctr')
        original=view(data)['slides'][0]['shapes'][0]
        data=edit(data,op='shape.geometry',slide=1,shapeId='2',expectedGeometry={k:original[k] for k in ['x','y','width','height']},x=360000,y=720000,width=3600000,height=1800000)
        reopened=Presentation(io.BytesIO(data));shape=reopened.slides[0].shapes[0]
        self.assertEqual(shape.text,'框架结构修改稿\n柱网与抗侧力体系')
        self.assertEqual((shape.left,shape.top,shape.width,shape.height),(360000,720000,3600000,1800000))
        self.assertEqual(shape.text_frame.paragraphs[0].runs[0].font.size.pt,32)
        self.assertFalse(shape.text_frame.paragraphs[0].runs[0].font.bold)
        self.assertEqual(shape.text_frame.paragraphs[0].runs[0].font.name,'Arial')
        self.assertTrue(shape.text_frame.paragraphs[0].runs[0].font.underline)
        self.assertEqual(str(shape.text_frame.paragraphs[0].runs[0].font.color.rgb),'456789')
        old,new=parts(before),parts(data)
        self.assertEqual([n for n in old if old[n]!=new[n]],['ppt/slides/slide1.xml'])

    def test_slide_order_add_copy_delete_and_notes_backlink(self):
        items=parts(fixture.presentation())
        items['ppt/slides/_rels/slide1.xml.rels']=f'<Relationships xmlns="{ppt.REL}"><Relationship Id="rIdN" Type="{ppt.R}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>'.encode()
        items['ppt/notesSlides/notesSlide1.xml']=f'<p:notes xmlns:p="{ppt.P}"><p:cSld/></p:notes>'.encode()
        items['ppt/notesSlides/_rels/notesSlide1.xml.rels']=f'<Relationships xmlns="{ppt.REL}"><Relationship Id="rIdS" Type="{ppt.R}/slide" Target="../slides/slide1.xml"/></Relationships>'.encode()
        data=edit(package(items),op='slide.duplicate',slide=1)
        with ppt.b.load_package(data,'pptx') as z:
            slides=ppt.b.presentation_slides(z)[2];newpart=slides[1][0]
            notes=next(iter(ppt.b.relations(z,newpart).values()))
            self.assertNotEqual(notes,'ppt/notesSlides/notesSlide1.xml')
            self.assertEqual(next(iter(ppt.b.relations(z,notes).values())),newpart)
        data=edit(data,op='shape.text',slide=2,shapeId='2',expectedText='框架结构说明',text='独立副本')
        self.assertEqual(view(data)['slides'][0]['shapes'][0]['text'],'框架结构说明')
        data=edit(data,op='slide.move',slide=2,to=1)
        self.assertEqual(view(data)['slides'][0]['shapes'][0]['text'],'独立副本')
        data=edit(data,op='slide.add',slide=1)
        self.assertEqual(len(view(data)['slides']),3);self.assertEqual(view(data)['slides'][1]['shapes'],[])
        data=edit(data,op='slide.delete',slide=1)
        self.assertEqual(len(view(data)['slides']),2)
        self.assertEqual(view(data)['slides'][1]['shapes'][0]['text'],'框架结构说明')
        self.assertEqual(parts(data)['custom/opaque.bin'],items['custom/opaque.bin'])

    def test_insert_picture_text_resize_and_delete(self):
        data=edit(fixture.presentation(),op='ppt.image.insert',slide=1,data=png(),x=900000,y=1800000,width=2400000,height=1200000)
        data=edit(data,op='shape.addText',slide=1,text='模型图',x=900000,y=3000000,width=2400000,height=400000)
        shapes=view(data)['slides'][0]['shapes'];self.assertEqual(len(shapes),3)
        picture=shapes[1];self.assertTrue(picture['imageDataUrl'].startswith('data:image/png'))
        data=edit(data,op='shape.geometry',slide=1,shapeId=picture['id'],expectedGeometry={k:picture[k] for k in ['x','y','width','height']},width=3000000,height=1500000)
        native=Presentation(io.BytesIO(data));self.assertEqual(native.slides[0].shapes[1].width,3000000)
        self.assertEqual(native.slides[0].shapes[1].image.size,(80,40))
        data=edit(data,op='shape.delete',slide=1,shapeId=shapes[2]['id'])
        self.assertEqual(len(view(data)['slides'][0]['shapes']),2)

    def test_reject_stale_invalid_and_last_page(self):
        data=fixture.presentation()
        for command in [dict(op='slide.delete',slide=1),dict(op='slide.move',slide=True,to=1),dict(op='slide.duplicate',slide=99),dict(op='shape.format',slide=1,shapeId='2',fontSize=1000),dict(op='shape.format',slide=1,shapeId='2',bold='false'),dict(op='ppt.image.insert',slide=1,data='data:image/png;base64,YWJj')]:
            with self.assertRaises(ppt.b.OfficeError):edit(data,**command)
        with self.assertRaises(ppt.b.OfficeError) as error:edit(data,op='shape.text',slide=1,shapeId='2',expectedText='旧值',text='不能覆盖')
        self.assertEqual(error.exception.code,'CONFLICT')
        with self.assertRaises(ppt.b.OfficeError) as error:edit(data,op='shape.geometry',slide=1,shapeId='2',expectedGeometry={'x':100,'y':200,'width':1,'height':1},x=500)
        self.assertEqual(error.exception.code,'CONFLICT')

if __name__=='__main__':unittest.main()
