import pptxgen from 'pptxgenjs';

const color = (value, fallback = '111111') => {
  const rgb = value.match(/\d+/g);
  return rgb?.length >= 3 ? rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : fallback;
};

async function capture(root, title) {
  const outer = root.getBoundingClientRect();
  const narrative = root.querySelector('.report-narrative');
  if (narrative && narrative.scrollHeight > narrative.clientHeight + 2) throw new Error(`“${title}”说明文字超出页面，请精简后导出`);
  const decisions=root.querySelector('.linked-decisions');
  if(decisions&&decisions.scrollHeight>decisions.clientHeight+2)throw new Error('重难点结论超出本页，请精简⑩中的汇报结论或分单体输出');
  const scale = 13.333333 / outer.width;
  const box = (node) => {
    const r = node.getBoundingClientRect();
    return { x: (r.x - outer.x) * scale, y: (r.y - outer.y) * scale, w: r.width * scale, h: r.height * scale };
  };
  const textOptions = (node) => {
    const style = getComputedStyle(node);
    return { ...box(node), fontSize: parseFloat(style.fontSize) * scale * 72, bold: Number(style.fontWeight) >= 600,
      color: color(style.color), align: ['center', 'right'].includes(style.textAlign) ? style.textAlign : 'left',
      margin: 0, breakLine: false, valign: 'mid', fit: 'shrink', fontFace: 'Microsoft YaHei' };
  };
  const candidates = [...root.querySelectorAll('[data-edit-id],.editable-copy,.model-copy,.conclusion-copy,.linked-decisions,.ppt-cover h1,.ppt-section h2,.ppt-header b,.ppt-page-number')];
  const texts = candidates.filter((node) => !node.closest('table') && !candidates.some((parent) => parent !== node && parent.contains(node)))
    .map((node) => ({ id: node.dataset.editId, text: node.innerText, options: textOptions(node) }));
  const tables = [...root.querySelectorAll('table')].map((table) => {
    const rows = [...table.rows].map((row) => [...row.cells].map((cell) => ({ text: cell.innerText, options: {
      bold: cell.tagName === 'TH', fill: cell.tagName === 'TH' ? 'FFFFCC' : 'FFFFFF', color: cell.querySelector('[data-param]') ? '315E84' : '111111',
    } })));
    return { rows, options: { ...box(table), rowH: [...table.rows].map((row) => box(row).h),
      colW: [...table.rows[0].cells].map((cell) => box(cell).w),
      fontSize: parseFloat(getComputedStyle(table).fontSize) * scale * 72,
      fontFace: 'Microsoft YaHei', border: { pt: 0.6, color: '1F2933' }, margin: 0.04, align: 'center', valign: 'mid', autoPage: false } };
  });
  const pictures = [];
  const placeholders = [];
  for (const slot of root.querySelectorAll('.image-slot')) {
    const img = slot.querySelector('img');
    if (!img) { placeholders.push({ text: `[待上传：${slot.dataset.slot}]`, options: { ...box(slot), fontSize: 15, align: 'center', valign: 'mid', color: '6D7D8E', fill: { color: 'F2F2F2' } } }); continue; }
    const blob = await (await fetch(img.src)).blob();
    let data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    if (blob.type === 'image/webp') {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      data = canvas.toDataURL('image/png');
    }
    const rect = box(slot);
    const ratio = Math.min(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
    const w = img.naturalWidth * ratio; const h = img.naturalHeight * ratio;
    pictures.push({ data, x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h });
  }
  const bands = [...root.querySelectorAll('.cover-band,.section-band')].map((node) => box(node));
  const header = root.querySelector('.ppt-header');
  const sources = [...new Set([...root.querySelectorAll('[data-param]')].map((node) => node.dataset.param))];
  return { title, texts, tables, pictures, placeholders, bands, header: header ? box(header) : null, sources };
}

async function download(slides, meta) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = '结构与技术措施一体化工作台';
  pptx.subject = '扩初设计汇报 · 工作草案';
  pptx.title = `${meta.project}扩初设计汇报`;
  pptx.lang = 'zh-CN';
  for (const item of slides) {
    const slide = pptx.addSlide();
    for (const band of item.bands) slide.addShape(pptx.ShapeType.rect, { ...band, fill: { color: 'D9D9D9' }, line: { transparency: 100 } });
    if (item.header) slide.addShape(pptx.ShapeType.line, { x: 0, y: item.header.h, w: 13.333333, h: 0, line: { color: 'C00000', width: 2 } });
    for (const text of [...item.texts, ...item.placeholders]) slide.addText(text.text, text.options);
    for (const table of item.tables) slide.addTable(table.rows, table.options);
    for (const picture of item.pictures) slide.addImage(picture);
    slide.addText('工作草案 · 待负责人审签', { x: 9.5, y: 7.27, w: 3.4, h: 0.17, fontSize: 8, color: '777777', align: 'right', margin: 0 });
    slide.addNotes([
      `页名：${item.title}。${meta.confirmed ? '编制人已人工确认；尚未负责人审签。' : '尚未人工确认。'}`,
      `参数快照：${meta.snapshot.updated_at}；项目：${meta.project}`,
      ...item.sources.map((key) => `原文事实（工作台记录）：${key}=${meta.snapshot.params[key] ?? '待确认'}；source_id: workbuddy:unified-measures:${key}`),
      ...item.texts.filter((text) => meta.provenance?.[text.id]).map((text) => `${text.text}\n来源记录：${JSON.stringify(meta.provenance[text.id])}`),
      '其他文字：人工输入或经采纳的AI推断，仍须复核。计算结果及图片不随参数重算。缺失内容保留待确认。',
    ].join('\n'));
  }
  await pptx.writeFile({ fileName: `${meta.project.replace(/[\\/:*?"<>|]/g, '_')}_扩初汇报_工作草稿.pptx`, compression: true });
}

export const exportReport = { capture, download };
