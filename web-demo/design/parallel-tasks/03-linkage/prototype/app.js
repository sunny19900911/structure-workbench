import {
  addClause,
  clone,
  deriveDiff,
  moveClause,
  renumberClauses,
  validateClauses,
  visibleSetSnapshot,
} from './numbering.mjs';

const workflow = [
  ['载入项目条件', '读取 603 参数快照与 604 条款版本'],
  ['规则建议', '确定性规则建议保留 / 删除'],
  ['人工复核', '设计人逐条确认并填写理由'],
  ['依赖检查', '检查交叉引用与成果依赖'],
  ['重排编号', '按当前可见集连续编号'],
  ['预览 / 导出', '网页与 Word 使用同一快照'],
];

const seedClauses = renumberClauses([
  { uid: 'CL-604-001', sectionKey: '3.2', originalNo: '3.2.1', title: '设计使用年限', sourceId: 'SRC-604-001', suggestion: 'keep', decision: 'keep', reason: '' },
  { uid: 'CL-604-014', sectionKey: '3.2', originalNo: '3.2.2', title: '结构安全等级', sourceId: 'SRC-604-014', suggestion: 'delete', decision: 'keep', reason: '本项目由专项审查要求保留，并补充说明。' },
  { uid: 'CL-604-015', sectionKey: '3.2', originalNo: '3.2.3', title: '抗震设防类别', sourceId: 'SRC-604-015', suggestion: 'review', decision: 'review', reason: '' },
  { uid: 'CL-604-016', sectionKey: '3.2', originalNo: '3.2.4', title: '抗震设防烈度', sourceId: 'SRC-604-016', suggestion: 'keep', decision: 'keep', reason: '' },
  { uid: 'CL-604-017', sectionKey: '3.2', originalNo: '3.2.5', title: '场地类别', sourceId: 'SRC-604-017', suggestion: 'delete', decision: 'delete', reason: '' },
  { uid: 'CL-604-018', sectionKey: '3.2', originalNo: '3.2.6', title: '地震分组', sourceId: 'SRC-604-018', suggestion: 'keep', decision: 'keep', reason: '' },
  { uid: 'CL-604-019', sectionKey: '3.2', originalNo: '3.2.7', title: '建筑抗震防护措施', sourceId: 'SRC-604-019', suggestion: 'review', decision: 'review', reason: '' },
  { uid: 'CL-604-021', sectionKey: '3.3', originalNo: '3.3.1', title: '荷载取值基本原则', sourceId: 'SRC-604-021', suggestion: 'keep', decision: 'keep', reason: '' },
  { uid: 'CL-604-022', sectionKey: '3.3', originalNo: '3.3.2', title: '恒载取值', sourceId: 'SRC-604-022', suggestion: 'delete', decision: 'delete', reason: '' },
  { uid: 'CL-604-023', sectionKey: '3.3', originalNo: '3.3.3', title: '活载取值', sourceId: 'SRC-604-023', suggestion: 'keep', decision: 'keep', reason: '' },
  { uid: 'CL-604-024', sectionKey: '3.3', originalNo: '3.3.4', title: '风荷载取值', sourceId: 'SRC-604-024', suggestion: 'review', decision: 'review', reason: '' },
]);

const baseline = clone(seedClauses).map((item) => {
  if (item.uid === 'CL-604-014') return { ...item, decision: 'delete', reason: '' };
  if (item.uid === 'CL-604-017') return { ...item, decision: 'keep', reason: '' };
  if (item.uid === 'CL-604-022') return { ...item, decision: 'keep', reason: '' };
  return item;
});

const impacts = [
  { id: 'c1', icon: '措', name: '① 统一技术措施', count: 3, detail: '地震作用参数、抗震等级、构造措施' },
  { id: 'c2', icon: '扩', name: '② 结构扩初说明', count: 5, detail: '三、四、八、九、十章可见内容' },
  { id: 'ppt', icon: '汇', name: '② 汇报 PPT', count: 2, detail: '项目概况与结构设计要点页' },
  { id: 'c4', icon: '校', name: '④ 反校核', count: 4, detail: '模型输入差异重新计算' },
  { id: 'c7', icon: '总', name: '⑦ 施工图总说明', count: 8, detail: '604 规则需重新评估可见集' },
];

let state = {
  clauses: clone(seedClauses),
  history: [],
  future: [],
  filter: 'all',
  query: '',
  dependencyRun: false,
  numberingConfirmed: false,
  locked: false,
  activeStep: 3,
  version: 'v0.3.1',
  versions: [
    { version: 'v0.3.1', time: '2026-09-25 16:20', label: '规则建议与人工复核草案' },
    { version: 'v0.3.0', time: '2026-09-24 18:06', label: '载入 604@v1.4.0' },
  ],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const suggestionText = { keep: '保留', delete: '删除', review: '需复核' };

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  $('#toastRegion').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function savePulse() {
  $('#saveStatus').textContent = '正在保存…';
  setTimeout(() => { $('#saveStatus').textContent = '已自动保存到 603 草稿'; }, 280);
}

function commit(label, mutator) {
  if (state.locked) {
    toast('模块已锁定；请由专业负责人撤回签发后再修改。');
    return;
  }
  state.history.push({ label, clauses: clone(state.clauses) });
  state.future = [];
  mutator();
  state.clauses = renumberClauses(state.clauses);
  state.numberingConfirmed = false;
  state.dependencyRun = false;
  state.activeStep = 3;
  savePulse();
  render();
}

function validations() {
  return validateClauses(state.clauses);
}

function dependencies() {
  const issues = [];
  const clause014 = state.clauses.find((item) => item.uid === 'CL-604-014');
  const clause015 = state.clauses.find((item) => item.uid === 'CL-604-015');
  const clause024 = state.clauses.find((item) => item.uid === 'CL-604-024');
  if (clause014?.decision === 'delete') {
    issues.push({ severity: 'blocker', code: 'D-001', uid: clause014.uid, title: '删除条款仍被扩初说明引用', detail: '② 3.3.2 与 ⑦ 5.1.2 依赖“结构安全等级”。' });
  }
  if (clause015?.decision === 'review') {
    issues.push({ severity: 'blocker', code: 'D-002', uid: clause015.uid, title: '仍有未完成人工复核的条款', detail: '抗震设防类别必须由设计人明确保留或删除。' });
  }
  if (clause024?.decision === 'review') {
    issues.push({ severity: 'warning', code: 'W-001', uid: clause024.uid, title: '建议补充风荷载关联说明', detail: '参数变更会影响 ①、②、④、⑦，建议完成专项复核。' });
  }
  validations().filter((item) => item.reasonMissing).forEach((item) => {
    issues.push({ severity: 'blocker', code: 'D-003', uid: item.uid, title: '人工覆盖缺少修改理由', detail: '与确定性规则建议不一致时必须留痕。' });
  });
  return issues;
}

function renderWorkflow() {
  const issues = state.dependencyRun ? dependencies() : [];
  const hasBlocker = issues.some((item) => item.severity === 'blocker');
  $('#workflowSteps').innerHTML = workflow.map(([title, detail], index) => {
    const step = index + 1;
    const completed = step < state.activeStep && !(step === 4 && hasBlocker);
    const blocked = step === 4 && state.dependencyRun && hasBlocker;
    const cls = [step === state.activeStep ? 'active' : '', completed ? 'completed' : '', blocked ? 'blocked' : ''].filter(Boolean).join(' ');
    return `<li class="${cls}"><span class="step-no">${completed ? '✓' : step}</span><strong>${title}</strong><small>${detail}</small></li>`;
  }).join('');
}

function filteredClauses() {
  return state.clauses.filter((item) => {
    const matchesQuery = `${item.title} ${item.sourceId}`.toLowerCase().includes(state.query.toLowerCase());
    const matchesFilter = state.filter === 'all'
      || (state.filter === 'review' && item.decision === 'review')
      || (state.filter === 'deleted' && item.decision === 'delete')
      || (state.filter === 'overridden' && item.decision !== 'review' && item.decision !== item.suggestion);
    return matchesQuery && matchesFilter;
  });
}

function renderRows() {
  const invalid = new Map(validations().map((item) => [item.uid, item]));
  const rows = filteredClauses();
  $('#clauseRows').innerHTML = rows.length ? rows.map((item) => {
    const check = invalid.get(item.uid);
    const numberChanged = item.draftNo && item.originalNo && item.draftNo !== item.originalNo;
    const deleted = item.decision === 'delete';
    const override = item.decision !== 'review' && item.decision !== item.suggestion;
    return `<tr draggable="${state.filter === 'all' && !state.locked}" data-uid="${item.uid}" class="${deleted ? 'is-deleted ' : ''}${check?.reasonMissing ? 'row-error' : ''}">
      <td class="drag-cell"><button class="drag-handle" type="button" title="拖拽排序" aria-label="拖拽 ${esc(item.title)}">⠿</button></td>
      <td><span class="clause-number">${item.draftNo || '—'}</span><span class="previous-number ${numberChanged ? 'changed' : ''}">${item.originalNo ? `原 ${item.originalNo}` : '新增条款'}</span></td>
      <td><span class="clause-title">${esc(item.title)}</span><span class="source-id">${esc(item.sourceId)}</span></td>
      <td><span class="tag ${item.suggestion}">${suggestionText[item.suggestion]}</span></td>
      <td><select class="decision-select ${override ? 'override' : ''}" data-action="decision" data-uid="${item.uid}" ${state.locked ? 'disabled' : ''}>
        <option value="review" ${item.decision === 'review' ? 'selected' : ''}>需复核</option>
        <option value="keep" ${item.decision === 'keep' ? 'selected' : ''}>保留</option>
        <option value="delete" ${item.decision === 'delete' ? 'selected' : ''}>删除</option>
      </select></td>
      <td><input class="reason-input ${check?.reasonMissing ? 'invalid' : ''}" data-action="reason" data-uid="${item.uid}" value="${esc(item.reason)}" placeholder="${check?.reasonMissing ? '人工覆盖必须填写理由' : '无调整可留空'}" ${state.locked ? 'disabled' : ''}></td>
      <td><button class="row-menu" type="button" data-action="remove" data-uid="${item.uid}" title="标记删除" ${state.locked ? 'disabled' : ''}>•••</button></td>
    </tr>`;
  }).join('') : '<tr class="empty-row"><td colspan="7">没有符合当前筛选条件的条款。</td></tr>';

  const visible = state.clauses.filter((item) => item.decision !== 'delete').length;
  const deleted = state.clauses.length - visible;
  $('#tableSummary').innerHTML = `共 <strong>${state.clauses.length}</strong> 条 · 当前可见集 <strong>${visible}</strong> 条 · 拟删除 <strong>${deleted}</strong> 条`;
}

function renderImpacts() {
  $('#impactList').innerHTML = impacts.map((item) => `<article class="impact-item" data-impact="${item.id}">
    <span class="impact-icon">${item.icon}</span><div><strong>${item.name}</strong><small>预计影响 <b>${item.count}</b> 项 · ${item.detail}</small></div><button type="button" data-action="impact-detail" data-id="${item.id}">查看</button>
  </article>`).join('');
}

function renderDependencies() {
  const list = $('#dependencyList');
  if (!state.dependencyRun) {
    $('#dependencyCount').textContent = '未运行';
    list.className = 'dependency-list empty-state';
    list.textContent = '完成人工复核后运行检查，阻断项未处理前不可导出。';
    return;
  }
  const issues = dependencies();
  const blockers = issues.filter((item) => item.severity === 'blocker').length;
  $('#dependencyCount').textContent = blockers ? `${blockers} 项阻断` : issues.length ? `${issues.length} 项提示` : '检查通过';
  list.className = 'dependency-list';
  list.innerHTML = issues.length ? issues.map((item) => `<article class="dependency-item ${item.severity}"><strong>${item.code} · ${esc(item.title)}</strong><span>${esc(item.detail)}</span><button type="button" data-action="locate" data-uid="${item.uid}">${item.severity === 'blocker' ? '定位并处理' : '定位复核'}</button></article>`).join('') : '<div class="empty-state">未发现阻断项，可以确认编号并提交专业负责人复核。</div>';
}

function renderDiff() {
  const diff = deriveDiff(baseline, state.clauses);
  $('#addedCount').textContent = diff.added.length;
  $('#removedCount').textContent = diff.removed.length;
  $('#changedCount').textContent = diff.changed.length;
  const items = [
    ...diff.added.map((item) => ({ kind: '新增', item, before: '—', after: `${item.draftNo} ${item.title}` })),
    ...diff.removed.map((item) => ({ kind: '删除', item, before: `${item.originalNo || '—'} ${item.title}`, after: '已从可见集移除' })),
    ...diff.changed.map((item) => {
      const before = baseline.find((base) => base.uid === item.uid);
      return { kind: '修改', item, before: `${before?.draftNo || before?.originalNo || '—'} · ${suggestionText[before?.decision] || '—'}`, after: `${item.draftNo || '—'} · ${suggestionText[item.decision]}` };
    }),
  ];
  $('#diffList').innerHTML = items.length ? items.map(({ kind, item, before, after }) => `<article class="diff-item"><header><strong>${esc(item.title)}</strong><span class="diff-kind">${kind}</span></header><p class="diff-before">旧：${esc(before)}</p><p class="diff-after">新：${esc(after)}</p></article>`).join('') : '<div class="no-diff">当前版本与 v0.3.0 无业务差异。</div>';
}

function renderSignoff() {
  const issues = state.dependencyRun ? dependencies() : [{ severity: 'blocker' }];
  const checks = [
    ['人工复核已完成', state.clauses.every((item) => item.decision !== 'review')],
    ['修改理由完整', validations().every((item) => !item.reasonMissing)],
    ['依赖检查无阻断', state.dependencyRun && !issues.some((item) => item.severity === 'blocker')],
    ['编号已确认', state.numberingConfirmed],
    ['网页 / Word 可见集同源', true],
  ];
  $('#signoffChecklist').innerHTML = checks.map(([label, ok]) => `<div><dt>${label}</dt><dd class="${ok ? 'check-ok' : 'check-bad'}">${ok ? '通过' : '未完成'}</dd></div>`).join('');
  $('#lockState').textContent = state.locked ? '负责人已锁定' : '未锁定';
  $('#lockState').classList.toggle('locked', state.locked);
  $('#lockButton').textContent = state.locked ? '撤回签发并解锁' : '锁定并形成复核版本';
  $('#versionHistory').innerHTML = state.versions.map((item) => `<li><strong>${item.version} · ${item.label}</strong>${item.time}</li>`).join('');
  return checks.every(([, ok]) => ok);
}

function renderControls() {
  $('#undoButton').disabled = state.locked || !state.history.length;
  $('#redoButton').disabled = state.locked || !state.future.length;
  $('#versionLabel').textContent = state.version;
  const pending = state.clauses.filter((item) => item.decision === 'review').length;
  $('#pendingCount').textContent = pending;
  const blockers = state.dependencyRun ? dependencies().some((item) => item.severity === 'blocker') : true;
  $('#exportButton').disabled = !state.locked || blockers;
  document.body.classList.toggle('locked', state.locked);
}

function render() {
  renderWorkflow();
  renderRows();
  renderDependencies();
  renderDiff();
  renderSignoff();
  renderControls();
}

let confirmAction = null;
function openDialog({ title, description = '', body = '', confirmText = '确认', onConfirm = null, cancel = true }) {
  $('#dialogTitle').textContent = title;
  $('#dialogDescription').textContent = description;
  $('#dialogBody').innerHTML = body;
  $('#dialogConfirm').textContent = confirmText;
  $('#dialogCancel').hidden = !cancel;
  confirmAction = onConfirm;
  $('#appDialog').showModal();
}

function closeDialog() {
  $('#appDialog').close();
  confirmAction = null;
}

function showTab(name) {
  $$('.impact-tab').forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $$('.tab-panel').forEach((panel) => panel.classList.remove('active'));
  $(`#${name}Tab`).classList.add('active');
}

function runDependencies() {
  state.dependencyRun = true;
  state.activeStep = 4;
  showTab('impact');
  render();
  const issues = dependencies();
  toast(issues.some((item) => item.severity === 'blocker') ? '依赖检查完成：存在阻断项。' : '依赖检查通过。');
}

function bindStaticEvents() {
  $('#searchInput').addEventListener('input', (event) => { state.query = event.target.value; renderRows(); });
  $$('.filter').forEach((button) => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    $$('.filter').forEach((item) => item.classList.toggle('active', item === button));
    renderRows();
  }));
  $$('.impact-tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

  $('#undoButton').addEventListener('click', () => {
    if (!state.history.length || state.locked) return;
    const previous = state.history.pop();
    state.future.push({ label: previous.label, clauses: clone(state.clauses) });
    state.clauses = renumberClauses(previous.clauses);
    state.dependencyRun = false;
    state.numberingConfirmed = false;
    toast(`已撤销：${previous.label}`);
    render();
  });
  $('#redoButton').addEventListener('click', () => {
    if (!state.future.length || state.locked) return;
    const next = state.future.pop();
    state.history.push({ label: next.label, clauses: clone(state.clauses) });
    state.clauses = renumberClauses(next.clauses);
    toast(`已重做：${next.label}`);
    render();
  });

  $('#addClauseButton').addEventListener('click', () => openDialog({
    title: '新增项目条款',
    description: '新增内容写入 603 项目草稿，不回写 604 公共条款库。',
    body: '<label><span>条款标题</span><input id="newClauseTitle" value="设备荷载复核要求"></label><label><span>来源 source_id</span><input id="newClauseSource" value="待核实"></label>',
    confirmText: '新增并自动编号',
    onConfirm: () => {
      const title = $('#newClauseTitle').value.trim();
      if (!title) { toast('请填写条款标题。'); return false; }
      commit('新增条款', () => {
        state.clauses = addClause(state.clauses, { uid: `PRJ-${Date.now()}`, sectionKey: '3.3', title, sourceId: $('#newClauseSource').value.trim() || '待核实' });
      });
      return true;
    },
  }));

  $('#dependencyButton').addEventListener('click', runDependencies);
  $('#renumberButton').addEventListener('click', () => {
    state.clauses = renumberClauses(state.clauses);
    state.numberingConfirmed = true;
    state.activeStep = 5;
    render();
    toast('草案编号已确认；锁定前仍可撤销。');
  });

  $('#focusImpact').addEventListener('click', () => {
    showTab('impact');
    $('#impactPanel').classList.remove('flash');
    requestAnimationFrame(() => $('#impactPanel').classList.add('flash'));
    $('#impactPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#compareButton').addEventListener('click', () => { showTab('diff'); $('#impactPanel').scrollIntoView({ behavior: 'smooth' }); });
  $('#showRulesButton').addEventListener('click', () => openDialog({
    title: '连续编号规则',
    description: '算法只计算显示号，不改变 604 条款稳定主键。',
    body: '<ul><li><b>稳定身份：</b>始终用 clause_uid / source_id 追踪，不用显示编号做外键。</li><li><b>连续编号：</b>按 section_key + 当前排序，为未删除条款分配 1…N。</li><li><b>删除：</b>记录 603 决策，不从 604 删除；被删条款不占号。</li><li><b>撤销：</b>恢复完整条款顺序与决策快照后重新计算。</li><li><b>交叉引用：</b>必须指向 clause_uid，导出时才解析为最终编号。</li></ul>',
    confirmText: '知道了',
    onConfirm: () => true,
    cancel: false,
  }));

  $('#lockButton').addEventListener('click', () => {
    if (state.locked) {
      openDialog({
        title: '撤回签发并解锁',
        description: '沿用主工作台 c7 模块状态机；解锁必须形成审计记录。',
        body: '<label><span>撤回理由（必填）</span><textarea id="unlockReason" rows="4" placeholder="例如：收到建筑专业第 4 批提资，需更新荷载条款"></textarea></label>',
        confirmText: '确认撤回',
        onConfirm: () => {
          const reason = $('#unlockReason').value.trim();
          if (!reason) { toast('请填写撤回理由。'); return false; }
          state.locked = false;
          state.activeStep = 3;
          state.versions.unshift({ version: state.version, time: new Date().toLocaleString('zh-CN', { hour12: false }), label: `撤回：${reason}` });
          render();
          toast('已撤回签发，模块恢复可编辑。');
          return true;
        },
      });
      return;
    }
    state.dependencyRun = true;
    const ready = renderSignoff();
    if (!ready) {
      showTab('signoff');
      render();
      toast('尚有复核门槛未通过，不能锁定。');
      return;
    }
    openDialog({
      title: '锁定施工图总说明',
      description: '锁定粒度为⑦整张模块卡；锁定后生成 603 输出版本和同源可见集快照。',
      body: `<p>本次将固化 <b>${state.clauses.filter((item) => item.decision !== 'delete').length}</b> 条可见条款，来源 <b>604@v1.4.0</b>。网页预览与 Word 导出共同使用同一份快照。</p>`,
      confirmText: '负责人确认并锁定',
      onConfirm: () => {
        state.locked = true;
        state.activeStep = 6;
        state.version = 'v0.3.2';
        state.versions.unshift({ version: state.version, time: new Date().toLocaleString('zh-CN', { hour12: false }), label: '专业负责人锁定' });
        render();
        toast('已锁定并形成 v0.3.2 复核版本。');
        return true;
      },
    });
  });

  $('#previewButton').addEventListener('click', () => {
    const snapshot = visibleSetSnapshot(state.clauses, { generatedAt: '2026-09-25T16:30:00+08:00' });
    openDialog({ title: '网页 / Word 同源预览', description: '以下可见集快照同时供网页渲染和 Word 导出。', body: `<p>共 ${snapshot.clauses.length} 条：</p><ul>${snapshot.clauses.map((item) => `<li>${item.display_no}　${esc(item.title)}　<small>${esc(item.source_id)}</small></li>`).join('')}</ul>`, confirmText: '关闭', onConfirm: () => true, cancel: false });
  });
  $('#exportButton').addEventListener('click', () => toast('Demo 仅模拟导出；正式接入由⑦的 exportDocx() 消费同一可见集快照。'));

  $('#rollbackButton').addEventListener('click', () => openDialog({
    title: '回退到 v0.3.0',
    description: '不会覆盖历史版本；以旧快照为基线形成新的 603 草稿。',
    body: '<label><span>回退理由（必填）</span><textarea id="rollbackReason" rows="4" placeholder="说明为什么回退"></textarea></label>',
    confirmText: '回退并形成新草稿',
    onConfirm: () => {
      const reason = $('#rollbackReason').value.trim();
      if (!reason) { toast('请填写回退理由。'); return false; }
      state.clauses = renumberClauses(clone(baseline));
      state.locked = false;
      state.dependencyRun = false;
      state.numberingConfirmed = false;
      state.version = 'v0.3.2-draft';
      state.versions.unshift({ version: state.version, time: new Date().toLocaleString('zh-CN', { hour12: false }), label: `基于 v0.3.0 回退：${reason}` });
      render();
      toast('已按旧快照形成新草稿，历史版本未被覆盖。');
      return true;
    },
  }));

  $('#dialogClose').addEventListener('click', closeDialog);
  $('#dialogCancel').addEventListener('click', closeDialog);
  $('#dialogForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const shouldClose = confirmAction ? confirmAction() !== false : true;
    if (shouldClose) closeDialog();
  });
}

function bindDelegatedEvents() {
  const reasonDrafts = new Map();
  $('#clauseRows').addEventListener('focusin', (event) => {
    const { action, uid } = event.target.dataset;
    if (action === 'reason' && uid && !reasonDrafts.has(uid)) reasonDrafts.set(uid, clone(state.clauses));
  });
  $('#clauseRows').addEventListener('input', (event) => {
    const { action, uid } = event.target.dataset;
    if (action !== 'reason' || !uid || state.locked) return;
    state.clauses = state.clauses.map((item) => item.uid === uid ? { ...item, reason: event.target.value } : item);
    state.future = [];
    state.dependencyRun = false;
    state.activeStep = 3;
    event.target.classList.toggle('invalid', validations().find((item) => item.uid === uid)?.reasonMissing);
    savePulse();
    renderDependencies();
    renderSignoff();
    renderControls();
  });
  $('#clauseRows').addEventListener('change', (event) => {
    const { action, uid } = event.target.dataset;
    if (!action || !uid) return;
    if (action === 'decision') commit(`复核“${state.clauses.find((item) => item.uid === uid)?.title}”`, () => {
      state.clauses = state.clauses.map((item) => item.uid === uid ? { ...item, decision: event.target.value } : item);
    });
    if (action === 'reason') {
      const before = reasonDrafts.get(uid);
      if (before) state.history.push({ label: '更新修改理由', clauses: before });
      reasonDrafts.delete(uid);
      render();
    }
  });
  $('#clauseRows').addEventListener('click', (event) => {
    const target = event.target.closest('[data-action="remove"]');
    if (!target) return;
    const item = state.clauses.find((row) => row.uid === target.dataset.uid);
    openDialog({ title: '标记为删除', description: '只写入 603 项目级决定，不删除 604 公共条款。', body: `<p>确认把“${esc(item.title)}”标记为删除？删除后同章节编号将立即连续重排。</p>`, confirmText: '标记删除', onConfirm: () => { commit(`删除“${item.title}”`, () => { state.clauses = state.clauses.map((row) => row.uid === item.uid ? { ...row, decision: 'delete' } : row); }); return true; } });
  });

  let dragUid = null;
  $('#clauseRows').addEventListener('dragstart', (event) => {
    const row = event.target.closest('tr[data-uid]');
    if (!row || state.filter !== 'all' || state.locked) { event.preventDefault(); return; }
    dragUid = row.dataset.uid;
    row.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
  });
  $('#clauseRows').addEventListener('dragover', (event) => {
    const row = event.target.closest('tr[data-uid]');
    if (!row || !dragUid) return;
    event.preventDefault();
    $$('#clauseRows tr').forEach((item) => item.classList.remove('drag-over'));
    row.classList.add('drag-over');
  });
  $('#clauseRows').addEventListener('drop', (event) => {
    const row = event.target.closest('tr[data-uid]');
    if (!row || !dragUid) return;
    event.preventDefault();
    const targetUid = row.dataset.uid;
    commit('拖拽调整条款顺序', () => { state.clauses = moveClause(state.clauses, dragUid, targetUid); });
    dragUid = null;
  });
  $('#clauseRows').addEventListener('dragend', () => {
    dragUid = null;
    $$('#clauseRows tr').forEach((item) => item.classList.remove('dragging', 'drag-over'));
  });

  $('#impactPanel').addEventListener('click', (event) => {
    const impact = event.target.closest('[data-action="impact-detail"]');
    if (impact) {
      const item = impacts.find((row) => row.id === impact.dataset.id);
      openDialog({ title: `${item.name} · 影响明细`, description: '影响提示来自参数—章节引用矩阵；系统不会静默改值。', body: `<p>${esc(item.detail)}</p><ul><li>参数：intensity（7 度 → 8 度）</li><li>来源：603 项目参数版本 P-2026-0925-03</li><li>动作：标记需复核；由对应模块负责人确认后更新</li></ul>`, confirmText: '关闭', onConfirm: () => true, cancel: false });
    }
    const locate = event.target.closest('[data-action="locate"]');
    if (locate) {
      state.filter = 'all';
      $$('.filter').forEach((item) => item.classList.toggle('active', item.dataset.filter === 'all'));
      renderRows();
      const row = $(`#clauseRows tr[data-uid="${locate.dataset.uid}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row?.animate([{ background: '#fff1d5' }, { background: 'transparent' }], { duration: 1200 });
    }
  });
}

renderImpacts();
bindStaticEvents();
bindDelegatedEvents();
render();
