import { useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, Database, Download,
  FileSearch, Filter, RotateCcw, Save, Search, ShieldCheck,
} from 'lucide-react';
import bundle from './data/task2/task2_bundle.json';
import './confirmation.css';


const STORAGE_KEY = 'task2-parameter-confirmations-v1';
const statuses = ['全部', '需要人工确认', '冲突未解决', '资料缺失', '自动确认候选', '已人工确认'];

const statusLabels = {
  '自动确认候选': '自动确认候选',
  '需要人工确认': '需要人工确认',
  '已人工确认': '已人工确认',
  '资料缺失': '资料缺失',
  '冲突未解决': '冲突未解决',
};

function loadLocalConfirmations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function mergeCandidates() {
  const byParameter = new Map();
  bundle.candidates.forEach((candidate) => {
    const key = `${candidate.field_id}::${candidate.scope}`;
    if (!byParameter.has(key)) {
      byParameter.set(key, {
        key,
        field_id: candidate.field_id,
        field_name: candidate.field_name,
        scope: candidate.scope,
        domain: candidate.domain,
        status: candidate.status,
        candidates: [],
      });
    }
    const group = byParameter.get(key);
    group.candidates.push(candidate);
    if (candidate.status === '冲突未解决') group.status = '冲突未解决';
    else if (candidate.status === '资料缺失' && group.status !== '冲突未解决') group.status = '资料缺失';
    else if (candidate.status === '需要人工确认' && !['冲突未解决', '资料缺失'].includes(group.status)) group.status = '需要人工确认';
  });
  return [...byParameter.values()];
}

const sourceMap = Object.fromEntries(bundle.sources.map((source) => [source.source_id, source]));
const baseGroups = mergeCandidates();

function StatusTag({ status }) {
  return <span className={`confirm-status confirm-${status}`}>{statusLabels[status] || status}</span>;
}

function EvidenceCard({ candidate }) {
  const source = sourceMap[candidate.source_id] || {};
  return (
    <article className="evidence-card">
      <header>
        <span>{candidate.source_id}</span>
        <em>{candidate.claim_type}</em>
      </header>
      <strong>{source.file_name || candidate.source_id}</strong>
      <p>{candidate.evidence}</p>
      <footer>
        <span>{candidate.locator}</span>
        <span>置信度 {Math.round(candidate.confidence * 100)}%</span>
      </footer>
      {candidate.note && <small>{candidate.note}</small>}
    </article>
  );
}

function ConfirmationForm({ group, existing, onSave }) {
  const firstCandidate = group.candidates[0];
  const [value, setValue] = useState(existing?.confirmed_value ?? displayValue(firstCandidate?.normalized_value));
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [reviewer, setReviewer] = useState(existing?.confirmed_by ?? '');
  const [status, setStatus] = useState(existing?.status ?? '已人工确认');
  const [message, setMessage] = useState('');

  const save = (event) => {
    event.preventDefault();
    if (status === '已人工确认' && (!value.trim() || !reason.trim())) {
      setMessage('标记“已人工确认”时，确认值和修改理由均为必填。');
      return;
    }
    onSave({
      confirmation_id: existing?.confirmation_id || `CONF-LOCAL-${Date.now()}`,
      field_id: group.field_id,
      field_name: group.field_name,
      scope: group.scope,
      original_values: group.candidates.map((candidate) => candidate.raw_value),
      confirmed_value: value,
      unit: firstCandidate?.unit || '—',
      reason,
      status,
      confirmed_by: reviewer || '未填写',
      confirmed_at: new Date().toISOString(),
      source_id: 'SRC-LOCAL-CONFIRMATION',
      applicable_scope: ['统一技术措施', '结构初步设计说明', 'PPT', '领导抽查卡'],
    });
    setMessage('已保存到本机浏览器，可导出JSON归档。');
  };

  return (
    <form className="confirmation-form" onSubmit={save}>
      <div className="form-heading">
        <div><ShieldCheck size={19} /><span>人为确定</span></div>
        <small>不回写原始资料</small>
      </div>
      <label>
        <span>确认状态</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {statuses.slice(1).map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        <span>确认值</span>
        <textarea rows="3" value={value} onChange={(event) => setValue(event.target.value)} placeholder="填写最终采用值" />
      </label>
      <label>
        <span>修改理由 / 确认依据</span>
        <textarea rows="4" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明为何选用该值，或为何暂不确认" />
      </label>
      <label>
        <span>确认人</span>
        <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="姓名或角色" />
      </label>
      {message && <p className={message.startsWith('已保存') ? 'save-success' : 'save-warning'}>{message}</p>}
      <button className="save-confirmation" type="submit"><Save size={17} />保存确认记录</button>
    </form>
  );
}

export default function ConfirmationWorkspace() {
  const [filter, setFilter] = useState('需要人工确认');
  const [domain, setDomain] = useState('全部专业');
  const [query, setQuery] = useState('');
  const [localConfirmations, setLocalConfirmations] = useState(loadLocalConfirmations);
  const [selectedKey, setSelectedKey] = useState(() => baseGroups.find((group) => group.status === '需要人工确认')?.key || baseGroups[0]?.key);

  const confirmationMap = useMemo(() => {
    const merged = [...bundle.confirmations, ...localConfirmations];
    return Object.fromEntries(merged.map((item) => [`${item.field_id}::${item.scope}`, item]));
  }, [localConfirmations]);

  const groups = useMemo(() => baseGroups.map((group) => {
    const confirmation = confirmationMap[group.key];
    return confirmation ? { ...group, status: confirmation.status } : group;
  }), [confirmationMap]);

  const filtered = useMemo(() => groups.filter((group) => {
    const matchesStatus = filter === '全部' || group.status === filter;
    const matchesDomain = domain === '全部专业' || group.domain === domain;
    const haystack = `${group.field_name} ${group.field_id} ${group.scope} ${group.candidates.map((item) => `${item.raw_value} ${item.evidence}`).join(' ')}`.toLowerCase();
    return matchesStatus && matchesDomain && haystack.includes(query.toLowerCase());
  }), [groups, filter, domain, query]);

  const selected = groups.find((group) => group.key === selectedKey) || filtered[0] || groups[0];
  const existing = selected ? confirmationMap[selected.key] : null;
  const counts = Object.fromEntries(statuses.slice(1).map((status) => [status, groups.filter((group) => group.status === status).length]));

  const saveConfirmation = (record) => {
    const next = localConfirmations.filter((item) => !(item.field_id === record.field_id && item.scope === record.scope));
    next.push(record);
    setLocalConfirmations(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const exportConfirmations = () => {
    const payload = {
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      note: '本文件为人工确认覆盖层；导入数据流水线前需纳入版本控制并由负责人复核。',
      confirmations: [...bundle.confirmations, ...localConfirmations],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'task2_confirmation_overrides.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetLocal = () => {
    localStorage.removeItem(STORAGE_KEY);
    setLocalConfirmations([]);
  };

  return (
    <div className="confirmation-page">
      <header className="confirmation-hero">
        <div>
          <h1>项目参数人为确认</h1>
          <p>候选值、来源证据和人工覆盖记录严格分层。只有“已人工确认”才可作为正式参数。</p>
        </div>
        <div className="confirmation-actions">
          <button onClick={exportConfirmations}><Download size={16} />导出确认记录</button>
          <button className="ghost-action" onClick={resetLocal}><RotateCcw size={15} />清除本地新增</button>
        </div>
      </header>

      <section className="confirmation-metrics">
        <div><strong>{bundle.candidates.length}</strong><span>可追溯候选</span></div>
        <div><strong>{counts['需要人工确认']}</strong><span>需要人工确认</span></div>
        <div><strong>{counts['冲突未解决']}</strong><span>冲突未解决</span></div>
        <div><strong>{counts['已人工确认']}</strong><span>已人工确认</span></div>
      </section>

      <section className="confirmation-toolbar">
        <label className="confirmation-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索字段、范围或证据" /></label>
        <label><Filter size={15} /><select value={domain} onChange={(event) => setDomain(event.target.value)}><option>全部专业</option><option>建筑</option><option>地勘</option></select></label>
        <div className="status-filters">
          {statuses.map((status) => <button key={status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)}>{status}{status !== '全部' && <b>{counts[status] || 0}</b>}</button>)}
        </div>
      </section>

      <div className="confirmation-workspace">
        <section className="candidate-column">
          <header><div><Database size={18} /><strong>候选字段</strong></div><span>{filtered.length} 项</span></header>
          <div className="candidate-list">
            {filtered.map((group) => {
              const candidate = group.candidates[0];
              return (
                <button key={group.key} className={selected?.key === group.key ? 'selected' : ''} onClick={() => setSelectedKey(group.key)}>
                  <div className="candidate-title"><span>{group.domain}</span><strong>{group.field_name}</strong><ChevronRight size={16} /></div>
                  <p>{displayValue(candidate.raw_value)} {candidate.unit !== '—' ? candidate.unit : ''}</p>
                  <footer><small>{group.scope}</small><StatusTag status={group.status} /></footer>
                </button>
              );
            })}
            {!filtered.length && <div className="empty-candidates"><CheckCircle2 size={30} /><strong>当前筛选无字段</strong><span>切换状态或清除搜索条件。</span></div>}
          </div>
        </section>

        {selected && <section className="review-column">
          <header className="review-heading">
            <div><span>{selected.field_id}</span><h2>{selected.field_name}</h2><p>{selected.scope}</p></div>
            <StatusTag status={selected.status} />
          </header>
          <div className="review-body">
            <section className="evidence-section">
              <div className="section-title"><div><FileSearch size={18} /><strong>来源证据</strong></div><span>{selected.candidates.length} 条</span></div>
              {selected.candidates.map((candidate) => <EvidenceCard key={candidate.candidate_id} candidate={candidate} />)}
              {selected.candidates.some((candidate) => candidate.status === '冲突未解决') && <div className="conflict-callout"><AlertTriangle size={18} /><p><strong>冲突不会自动合并</strong><span>请逐条核对来源，在右侧记录确认值和理由。</span></p></div>}
            </section>
            <ConfirmationForm key={selected.key} group={selected} existing={existing} onSave={saveConfirmation} />
          </div>
        </section>}
      </div>
    </div>
  );
}
