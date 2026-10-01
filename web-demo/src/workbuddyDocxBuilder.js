import {
  AlignmentType,
  BorderStyle,
  Document,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

export const MENGBO_PAGE = Object.freeze({
  width: 16838,
  height: 23811,
  marginTop: 1800,
  marginBottom: 1800,
  marginLeft: 1440,
  marginRight: 1440,
  header: 851,
  footer: 992,
  columnGap: 425,
  columnWidth: 10200,
  gridLinePitch: 312,
});

const FONT = { name: 'Times New Roman', eastAsia: '宋体' };
const CELL_FONT_SIZE = 18;
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const TABLE_BORDERS = {
  top: TABLE_BORDER,
  bottom: TABLE_BORDER,
  left: TABLE_BORDER,
  right: TABLE_BORDER,
  insideHorizontal: TABLE_BORDER,
  insideVertical: TABLE_BORDER,
};

function cleanText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function classifyHeading(element) {
  if (/^H[1-6]$/.test(element.tagName)) {
    const n = Number(element.tagName.slice(1));
    return Math.min(n, 3);
  }
  return null;
}

function tableSnapshot(table) {
  const visibleRows = [...table.rows].filter(isVisible);
  if (!visibleRows.length) return null;

  const rawWidths = [...table.querySelectorAll(':scope > colgroup > col')]
    .filter((col) => !col.classList.contains('op'))
    .map((col) => Number.parseFloat(col.style.width || col.getAttribute('width') || '0'));

  const rows = visibleRows.map((row, rowIndex) => {
    const cells = [...row.cells]
      .filter((cell) => !cell.classList.contains('op'))
      .map((cell) => cleanText(cell.innerText || cell.textContent));
    return {
      header: rowIndex === 0 && [...row.cells].some((cell) => cell.tagName === 'TH'),
      cells,
    };
  }).filter((row) => row.cells.length);

  const columnCount = Math.max(...rows.map((row) => row.cells.length));
  if (!columnCount) return null;
  const usableWidths = rawWidths.slice(0, columnCount);
  const widths = usableWidths.length === columnCount && usableWidths.reduce((a, b) => a + b, 0) > 0
    ? usableWidths
    : Array(columnCount).fill(100 / columnCount);

  return { type: 'table', widths, rows };
}

function appendElement(nodes, element) {
  if (!(element instanceof HTMLElement) || !isVisible(element)) return;
  if (element.matches('.atools, button, script, style, .op, .toolbar')) return;

  if (element.tagName === 'TABLE') {
    const snapshot = tableSnapshot(element);
    if (snapshot) nodes.push(snapshot);
    return;
  }

  if (element.classList.contains('itbl')) {
    [...element.children].forEach((child) => appendElement(nodes, child));
    return;
  }

  if (element.classList.contains('imgph')) {
    const text = cleanText(element.querySelector('.imgtxt')?.textContent || element.textContent);
    if (text) nodes.push({ type: 'figure', text });
    return;
  }

  const headingLevel = classifyHeading(element);
  if (headingLevel) {
    const text = cleanText(element.textContent);
    if (text) nodes.push({ type: 'heading', level: headingLevel, text });
    return;
  }

  if (element.matches('p, li, .ph, .tcap, .note')) {
    const text = cleanText(element.innerText || element.textContent);
    if (!text) return;
    nodes.push({
      type: element.classList.contains('tcap') ? 'caption' : 'paragraph',
      text,
      variant: element.classList.contains('ph') ? 'important' : element.classList.contains('note') ? 'note' : 'body',
    });
    return;
  }

  [...element.children].forEach((child) => appendElement(nodes, child));
}

export function serializeWorkBuddyDocument(root = window.document.querySelector('#doc')) {
  if (!root) throw new Error('未找到统一措施正文区域 #doc。');
  const nodes = [];
  [...root.children].forEach((child) => appendElement(nodes, child));
  return {
    projectName: cleanText(window.document.querySelector('[data-k="project_name"]')?.value || '结构计算统一措施'),
    title: '结构计算统一措施',
    nodes,
  };
}

function textRun(text, options = {}) {
  return new TextRun({ text, font: FONT, size: 24, ...options });
}

function headingParagraph(node) {
  const topLevel = node.level === 1;
  return new Paragraph({
    keepNext: true,
    keepLines: true,
    spacing: { line: 360, before: topLevel ? 120 : 0, after: 0 },
    children: [textRun(node.text, { size: topLevel || node.level === 2 ? 28 : 24, bold: node.level <= 2 })],
  });
}

function bodyParagraph(node) {
  const important = node.variant === 'important';
  const note = node.variant === 'note';
  const noIndent = note || /^(注|说明|备注|\[待补图\]|图\s*\d)/.test(node.text);
  return new Paragraph({
    spacing: { line: 360, before: 0, after: 0 },
    indent: noIndent ? undefined : { firstLine: 480 },
    children: [textRun(node.text, {
      bold: important,
      color: important ? 'FF0000' : note ? '666666' : '000000',
    })],
  });
}

function captionParagraph(node) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { line: 360, before: 0, after: 0 },
    children: [textRun(node.text, { bold: true })],
  });
}

function figureParagraph(node) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepLines: true,
    spacing: { line: 360, before: 60, after: 60 },
    children: [textRun(`[待补图] ${node.text}`, { bold: true, color: 'FF0000' })],
  });
}

function normalizeWidths(widths, count) {
  const values = widths.slice(0, count).map((value) => Number(value) || 0);
  while (values.length < count) values.push(1);
  const total = values.reduce((sum, value) => sum + value, 0) || count;
  const result = values.map((value) => Math.max(400, Math.round(MENGBO_PAGE.columnWidth * value / total)));
  const delta = MENGBO_PAGE.columnWidth - result.reduce((sum, value) => sum + value, 0);
  result[result.length - 1] += delta;
  return result;
}

function cellParagraph(text, isHeader) {
  return new Paragraph({
    alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { line: 240, before: 0, after: 0 },
    children: [new TextRun({
      text: text || '—',
      font: FONT,
      size: CELL_FONT_SIZE,
      bold: isHeader,
    })],
  });
}

function tableBlock(node) {
  const count = Math.max(...node.rows.map((row) => row.cells.length));
  const widths = normalizeWidths(node.widths || [], count);
  return new Table({
    width: { size: MENGBO_PAGE.columnWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: node.rows.map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0 && row.header,
      cantSplit: true,
      children: Array.from({ length: count }, (_, index) => new TableCell({
        width: { size: widths[index], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: row.header ? { type: ShadingType.CLEAR, fill: 'E7E6E6', color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 70, right: 70 },
        children: [cellParagraph(row.cells[index] || '', row.header)],
      })),
    })),
  });
}

export function buildWorkBuddyDocument(snapshot) {
  const children = [];
  for (const node of snapshot.nodes || []) {
    if (node.type === 'heading') children.push(headingParagraph(node));
    else if (node.type === 'paragraph') children.push(bodyParagraph(node));
    else if (node.type === 'caption') children.push(captionParagraph(node));
    else if (node.type === 'figure') children.push(figureParagraph(node));
    else if (node.type === 'table') {
      children.push(tableBlock(node));
      children.push(new Paragraph({ spacing: { line: 120, before: 0, after: 0 }, children: [] }));
    }
  }

  return new Document({
    creator: '结构设计 AI 工作台',
    title: `${snapshot.projectName || ''} 结构计算统一措施`.trim(),
    description: '按孟博版式生成：A3 横向、两栏。',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 24, color: '000000' },
          paragraph: { spacing: { line: 360, before: 0, after: 0 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: MENGBO_PAGE.width,
            height: MENGBO_PAGE.height,
            orientation: PageOrientation.LANDSCAPE,
            code: 8,
          },
          margin: {
            top: MENGBO_PAGE.marginTop,
            bottom: MENGBO_PAGE.marginBottom,
            left: MENGBO_PAGE.marginLeft,
            right: MENGBO_PAGE.marginRight,
            header: MENGBO_PAGE.header,
            footer: MENGBO_PAGE.footer,
            gutter: 0,
          },
        },
        grid: { linePitch: MENGBO_PAGE.gridLinePitch },
        column: { count: 2, space: MENGBO_PAGE.columnGap, equalWidth: true },
      },
      children,
    }],
  });
}
