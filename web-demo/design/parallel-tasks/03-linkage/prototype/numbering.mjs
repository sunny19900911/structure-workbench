export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function renumberClauses(clauses) {
  const counters = new Map();
  return clauses.map((clause) => {
    if (clause.decision === 'delete') {
      return { ...clause, draftNo: null };
    }
    const sectionKey = clause.sectionKey || '1';
    const next = (counters.get(sectionKey) || 0) + 1;
    counters.set(sectionKey, next);
    return { ...clause, draftNo: `${sectionKey}.${next}` };
  });
}

export function moveClause(clauses, sourceUid, targetUid) {
  const next = clone(clauses);
  const from = next.findIndex((item) => item.uid === sourceUid);
  const to = next.findIndex((item) => item.uid === targetUid);
  if (from < 0 || to < 0 || from === to) return renumberClauses(next);
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return renumberClauses(next);
}

export function addClause(clauses, clause, afterUid = null) {
  const next = clone(clauses);
  const candidate = {
    uid: clause.uid,
    sectionKey: clause.sectionKey || '3.2',
    originalNo: null,
    title: clause.title || '未命名条款',
    sourceId: clause.sourceId || '待核实',
    suggestion: clause.suggestion || 'review',
    decision: clause.decision || 'review',
    reason: clause.reason || '',
    created: true,
  };
  const target = afterUid ? next.findIndex((item) => item.uid === afterUid) : -1;
  next.splice(target >= 0 ? target + 1 : next.length, 0, candidate);
  return renumberClauses(next);
}

export function validateClauses(clauses) {
  return clauses.map((clause) => {
    const isOverride = clause.decision !== 'review' && clause.decision !== clause.suggestion;
    const reasonMissing = isOverride && !String(clause.reason || '').trim();
    return { uid: clause.uid, isOverride, reasonMissing };
  });
}

export function deriveDiff(baseline, current) {
  const baseById = new Map(baseline.map((item) => [item.uid, item]));
  const currentById = new Map(current.map((item) => [item.uid, item]));
  const added = current.filter((item) => !baseById.has(item.uid));
  const removed = baseline.filter((item) => !currentById.has(item.uid) || currentById.get(item.uid).decision === 'delete');
  const changed = current.filter((item) => {
    const before = baseById.get(item.uid);
    if (!before || item.decision === 'delete') return false;
    return before.title !== item.title || before.decision !== item.decision || before.reason !== item.reason || before.draftNo !== item.draftNo;
  });
  return { added, removed, changed };
}

export function visibleSetSnapshot(clauses, meta = {}) {
  const visible = renumberClauses(clauses)
    .filter((item) => item.decision !== 'delete')
    .map((item, index) => ({
      uid: item.uid,
      display_no: item.draftNo,
      order_index: index,
      title: item.title,
      source_id: item.sourceId,
      decision: item.decision,
      decision_reason: item.reason || '',
    }));
  return {
    project_id: meta.projectId || 'PROJECT-DEMO',
    module_id: meta.moduleId || 'c7',
    stage: meta.stage || '施工图',
    source_604_version: meta.source604Version || '604@v1.4.0',
    rule_version: meta.ruleVersion || 'Rule-2026.09.01',
    generated_at: meta.generatedAt || new Date().toISOString(),
    visible_clause_ids: visible.map((item) => item.uid),
    clauses: visible,
  };
}
