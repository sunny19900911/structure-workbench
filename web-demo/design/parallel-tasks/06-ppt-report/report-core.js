// Shared by the editor and regression tests. Model output is never treated as markup.
export function validateRewrite(content, original) {
  let result;
  try { result = JSON.parse(String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('DeepSeek 返回格式不正确，请重试'); }
  if (!Array.isArray(result.blocks) || result.blocks.length !== original.length) throw new Error('改写内容不完整');
  const seen = new Set();
  const blocks = original.map((before) => {
    const after = result.blocks.find((block) => block?.id === before.id);
    if (!after || seen.has(after.id) || typeof after.text !== 'string' || !after.text.trim() || after.text.length > 180) throw new Error('改写段落无效或超过180字，请精简后重试');
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
  return [...new Set([...root.querySelectorAll('[data-param]')].map((node) => node.dataset.param))].map((key) => ({
    key, value: params[key] ?? null, source_id: `workbuddy:unified-measures:${key}`, statement_type: '原文事实（当前工作台记录，未经审签）',
  }));
}
