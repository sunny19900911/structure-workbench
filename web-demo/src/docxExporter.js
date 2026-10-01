import {
  AlignmentType, BorderStyle, Document, Footer, Header, PageNumber, PageOrientation,
  Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx';

const TWIP = {
  // docx 会在设置 landscape 时交换宽高；这里传入 A3 纵向值，OOXML 输出即为 23811×16838。
  pageWidth: 16838,
  pageHeight: 23811,
  marginTop: 1800,
  marginBottom: 1800,
  marginLeft: 1440,
  marginRight: 1440,
  header: 851,
  footer: 992,
  columnGap: 425,
  columnWidth: 10200,
};

const border = { style: BorderStyle.SINGLE, size: 4, color: '777777' };
const tableBorders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

const citationNumbers = {
  'SRC-USER-DECISION-20260916': 1,
  'SRC-01-2FOOD-REVIEW': 2,
  'SRC-01-OVERALL-REVIEW': 3,
  'SRC-01-STRUCT-DESIGN': 4,
  'SRC-01-PPT-SEISMIC': 5,
  'SRC-01-PPT-OVERVIEW': 6,
  'SRC-02-YUNNAN-LOADS': 7,
  'SRC-02-UNIFIED-MEASURES': 8,
  'SRC-04-GEO': 9,
  'SRC-05-ARCH': 10,
  'SRC-20260917-001': 11,
  'SRC-20260917-002': 12,
  'SRC-20260917-003': 13,
  'SRC-20260917-004': 14,
};

function citations(sourceIds = [], color = '666666') {
  return [...new Set(sourceIds)].filter((id) => citationNumbers[id]).map((id) => new TextRun({
    text: `[${citationNumbers[id]}]`, superScript: true, color, size: 15,
  }));
}

function heading(text, level = 1) {
  return new Paragraph({
    keepNext: true,
    spacing: { line: 360, before: level === 1 ? 180 : 100, after: 40 },
    children: [new TextRun({ text, bold: true, font: { name: 'Times New Roman', eastAsia: '宋体' }, size: level === 1 ? 28 : 24 })],
  });
}

function bodyParagraph(text, { color = '000000', bold = false, indent = true, sourceIds = [] } = {}) {
  return new Paragraph({
    spacing: { line: 360, after: 20 },
    indent: indent ? { firstLine: 480 } : undefined,
    children: [
      new TextRun({ text, bold, color, font: { name: 'Times New Roman', eastAsia: '宋体' }, size: 24 }),
      ...citations(sourceIds, color),
    ],
  });
}

function cellParagraph(text, { bold = false, color = '000000', size = 18, sourceIds = [] } = {}) {
  return new Paragraph({
    spacing: { line: 240, before: 0, after: 0 },
    children: [
      new TextRun({ text: text || '—', bold, color, size, font: { name: 'Times New Roman', eastAsia: '宋体' } }),
      ...citations(sourceIds, color),
    ],
  });
}

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill: 'E7E7E7', color: 'auto' },
    margins: { top: 70, bottom: 70, left: 70, right: 70 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 18, font: { name: 'Times New Roman', eastAsia: '宋体' } })] })],
  });
}

function valueCell(text, width, { color = '000000', sourceIds = [], note = '' } = {}) {
  const children = [cellParagraph(text, { color, sourceIds })];
  if (note) children.push(cellParagraph(`执行提示：${note}`, { color: '666666', size: 15 }));
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 65, bottom: 65, left: 75, right: 75 },
    children,
  });
}

function measureTable(rows) {
  const widths = [1900, 4650, 3650];
  return new Table({
    width: { size: TWIP.columnWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [headerCell('控制项', widths[0]), headerCell('2号学生食堂统一值', widths[1]), headerCell('人大通用参考', widths[2])],
      }),
      ...rows.map((row) => new TableRow({
        cantSplit: true,
        children: [
          valueCell(row.item, widths[0], { sourceIds: [...(row.project_sources || []), ...(row.renda_sources || [])] }),
          valueCell(row.project, widths[1], { sourceIds: row.project_sources, note: row.note }),
          valueCell(row.renda, widths[2], { color: row.renda === '—' ? '888888' : 'FF0000', sourceIds: row.renda_sources }),
        ],
      })),
    ],
  });
}

function referenceParagraph(ref) {
  return new Paragraph({
    spacing: { line: 240, after: 30 },
    indent: { hanging: 300 },
    children: [
      new TextRun({ text: `[${ref.refNo}] `, bold: true, size: 18, font: { name: 'Times New Roman', eastAsia: '宋体' } }),
      new TextRun({ text: ref.title, size: 18, font: { name: 'Times New Roman', eastAsia: '宋体' } }),
      ...(ref.locator ? [new TextRun({ text: `；定位：${ref.locator}`, color: '666666', size: 16, font: { name: 'Times New Roman', eastAsia: '宋体' } })] : []),
    ],
  });
}

export function buildUnifiedMeasuresDocument({ groups, references, projectName = '云南旅游职业学院龙泉路校区提升改造项目（一期）—2号学生食堂' }) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 360, after: 100 },
      children: [new TextRun({ text: '结构计算统一措施', bold: true, size: 36, font: { name: 'Times New Roman', eastAsia: '宋体' } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 300, after: 180 },
      children: [new TextRun({ text: projectName, bold: true, size: 24, font: { name: 'Times New Roman', eastAsia: '宋体' } })],
    }),
    heading('1 总则'),
    bodyParagraph('本统一措施由项目正式资料、用户确认口径、规范查表候选值及人大通用措施共同生成。当前项目资料和人工确认值优先；红色文字为人大通用参考，不得直接替代项目依据。', { sourceIds: ['SRC-USER-DECISION-20260916', 'SRC-02-UNIFIED-MEASURES'] }),
    bodyParagraph('规范查表数据为 AI 整理的 Markdown 摘录，尚未逐行与正式出版物及地方规定校对。抗震、风雪压和活荷载采用值必须由设计人员确认。', { color: 'FF0000', bold: true, sourceIds: ['SRC-20260917-001', 'SRC-20260917-002', 'SRC-20260917-003', 'SRC-20260917-004'] }),
  ];

  groups.forEach((group, index) => {
    children.push(heading(`${index + 2} ${group.title}`));
    if (group.summary) children.push(bodyParagraph(group.summary, { indent: false, color: '555555' }));
    children.push(measureTable(group.rows));
  });

  children.push(heading(`${groups.length + 2} 参考资料`));
  references.filter((ref) => ref.refNo).sort((a, b) => a.refNo - b.refNo).forEach((ref) => children.push(referenceParagraph(ref)));
  children.push(bodyParagraph('注：本文档为内部工作草案；定稿前应由结构负责人复核，并对照现行正式规范、地勘、建筑输入及最新计算模型。', { color: 'FF0000', bold: true, indent: false }));

  return new Document({
    creator: '结构设计 AI 工作台',
    title: '2号学生食堂｜结构计算统一措施',
    description: 'A3横向双栏结构计算统一措施工作稿',
    styles: {
      default: {
        document: {
          run: { font: { name: 'Times New Roman', eastAsia: '宋体' }, size: 24 },
          paragraph: { spacing: { line: 360 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: TWIP.pageWidth, height: TWIP.pageHeight, orientation: PageOrientation.LANDSCAPE },
          margin: {
            top: TWIP.marginTop, bottom: TWIP.marginBottom, left: TWIP.marginLeft, right: TWIP.marginRight,
            header: TWIP.header, footer: TWIP.footer, gutter: 0,
          },
        },
        grid: { linePitch: 312 },
        column: { count: 2, space: TWIP.columnGap, equalWidth: true },
      },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '2号学生食堂｜结构计算统一措施', size: 17, color: '666666', font: { name: 'Times New Roman', eastAsia: '宋体' } })] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '结构专业内部工作草案　— ', size: 16, color: '666666', font: { name: 'Times New Roman', eastAsia: '宋体' } }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '666666' }), new TextRun({ text: ' —', size: 16, color: '666666' })] })] }),
      },
      children,
    }],
  });
}

export async function downloadUnifiedMeasuresDocx(options) {
  const document = buildUnifiedMeasuresDocument(options);
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = '2号学生食堂_结构计算统一措施_A3横向双栏.docx';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
