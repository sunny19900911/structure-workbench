import importlib.util
import io
import unittest
from pathlib import Path
from reportlab.pdfgen import canvas
import pdfplumber

spec=importlib.util.spec_from_file_location('reader',Path(__file__).with_name('extract-native-report.py'))
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)

class ReadingOrderTests(unittest.TestCase):
    def test_only_verified_marker_font_size_and_zero_advance_are_excluded(self):
        marker={'object_type':'char','fontname':'ABCDEF+ZWAdobeF','size':1.02,'adv':0,'x0':60,'x1':60,'text':'2B'}
        self.assertTrue(reader.nonprinting_marker(marker))
        for changes in [{'fontname':'Arial'},{'fontname':'ZWAdobeFake'},{'size':12},{'adv':1},{'x1':61},{'object_type':'rect'}]:
            self.assertFalse(reader.nonprinting_marker({**marker,**changes}))
        self.assertFalse(reader.nonprinting_marker({'object_type':'char','text':'2B2B'}))

    def test_large_leading_requires_full_line_and_unindented_similar_size_continuation(self):
        previous={'text':'continued', 'bbox':[64,100,550,112]}
        current={'text':'body', 'bbox':[40,125,300,137]}
        self.assertTrue(reader.wide_spaced_continuation(previous,current,40,550))
        for box in [[64,125,300,137],[40,140,300,152],[40,125,300,145]]:
            self.assertFalse(reader.wide_spaced_continuation(previous,{**current,'bbox':box},40,550))
        self.assertFalse(reader.wide_spaced_continuation({**previous,'bbox':[64,100,300,112]},current,40,550))
        self.assertFalse(reader.wide_spaced_continuation({**previous,'text':'结束。'},current,40,550))
        self.assertFalse(reader.wide_spaced_continuation(previous,{**current,'text':'图3 地质构造'},40,550))

    def test_large_leading_reflows_real_pdf_lines_without_swallowing_indented_paragraph(self):
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800));c.setFont('Helvetica',12)
        text='A long line continuing'
        c.drawString(40,700,text);c.drawString(40,675,'to this next line')
        c.drawString(64,650,'Indented paragraph')
        c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:blocks,_=reader.page_blocks(pdf.pages[0],1)
        paragraphs=[b['text'] for b in blocks if b['kind']=='paragraph']
        self.assertEqual(paragraphs,['A long line continuingto this next line','Indented paragraph'])

    def test_image_heavy_page_retains_native_caption_and_continuing_body(self):
        from PIL import Image
        from reportlab.lib.utils import ImageReader
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800))
        c.drawImage(ImageReader(Image.new('RGB',(500,650),'lightgray')),40,100,500,650)
        c.drawString(40,80,'Figure 1: regional faults')
        c.drawString(40,60,'Fault length exceeds 400km. The following conditions continue')
        c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:
            page=pdf.pages[0]
            self.assertLess(len(page.chars),200)
            self.assertGreater(sum(im['width']*im['height'] for im in page.images),page.width*page.height*.5)
            result=reader.read_available_text(None,page,1)
        text=''.join(b.get('text','') for b in result['blocks'])
        self.assertIn('400km',text)
        self.assertIn('conditions continue',text)
        self.assertIn('regional faults',text)

    def test_image_only_page_does_not_invent_native_text(self):
        from PIL import Image
        from reportlab.lib.utils import ImageReader
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800))
        c.drawImage(ImageReader(Image.new('RGB',(500,650),'lightgray')),40,100,500,650)
        c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:
            result=reader.read_available_text(None,pdf.pages[0],1)
        self.assertEqual(result['blocks'],[])

    def test_background_filter_keeps_rules_outlines_and_text(self):
        background={'object_type':'rect','fill':True,'stroke':False,'width':50,'height':20}
        self.assertFalse(reader.keep_grid_object(background))
        self.assertTrue(reader.keep_grid_object({**background,'stroke':True}))
        self.assertTrue(reader.keep_grid_object({**background,'height':0.7}))
        self.assertTrue(reader.keep_grid_object({'object_type':'char','text':'3.20'}))
        self.assertTrue(reader.keep_grid_object({'object_type':'line'}))

    def test_touching_numbers_across_border_are_flagged_not_silently_split(self):
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800))
        for x in [40,150,260]:c.line(x,650,x,730)
        for y in [650,690,730]:c.line(40,y,260,y)
        c.setFont('Helvetica',10);c.drawString(120,710,'107.5103.70')
        c.drawString(55,670,'12.50');c.drawString(170,670,'20.60');c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:table=reader.glyph_table(pdf.pages[0].find_tables()[0])
        self.assertEqual(table['rows'],[['',''],['12.50','20.60']])
        self.assertEqual(table['numericBoundaryWarnings'][0]['text'],'107.5103.70')
        self.assertTrue(table['cellOrigins'][0][0]['requiresReview'])
        self.assertTrue(table['cellOrigins'][0][1]['unreviewedText'])
        self.assertTrue(table['rawRows'][0][0])

    def test_repeated_small_margin_is_removed_before_joining_but_body_is_preserved(self):
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800))
        for i in range(3):
            c.setFont('Helvetica',8);c.drawString(40,750,'Repeated report header')
            c.setFont('Helvetica',12);c.drawString(40,732,'Repeated real heading')
            for j in range(10):c.drawString(40,700-j*20,'Real body and conditions remain unchanged.')
            c.setFont('Helvetica',8);c.drawString(40,400,'Repeated report header')
            if i==0:c.drawString(40,25,'One-off footer note')
            c.showPage()
        c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:
            margins=reader.repeated_margins(pdf.pages)
            self.assertEqual(sum(map(len,margins.values())),3)
            for i,page in enumerate(pdf.pages,1):
                blocks,_=reader.page_blocks(page,i,margins[i])
                text=''.join(b.get('text','') for b in blocks)
                self.assertEqual(text.replace(' ','').count('Repeatedreportheader'),1,text)
                self.assertIn('Repeated real heading',text)
                self.assertEqual(text.count('Real body and conditions remain unchanged.'),10)
                if i==1:self.assertIn('One-offfooternote',text.replace(' ',''))

    def test_cell_scripts_preserve_chemical_order_and_do_not_take_neighbour_values(self):
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800))
        for x in [40,150,260]:c.line(x,650,x,730)
        for y in [650,690,730]:c.line(40,y,260,y)
        c.setFont('Helvetica',12);c.drawString(55,710,'SO')
        x=55+c.stringWidth('SO','Helvetica',12)
        c.setFont('Helvetica',6);c.drawString(x,707,'4');c.drawString(x+4,715,'2-')
        c.setFont('Helvetica',12);c.drawString(170,710,'14.57-18.64');c.drawString(55,670,'NH')
        x=55+c.stringWidth('NH','Helvetica',12)
        c.setFont('Helvetica',6);c.drawString(x,667,'4');c.drawString(x+4,675,'+')
        c.setFont('Helvetica',12);c.drawString(170,670,'0.00');c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:
            table=reader.glyph_table(pdf.pages[0].find_tables()[0])
        self.assertEqual(table['rows'],[['SO₄²⁻','14.57-18.64'],['NH₄⁺','0.00']])
        self.assertIn('originalText',table['cellOrigins'][0][0])

    def test_subscript_and_superscript_stay_with_existing_host_not_next_line(self):
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800));c.setFont('Helvetica',12)
        c.drawString(40,700,'Formation Q');x=40+c.stringWidth('Formation Q','Helvetica',12)
        c.setFont('Helvetica',7);c.drawString(x,697,'4');c.drawString(x,706,'3')
        c.setFont('Helvetica',12);c.drawString(x+7,700,' layer ends.')
        c.drawString(40,680,'Next layer 123.45 remains intact.');c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:lines=reader.glyph_module.glyph_lines(pdf.pages[0])
        self.assertEqual(len(lines),2)
        self.assertIn('Q³₄',lines[0]['text']);self.assertIn('123.45',lines[1]['text'])

    def test_two_columns_remain_separate_and_page_number_is_removed(self):
        data=io.BytesIO();c=canvas.Canvas(data,pagesize=(600,800));c.setFont('Helvetica',10)
        for i in range(15):
            c.drawString(40,720-i*18,f'Left report line {i} ends here.')
            c.drawString(340,720-i*18,f'Right report line {i} ends here.')
        c.drawString(295,25,'9');c.save();data.seek(0)
        with pdfplumber.open(data) as pdf:
            blocks,split=reader.page_blocks(pdf.pages[0],1)
        self.assertIsNotNone(split)
        self.assertEqual([b['column'] for b in blocks],sorted(b['column'] for b in blocks))
        self.assertTrue(any('Left report line 0' in b['text'] for b in blocks))
        self.assertTrue(any('Right report line 0' in b['text'] for b in blocks))
        self.assertFalse(any('Left' in b['text'] and 'Right' in b['text'] for b in blocks))
        self.assertFalse(any(b['text']=='9' for b in blocks))

if __name__=='__main__':unittest.main()
