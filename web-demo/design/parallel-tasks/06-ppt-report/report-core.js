// Shared by the editor and regression tests. Model output is never treated as markup.
export function rewriteGuidance(mode) {
  return mode==='expand'
    ? '扩展为详实的工程汇报内容，围绕已有事实补充背景、设计思路和信息之间的联系，用完整段落说明；不堆砌待办事项，不增加未经提供的工程事实、数字、规范条文或验算结论。每块不超过600字，保留原有数字及其出现次数、单位和未确认状态。'
    : '使用简洁的工程汇报语言，每块不超过180字，保留原有数字、单位和未确认状态。';
}
export function validateRewrite(content, original, mode='concise') {
  let result;
  try { result = JSON.parse(String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('DeepSeek 返回格式不正确，请重试'); }
  if (!Array.isArray(result.blocks) || result.blocks.length !== original.length) throw new Error('改写内容不完整');
  const seen = new Set();
  const blocks = original.map((before) => {
    const after = result.blocks.find((block) => block?.id === before.id);
    const limit=mode==='expand'?600:180;
    if (!after || seen.has(after.id) || typeof after.text !== 'string' || !after.text.trim() || after.text.length > limit) throw new Error(`改写段落无效或超过${limit}字，请调整后重试`);
    seen.add(after.id);
    const numbers = (text) => (text.match(/\d+(?:\.\d+)?(?:\s*[%度]|\s*[a-zA-Z]+)?/g) || []).sort().join('|');
    if (numbers(before.text) !== numbers(after.text)) throw new Error('改写改变了数字或单位，请保留原文并重试');
    if (/(待|尚未|未确认)/.test(before.text) && !/(待|尚未|未确认)/.test(after.text)) throw new Error('改写遗漏待确认状态，请重试');
    return { id: after.id, text: after.text.trim() };
  });
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter((item) => typeof item === 'string').slice(0, 12).map((item) => item.slice(0, 500)) : [];
  return { blocks, warnings };
}

export function parameterEvidence(root, params) {
  const keys=[...new Set([...root.querySelectorAll('[data-param]')].map((node) => node.dataset.param))];
  return (keys.length?keys:Object.keys(params||{}).filter(k=>params[k]!==''&&params[k]!=null)).map((key) => ({
    key, value: params[key] ?? null, source_id: `workbuddy:unified-measures:${key}`, statement_type: '原文事实（当前工作台记录，未经审签）',
  }));
}
