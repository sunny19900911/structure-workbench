import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookMarked, BookOpen, Check,
  ChevronRight, CircleHelp, Copy, Database, Download, FileText, Gauge, Image, Layers3,
  LibraryBig, Menu, MonitorPlay, PanelRightClose, Printer, Search,
  ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react';
import {
  aiUnifiedParameterTable, humanMeasureGroups, issues, measureGroups, overrides, projectBaseline, projectResolutions,
  referenceDocuments, referenceList, slideOutputs, stats, wordOutputs,
} from './data/projectData.js';
import {
  floorLiveLoadRecords, regulationDatasetMeta, seismicRecords, windSnowRecords,
} from './data/regulationData.js';
import ConfirmationWorkspace from './ConfirmationWorkspace.jsx';

const nav = [
  { id: 'overview', label: '项目总览', icon: Gauge },
  { id: 'parameters', label: '关键参数', icon: SlidersHorizontal },
  { id: 'confirmation', label: '人为确认', icon: ShieldCheck },
  { id: 'measures', label: '统一技术措施', icon: LibraryBig, href: './workbuddy-unified-measures.html' },
  { id: 'documents', label: 'Word 网页版', icon: FileText },
  { id: 'slides', label: 'PPT 网页版', icon: MonitorPlay },
  { id: 'issues', label: '问题清单', icon: CircleHelp },
  { id: 'references', label: '参考资料', icon: BookMarked },
];

const statusMeta = {
  confirmed: { label: '已确认', className: 'confirmed', icon: Check },
  review: { label: '待复核', className: 'review', icon: AlertTriangle },
  history: { label: '历史记录', className: 'history', icon: BookOpen },
};

const allPageIds = new Set(nav.map((item) => item.id));

function getReferences(ids = []) {
  return [...new Set(ids)].map((id) => ({ id, ...referenceDocuments[id] })).filter((item) => item.refNo);
}

function Citations({ ids = [], foot = false }) {
  const refs = getReferences(ids);
  if (!refs.length) return null;
  return (
    <span className={foot ? 'citation-foot' : 'citations'} aria-label="资料引用">
      {refs.map((ref) => <sup key={ref.id} title={`${ref.title}${ref.locator ? `，${ref.locator}` : ''}`}>[{ref.refNo}]</sup>)}
    </span>
  );
}

function ClaimType({ children }) {
  return children ? <span className={`claim-type claim-${children}`}>{children}</span> : null;
}

function Status({ value }) {
  const meta = statusMeta[value] || statusMeta.review;
  const Icon = meta.icon;
  return <span className={`status ${meta.className}`}><Icon size={14} />{meta.label}</span>;
}

function runPrint(mode) {
  document.documentElement.dataset.printMode = mode;
  const clean = () => { delete document.documentElement.dataset.printMode; window.removeEventListener('afterprint', clean); };
  window.addEventListener('afterprint', clean);
  window.print();
}

function Sidebar({ page, setPage, open, close }) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark"><Layers3 size={23} /></div>
        <div><strong>结构设计 AI</strong><span>项目资料工作台</span></div>
      </div>
      <button className="mobile-close" onClick={close} aria-label="关闭菜单"><X /></button>
      <nav aria-label="主导航">
        {nav.map(({ id, label, icon: Icon, href }) => href ? (
          <a key={id} href={href} onClick={close}>
            <Icon size={19} /><span>{label}</span>
          </a>
        ) : (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => { setPage(id); close(); }}>
            <Icon size={19} /><span>{label}</span>{id === 'issues' && <b>{issues.length}</b>}
          </button>
        ))}
      </nav>
      <div className="side-note">
        <ShieldCheck size={18} />
        <div><strong>原始资料只读</strong><span>内部保留来源标识，页面使用数字引用</span></div>
      </div>
    </aside>
  );
}

function Header({ onMenu, query, setQuery }) {
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu} aria-label="打开菜单"><Menu /></button>
      <div className="project-title">
        <div><strong>2号学生食堂</strong><span>工作 Demo</span></div>
        <p>云南旅游职业学院龙泉路校区提升改造项目（一期）</p>
      </div>
      <label className="global-search">
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索参数、措施或问题…" />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="read-only"><span />本地只读资料</div>
    </header>
  );
}

function PageHeading({ title, description, action }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Metric({ value, label, note, tone }) {
  return <div className={`metric ${tone || ''}`}><strong>{value}</strong><span>{label}</span><small>{note}</small></div>;
}

function Inspector({ selected, close }) {
  if (!selected) return null;
  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div><span>参数详情</span><h3>{selected.name}</h3></div>
        <button onClick={close} aria-label="关闭详情"><PanelRightClose size={20} /></button>
      </div>
      <div className="inspector-value">
        <span>当前取值</span><strong>{selected.value} <em>{selected.unit !== '—' ? selected.unit : ''}</em></strong>
        <Status value={selected.status} />
      </div>
      <dl className="detail-list">
        <div><dt>陈述类型</dt><dd><ClaimType>{selected.claimType}</ClaimType></dd></div>
        <div><dt>置信度</dt><dd>{selected.confidence}%</dd></div>
        <div><dt>专业分类</dt><dd>{selected.category}</dd></div>
      </dl>
      <div className="confidence"><i style={{ width: `${selected.confidence}%` }} /></div>
      <section className="source-section">
        <h4>来源证据 <span>{selected.source_ids.length}</span></h4>
        {getReferences(selected.source_ids).map((ref) => (
          <article className="source-card" key={ref.id}>
            <span className="reference-no">[{ref.refNo}]</span>
            <strong>{ref.title}</strong>
            <small>{ref.type}{ref.locator ? ` · ${ref.locator}` : ''}</small>
          </article>
        ))}
      </section>
      <div className="inspector-note"><AlertTriangle size={16} /><p>{selected.note}</p></div>
    </aside>
  );
}

function ParameterTable({ compact = false, query = '', onSelect }) {
  const [filter, setFilter] = useState('all');
  const displayed = useMemo(() => projectBaseline.filter((item) => {
    const statusMatch = filter === 'all' || item.status === filter;
    const haystack = `${item.name} ${item.value} ${item.category} ${item.note}`.toLowerCase();
    return statusMatch && haystack.includes(query.toLowerCase());
  }).slice(0, compact ? 9 : undefined), [compact, filter, query]);

  return (
    <div className="parameter-block">
      {!compact && <div className="filter-row">
        {[['all', '全部'], ['confirmed', '已确认'], ['review', '待复核'], ['history', '历史记录']].map(([key, label]) => (
          <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
        <span>{displayed.length} 项</span>
      </div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>参数名称</th><th>当前取值</th><th>单位</th><th>引用</th><th>状态</th></tr></thead>
          <tbody>
            {displayed.map((item) => (
              <tr key={item.id} onClick={() => onSelect(item)} tabIndex="0" onKeyDown={(event) => event.key === 'Enter' && onSelect(item)}>
                <td><strong>{item.name}</strong><small>{item.category}</small></td>
                <td>{item.value}</td><td>{item.unit}</td><td><Citations ids={item.source_ids} /></td><td><Status value={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Overview({ query, onSelect, setPage }) {
  return (
    <div className="page-content">
      <PageHeading title="项目总览" description="把原始资料整理为项目基准、统一措施、说明和汇报，所有结论均可追溯。" action={<button className="primary" onClick={() => setPage('documents')}><FileText size={17} />查看网页版说明</button>} />
      <div className="metrics-grid">
        <Metric value={stats.parameterCount} label="项目关键参数" note={`${stats.confirmedCount}项已确认`} />
        <Metric value={stats.measureCount} label="统一措施条目" note={`${measureGroups.length}个专业分组`} tone="teal" />
        <Metric value={stats.documentCount} label="Word 网页版" note="扩初说明 + 评审分册" tone="amber" />
        <Metric value={stats.slideCount} label="PPT 页面" note="技术版29页 + 汇报版10页" tone="navy" />
      </div>
      <section className="panel">
        <div className="panel-head"><div><h2>领导抽查参数卡</h2><p>点击参数可查看来源、陈述类型和校核说明。</p></div><button className="text-button" onClick={() => setPage('parameters')}>查看全部 <ChevronRight size={16} /></button></div>
        <ParameterTable compact query={query} onSelect={onSelect} />
      </section>
      <section className="overview-grid">
        <div className="flow-section">
          <h2>资料处理闭环</h2>
          <div className="workflow-steps">
            {[['01', '原始资料', '只读保存', Database], ['02', '清洗归类', '名称、口径与冲突', Search], ['03', '项目基准', '参数和统一措施', ShieldCheck], ['04', '成果输出', 'Word 与 PPT 网页版', MonitorPlay]].map(([no, title, text, Icon], index) => (
              <div className="workflow-card" key={no}><Icon size={20} /><span>{no}</span><strong>{title}</strong><p>{text}</p>{index < 3 && <ArrowRight className="step-arrow" size={17} />}</div>
            ))}
          </div>
        </div>
        <div className="resolution-panel">
          <div className="panel-head"><div><h2>已确认口径</h2><p>用户决定优先于冲突资料。</p></div></div>
          {projectResolutions.map((decision) => <article key={decision.id}><Check size={16} /><div><strong>{decision.title}</strong><p>{decision.detail}</p><Citations ids={decision.source_ids} /></div></article>)}
        </div>
      </section>
      <section className="attention-strip"><AlertTriangle size={20} /><div><strong>当前最高优先级：用当前模型替换历史计算结果</strong><p>页面中的周期、位移角、剪重比和抗倾覆结果均标为历史评审记录。</p></div><button onClick={() => setPage('issues')}>查看问题</button></section>
    </div>
  );
}

function ParametersPage({ query, onSelect }) {
  return <div className="page-content"><PageHeading title="关键参数" description="项目参数按确认状态、陈述类型和来源分开管理。" action={<button className="secondary" onClick={() => runPrint('parameters')}><Printer size={17} />打印参数卡</button>} /><section className="panel"><ParameterTable query={query} onSelect={onSelect} /></section></div>;
}

const defaultRegulationLookup = {
  seismicProvince: '云南省', city: '昆明市', district: '盘龙区',
  windProvince: '云南', station: '昆明市', liveUse: '食堂',
};

const defaultWorkingParameters = {
  intensity: '8度', pga: '0.20', designGroup: '第三组',
  basicWind: '0.30', basicSnow: '0.30', snowZone: 'Ⅲ', diningLiveLoad: '3.0',
};

function loadStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try { return JSON.parse(window.localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function MeasuresPage({ query }) {
  const [groupId, setGroupId] = useState(humanMeasureGroups[0].id);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lookup, setLookup] = useState(() => loadStoredJson('structural-ai-regulation-lookup-v1', defaultRegulationLookup));
  const [workingParameters, setWorkingParameters] = useState(() => loadStoredJson('structural-ai-working-parameters-v1', defaultWorkingParameters));
  const [corrections, setCorrections] = useState(() => loadStoredJson('structural-ai-parameter-log-v1', []));
  const [notice, setNotice] = useState('查表结果只生成候选值，点击确认后才进入本次工作参数。');
  const group = humanMeasureGroups.find((item) => item.id === groupId) || humanMeasureGroups[0];
  const seismicProvinces = useMemo(() => uniqueSorted(seismicRecords.map((row) => row.province)), []);
  const cities = useMemo(() => uniqueSorted(seismicRecords.filter((row) => row.province === lookup.seismicProvince).map((row) => row.city)), [lookup.seismicProvince]);
  const districts = useMemo(() => uniqueSorted(seismicRecords.filter((row) => row.province === lookup.seismicProvince && row.city === lookup.city).map((row) => row.district)), [lookup.seismicProvince, lookup.city]);
  const windProvinces = useMemo(() => uniqueSorted(windSnowRecords.map((row) => row.province)), []);
  const stations = useMemo(() => uniqueSorted(windSnowRecords.filter((row) => row.province === lookup.windProvince).map((row) => row.station)), [lookup.windProvince]);
  const liveUses = useMemo(() => floorLiveLoadRecords.filter((row) => /食堂|餐厅|厨房|储藏|走廊|楼梯|卫生/.test(row.category)), []);
  const seismicMatches = useMemo(() => seismicRecords.filter((row) => row.province === lookup.seismicProvince && row.city === lookup.city && row.district === lookup.district), [lookup.seismicProvince, lookup.city, lookup.district]);
  const windMatches = useMemo(() => windSnowRecords.filter((row) => row.province === lookup.windProvince && row.station === lookup.station), [lookup.windProvince, lookup.station]);
  const liveMatches = useMemo(() => floorLiveLoadRecords.filter((row) => row.category.includes(lookup.liveUse)), [lookup.liveUse]);
  const selectedSeismic = seismicMatches.length === 1 ? seismicMatches[0] : null;
  const selectedWind = windMatches.length === 1 ? windMatches[0] : null;
  const selectedLive = liveMatches.length === 1 ? liveMatches[0] : null;

  useEffect(() => { window.localStorage.setItem('structural-ai-regulation-lookup-v1', JSON.stringify(lookup)); }, [lookup]);
  useEffect(() => { window.localStorage.setItem('structural-ai-working-parameters-v1', JSON.stringify(workingParameters)); }, [workingParameters]);
  useEffect(() => { window.localStorage.setItem('structural-ai-parameter-log-v1', JSON.stringify(corrections)); }, [corrections]);

  const updateLookup = (key, value) => {
    setLookup((current) => {
      const next = { ...current, [key]: value };
      if (key === 'seismicProvince') {
        const nextCity = seismicRecords.find((row) => row.province === value)?.city || '';
        next.city = nextCity;
        next.district = seismicRecords.find((row) => row.province === value && row.city === nextCity)?.district || '';
      }
      if (key === 'city') next.district = seismicRecords.find((row) => row.province === current.seismicProvince && row.city === value)?.district || '';
      if (key === 'windProvince') next.station = windSnowRecords.find((row) => row.province === value)?.station || '';
      return next;
    });
  };

  const recordChange = (kind, detail, sourceId) => {
    setCorrections((current) => [{ id: `LOG-${Date.now()}`, time: new Date().toLocaleString('zh-CN'), kind, detail, source_id: sourceId }, ...current].slice(0, 12));
  };

  const applyLocationCandidates = () => {
    if (!selectedSeismic || !selectedWind) {
      setNotice(seismicMatches.length > 1 || windMatches.length > 1 ? '命中多条记录，已阻止自动采用；请先核对冲突。' : '没有得到唯一匹配，未写入工作参数。');
      return;
    }
    setWorkingParameters((current) => ({
      ...current,
      intensity: selectedSeismic.intensity.replace(/\s+/g, ''),
      pga: selectedSeismic.pga.replace(/g$/i, ''),
      designGroup: selectedSeismic.designGroup,
      basicWind: selectedWind.basicWind,
      basicSnow: selectedWind.basicSnow,
      snowZone: selectedWind.snowZone,
    }));
    recordChange('人工确认', `采用${lookup.city}${lookup.district}抗震候选值和${lookup.station}风雪压候选值`, 'SRC-20260917-002,SRC-20260917-003');
    setNotice('已写入“本次工作参数”。这只是工作确认记录，原始资料和项目基准表均未改写。');
  };

  const applyLiveLoadCandidate = () => {
    if (!selectedLive) {
      setNotice(liveMatches.length > 1 ? '用途命中多条规范记录，请缩小用途或人工选择后再采用。' : '未找到唯一用途条目，未写入工作参数。');
      return;
    }
    setWorkingParameters((current) => ({ ...current, diningLiveLoad: selectedLive.standardValue }));
    recordChange('人工确认', `采用“${selectedLive.category}”活荷载候选值 ${selectedLive.standardValue}kN/m²`, 'SRC-20260917-004');
    setNotice('活荷载候选值已写入本次工作参数；与项目正式资料不一致时应由负责人决定。');
  };

  const updateWorkingParameter = (key, value) => {
    setWorkingParameters((current) => ({ ...current, [key]: value }));
    setNotice('已记录人工修改；离开页面后仍保存在本机浏览器中。');
  };

  const derivedProjectValue = (row) => {
    if (row.item === '抗震设防参数') return `${workingParameters.intensity}；${workingParameters.pga}g；${workingParameters.designGroup}；Ⅲ类场地`;
    if (row.item === '食堂、餐厅') return `${workingParameters.diningLiveLoad}kN/m²`;
    if (row.item === '基本风压') return `${workingParameters.basicWind}kN/m²；地面粗糙度B类`;
    if (row.item === '基本雪压') return `${workingParameters.basicSnow}kN/m²；准永久值分区${workingParameters.snowZone}`;
    return row.project;
  };
  const rows = group.rows.map((row) => ({ ...row, displayProject: derivedProjectValue(row) }))
    .filter((item) => `${item.item}${item.displayProject}${item.renda}${item.note}`.toLowerCase().includes(query.toLowerCase()));
  const aiPayload = useMemo(() => JSON.stringify({
    schema_version: '1.1',
    project: '云南旅游职业学院龙泉路校区提升改造项目（一期）—2号学生食堂',
    current_working_parameters: workingParameters,
    regulation_lookup_sources: {
      wind_snow: { records: regulationDatasetMeta.counts.windSnow, source_id: 'SRC-20260917-002', verification: '待正式规范复核' },
      seismic: { records: regulationDatasetMeta.counts.seismic, source_id: 'SRC-20260917-003', verification: '待正式规范复核' },
      live_load: { records: regulationDatasetMeta.counts.floorLiveLoad + regulationDatasetMeta.counts.roofLiveLoad, source_id: 'SRC-20260917-004', verification: '待正式规范复核' },
    },
    record_count: aiUnifiedParameterTable.length,
    fields: ['id', 'record_type', 'topic', 'parameter', 'value', 'unit', 'scope', 'status', 'source_ids', 'locator', 'note', 'claim_type'],
    records: aiUnifiedParameterTable,
  }, null, 2), [workingParameters]);

  const exportWord = async () => {
    setExporting(true);
    setNotice('正在生成 A3 横向双栏 Word 文档……');
    try {
      const { downloadUnifiedMeasuresDocx } = await import('./docxExporter.js');
      const groups = humanMeasureGroups.map((item) => ({
        ...item,
        rows: item.rows.map((row) => ({ ...row, project: derivedProjectValue(row) })),
      }));
      const references = Object.entries(referenceDocuments).map(([source_id, ref]) => ({ source_id, ...ref }));
      await downloadUnifiedMeasuresDocx({ groups, references });
      setNotice('Word 已生成：A3 横向、双栏、红色人大参考值，正文使用数字引用。');
    } catch (error) {
      console.error(error);
      setNotice(`Word 生成失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setExporting(false);
    }
  };

  const copyAiPayload = async () => {
    try {
      await navigator.clipboard.writeText(aiPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const downloadAiPayload = () => {
    const url = URL.createObjectURL(new Blob([aiPayload], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '2号学生食堂_统一参数_AI数据表.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-content">
      <PageHeading title="统一参数与技术措施" description="先从规范摘录获得候选值，再由人工确认本次工作参数，最后驱动统一措施正文。" action={<button className="primary" onClick={exportWord} disabled={exporting}><Download size={17} />{exporting ? '正在生成…' : '导出 Word (.docx)'}</button>} />
      <script id="ai-unified-parameter-table" type="application/json">{aiPayload}</script>
      <section className="ai-data-strip">
        <div><Database size={20} /><p><strong>AI 数据层已内嵌</strong><span>{aiUnifiedParameterTable.length} 条结构化记录 · 12个标准字段 · 完整保留来源链</span></p></div>
        <div><button className="secondary" onClick={copyAiPayload}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制 AI 参数表'}</button><button className="secondary" onClick={downloadAiPayload}><Download size={15} />下载 JSON</button></div>
      </section>
      <section className="regulation-workbench">
        <header className="regulation-head">
          <div><span>01</span><div><h2>按地点与用途查表</h2><p>内置 {regulationDatasetMeta.counts.windSnow} 个风雪压站点、{regulationDatasetMeta.counts.seismic} 个抗震区县和 {regulationDatasetMeta.counts.floorLiveLoad + regulationDatasetMeta.counts.roofLiveLoad} 个活荷载条目。</p></div></div>
          <b>AI 整理摘录 · 待正式版本复核</b>
        </header>
        <div className="lookup-grid">
          <label><span>省份（抗震）</span><select value={lookup.seismicProvince} onChange={(event) => updateLookup('seismicProvince', event.target.value)}>{seismicProvinces.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>隶属市</span><select value={lookup.city} onChange={(event) => updateLookup('city', event.target.value)}>{cities.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>区县</span><select value={lookup.district} onChange={(event) => updateLookup('district', event.target.value)}>{districts.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>省份（风雪）</span><select value={lookup.windProvince} onChange={(event) => updateLookup('windProvince', event.target.value)}>{windProvinces.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>气象站</span><select value={lookup.station} onChange={(event) => updateLookup('station', event.target.value)}>{stations.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>活荷载用途</span><select value={lookup.liveUse} onChange={(event) => updateLookup('liveUse', event.target.value)}><option value="食堂">食堂</option><option value="餐厅">餐厅</option><option value="厨房——（1）餐厅">餐厅厨房</option><option value="储藏室">储藏室</option><option value="人员密集">人员密集走廊/楼梯</option><option value="卫生间">卫生间</option></select></label>
        </div>
        <div className="candidate-grid">
          <article>
            <div className="candidate-title"><strong>地点候选值</strong><span className={selectedSeismic && selectedWind ? 'match-ok' : 'match-warn'}>{selectedSeismic && selectedWind ? '唯一匹配' : '需人工处理'}</span></div>
            <table><tbody>
              <tr><th>抗震设防</th><td>{selectedSeismic ? `${selectedSeismic.intensity} / ${selectedSeismic.pga} / ${selectedSeismic.designGroup}` : `${seismicMatches.length} 条匹配`}</td><td><Citations ids={['SRC-20260917-003']} /></td></tr>
              <tr><th>基本风压</th><td>{selectedWind ? `${selectedWind.basicWind} kN/m²` : `${windMatches.length} 条匹配`}</td><td><Citations ids={['SRC-20260917-002']} /></td></tr>
              <tr><th>基本雪压</th><td>{selectedWind ? `${selectedWind.basicSnow} kN/m² / ${selectedWind.snowZone}区` : `${windMatches.length} 条匹配`}</td><td><Citations ids={['SRC-20260917-002']} /></td></tr>
            </tbody></table>
            <button className="primary" onClick={applyLocationCandidates} disabled={!selectedSeismic || !selectedWind}><Check size={16} />人工确认并写入本次工作值</button>
          </article>
          <article>
            <div className="candidate-title"><strong>用途候选值</strong><span className={selectedLive ? 'match-ok' : 'match-warn'}>{selectedLive ? '唯一匹配' : `${liveMatches.length} 条匹配`}</span></div>
            {selectedLive ? <div className="live-load-result"><strong>{selectedLive.standardValue}<small> kN/m²</small></strong><p>{selectedLive.category}</p><span>ψc {selectedLive.combinationFactor} · ψf {selectedLive.frequentFactor} · ψq {selectedLive.quasiPermanentFactor} <Citations ids={['SRC-20260917-004']} /></span></div> : <div className="lookup-warning"><AlertTriangle size={18} />请选择能唯一定位的用途；多条命中时不自动采用。</div>}
            <button className="secondary" onClick={applyLiveLoadCandidate} disabled={!selectedLive}><Check size={16} />人工确认该用途值</button>
          </article>
        </div>
        <div className="verification-notice"><AlertTriangle size={17} /><p>{notice}<span>正式设计仍需核对现行规范、地方规定、地勘和主管部门要求。</span></p></div>
      </section>
      <section className="working-parameters">
        <header><div><span>02</span><div><h2>本次工作参数</h2><p>可人工修正；所有改动只保存在本机浏览器，不改写 raw 和项目基准数据。</p></div></div><button className="text-button" onClick={() => { setWorkingParameters(defaultWorkingParameters); recordChange('恢复默认', '恢复云南2号学生食堂项目基准值', 'SRC-01-STRUCT-DESIGN'); }}>恢复项目基准值</button></header>
        <div className="working-grid">
          {[['intensity','抗震设防烈度',''],['pga','设计基本地震加速度','g'],['designGroup','设计地震分组',''],['basicWind','基本风压','kN/m²'],['basicSnow','基本雪压','kN/m²'],['snowZone','雪荷载分区',''],['diningLiveLoad','食堂、餐厅活荷载','kN/m²']].map(([key,label,unit]) => <label key={key}><span>{label}</span><div><input value={workingParameters[key]} onChange={(event) => updateWorkingParameter(key, event.target.value)} />{unit && <em>{unit}</em>}</div></label>)}
        </div>
        <div className="generated-measures">
          <article><b>01</b><div><strong>地震作用参数</strong><p>抗震设防烈度 {workingParameters.intensity}，设计基本地震加速度 {workingParameters.pga}g，设计地震分组 {workingParameters.designGroup}；场地类别和特征周期仍按地勘与项目资料复核。</p></div></article>
          <article><b>02</b><div><strong>风雪荷载参数</strong><p>50 年一遇基本风压 {workingParameters.basicWind}kN/m²，基本雪压 {workingParameters.basicSnow}kN/m²，雪荷载准永久值系数分区为 {workingParameters.snowZone} 区。</p></div></article>
          <article><b>03</b><div><strong>食堂活荷载参数</strong><p>本次工作值为 {workingParameters.diningLiveLoad}kN/m²；设备、灶台、冷库和局部集中荷载另行复核。</p></div></article>
        </div>
        {corrections.length > 0 && <details className="correction-log"><summary>人工确认与修改记录（{corrections.length}）</summary>{corrections.map((item) => <p key={item.id}><time>{item.time}</time><strong>{item.kind}</strong><span>{item.detail}</span></p>)}</details>}
      </section>
      <div className="section-divider"><span>03</span><div><strong>统一措施正文</strong><p>下列项目值已与“本次工作参数”联动；人大通用条目继续用红色显示。</p></div></div>
      <div className="measures-layout">
        <aside className="measure-nav">
          {humanMeasureGroups.map((item) => <button key={item.id} className={groupId === item.id ? 'active' : ''} onClick={() => setGroupId(item.id)}><strong>{item.title}</strong><span>{item.rows.length}项</span></button>)}
        </aside>
        <section className="measure-content">
          <header><div><h2>{group.title}</h2><p>{group.summary}</p><div className="measure-legend"><span className="project-dot" />本项目采用值<span className="renda-dot" />人大参考值</div></div><span>{rows.length} 项</span></header>
          <div className="measure-table-wrap">
            <table className="human-measure-table">
              <thead><tr><th>控制项</th><th>本项目</th><th>人大参考</th><th>执行提示</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={`${group.id}-${row.item}`}>
                <th scope="row">{row.item}</th>
                <td className={row.displayProject === '—' ? 'empty-value' : 'project-value'}>{row.displayProject}</td>
                <td className={row.renda === '—' ? 'empty-value' : 'renda-reference'}>{row.renda}</td>
                <td className="measure-note">{row.note}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function ReferenceRows({ compact = false }) {
  const rows = compact ? referenceList.slice(0, 8) : referenceList;
  return <ol className="reference-list">{rows.map((source) => <li key={source.source_id} value={source.refNo}><strong>{source.title}</strong><span>{source.type}{source.file ? `：${source.file}` : ''}</span>{source.locator && source.file && <small>定位：{source.locator}</small>}{source.boundary && <small>{source.boundary}</small>}</li>)}</ol>;
}

function WordBlock({ block }) {
  if (block.type === 'references') return <ReferenceRows compact />;
  if (block.type === 'subheading') return <h3 className="word-subheading">{block.text}</h3>;
  if (block.type === 'figure') return <figure className="word-figure"><div><Image size={26} /><strong>{block.title}</strong><span>{block.note}</span></div><figcaption>{block.title}<Citations ids={block.source_ids} /></figcaption></figure>;
  if (block.type === 'table') return <div className="word-table-block"><h4>{block.title}</h4><table><thead><tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{block.note && <p className="table-note">注：{block.note}</p>}<Citations ids={block.source_ids} foot /></div>;
  return <div className="word-paragraph"><p>{block.text}<Citations ids={block.source_ids} /></p><ClaimType>{block.claimType}</ClaimType></div>;
}

function WordPage({ documentTitle, page }) {
  return (
    <article className="word-page">
      <header><span>{documentTitle}</span><b>{String(page.no).padStart(2, '0')}</b></header>
      <div className="word-columns">
        <section><h2>{page.leftTitle}</h2>{page.left.map((block, index) => <WordBlock key={index} block={block} />)}</section>
        <section><h2>{page.rightTitle}</h2>{page.right.map((block, index) => <WordBlock key={index} block={block} />)}</section>
      </div>
      <footer><span>结构专业内部工作草案</span><span>第 {page.no} 页</span></footer>
    </article>
  );
}

function DocumentsPage() {
  const [documentId, setDocumentId] = useState(wordOutputs[0].id);
  const documentOutput = wordOutputs.find((item) => item.id === documentId) || wordOutputs[0];
  return (
    <div className="artifact-stage word-stage">
      <div className="artifact-toolbar">
        <div><strong>Word 网页版</strong><span>A3 横向双栏，打印时按页输出</span></div>
        <div className="segmented">{wordOutputs.map((item) => <button key={item.id} className={documentId === item.id ? 'active' : ''} onClick={() => setDocumentId(item.id)}>{item.shortTitle}</button>)}</div>
        <button className="secondary" onClick={() => runPrint('word')}><Printer size={17} />打印 / 导出 PDF</button>
      </div>
      <div className="word-title-card"><h1>{documentOutput.title}</h1><p>{documentOutput.subtitle}</p><span>共 {documentOutput.pages.length} 页 · {documentOutput.id === 'input-cleaning-demo' ? '来源定位、待确认项和使用说明单列于核对附录' : '资料引用采用数字上标'}</span></div>
      <div className="word-pages">{documentOutput.pages.map((page) => <WordPage key={page.no} documentTitle={documentOutput.shortTitle} page={page} />)}</div>
    </div>
  );
}

const baselineMap = Object.fromEntries(projectBaseline.map((item) => [item.id, item]));

function MiniTable({ columns, rows, accent = false }) {
  return <table className={`slide-table ${accent ? 'accent' : ''}`}><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
}

function FigureSlots({ figures = [], wide = false }) {
  return <div className={`slide-figures ${wide ? 'wide' : ''}`}>{figures.map((figure) => <figure key={figure}><Image size={30} /><strong>{figure}</strong><span>待替换为当前版本正式图纸或计算截图</span></figure>)}</div>;
}

function SlideBody({ slide }) {
  if (slide.layout === 'cover') return <div className="slide-cover"><div className="cover-number">02</div><div><h2>{slide.title}</h2><p>{slide.subtitle}</p><span>云南旅游职业学院龙泉路校区提升改造项目（一期）</span></div></div>;
  if (['figure-dual', 'figure-split', 'figure-chart'].includes(slide.layout)) return <FigureSlots figures={slide.figures} />;
  if (slide.layout === 'figure-wide') return <FigureSlots figures={slide.figures} wide />;
  if (slide.layout === 'overview') return <div className="slide-overview"><FigureSlots figures={['建筑效果图', '整体计算模型']} /><MiniTable columns={['建筑物', '层数', '尺寸', '高度', '结构体系', '抗震等级']} rows={[[baselineMap['building-name'].value, '4/1', '37.7×27.8m', '17.35m', '框架', '二级']]}/></div>;
  if (slide.layout === 'lead-summary') return <div className="slide-key-grid">{[['17.35m', '建筑高度'], ['4/1', '地上/地下层数'], ['37.7×27.8m', '平面尺寸'], ['框架', '结构体系'], ['乙类', '设防类别'], ['50年', '设计工作年限']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>;
  if (slide.layout === 'parameter-table') return <MiniTable columns={['参数', '取值', '参数', '取值']} rows={[[ '结构安全等级', '一级', '重要性系数', '1.1'], ['设防烈度', '8度', '基本加速度', '0.20g'], ['设计分组', '第三组', '场地类别', 'Ⅲ类'], ['特征周期', '0.65/0.70s', '阻尼比', '0.05'], ['抗震等级', '二级；转换构件一级', '嵌固端', '地下室顶板']]}/>;
  if (slide.layout === 'member-table') return <MiniTable columns={['构件', '历史记录', '当前状态']} rows={[[ '下支墩', '900×900～1100×1100mm', '待当前图纸确认'], ['框架梁', '500×800～900mm', '待当前图纸确认'], ['转换梁', '800×1200mm', '关键构件'], ['楼板', '250～400mm', '待当前图纸确认']]}/>;
  if (slide.layout === 'irregularity') return <div className="slide-flat-list">{[['转换构件', '局部转换梁柱按一级采取抗震措施'], ['隔震层', '支座、下支墩和相连框架梁专项验算'], ['楼板与洞口', '按最新建筑平面复核连续性'], ['扭转与刚度', '由当前模型逐项判定']].map(([title, text], index) => <article key={title}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{title}</strong><p>{text}</p></div></article>)}</div>;
  if (slide.layout === 'performance') return <MiniTable accent columns={['关键对象', '中震目标', '罕遇地震目标']} rows={[[ '转换梁柱', '抗剪弹性、抗弯弹性', '承载与变形专项复核'], ['隔震支座下支墩', '保持弹性', '抗剪弹性、抗弯不屈服'], ['相连地下室框架梁', '保持弹性', '抗剪弹性、抗弯不屈服'], ['隔震支座', '应力与恢复力满足', '位移、稳定及抗倾覆满足']]}/>;
  if (slide.layout === 'model-compare') return <div className="model-compare"><div><strong>YJK</strong><span>整体模型</span><p>周期、剪重比、位移角、构件设计</p></div><div><strong>ETABS</strong><span>独立复核</span><p>隔震体系、支座响应和地震放大系数</p></div><small>以上为历史评审资料记录，当前模型需重新复算。</small></div>;
  if (slide.layout === 'model-parameters') return <MiniTable columns={['计算参数', '历史记录']} rows={[[ '设防类别 / 安全等级', '乙类 / 一级'], ['烈度 / 加速度 / 分组', '8度 / 0.20g / 第三组'], ['场地类别 / 特征周期', 'Ⅲ类 / 0.65s'], ['阻尼比 / 振型数', '0.05 / 30'], ['偶然偏心 / 双向地震', '考虑 / 考虑'], ['竖向地震 / 嵌固端', '考虑 / 地下室顶板']]}/>;
  if (slide.layout === 'period-table') return <div className="slide-centered-table"><h3>隔震前后结构的前三阶周期</h3><MiniTable columns={['振型', '隔震前（s）', '隔震后（s）']} rows={[[ '1', '0.784', '2.621'], ['2', '0.768', '2.616'], ['3', '0.644', '2.174']]}/><p>两方向基本周期差值为0.19%，历史报告判定满足要求。</p></div>;
  if (slide.layout === 'drift-table') return <div className="slide-centered-table"><h3>设防地震下结构层间位移角</h3><MiniTable columns={['楼层', 'X向', 'Y向']} rows={[[ '8', '1/1839', '1/2079'], ['7', '1/1080', '1/1022'], ['6', '1/882', '1/772'], ['5', '1/791', '1/767'], ['4', '1/718', '1/697']]}/><p>历史报告采用限值1/400，最不利值为X向1/718、Y向1/697。</p></div>;
  if (slide.layout === 'overturning-table') return <div className="slide-centered-table"><h3>抗倾覆历史验算结果</h3><MiniTable columns={['方向', '抗倾覆力矩', '倾覆力矩', '比值', '限值']} rows={[[ 'X向', '4320823', '164708', '26.23', '1.1'], ['Y向', '2830015', '164849', '17.17', '1.1']]}/><p>正式成果需核对单位、组合及当前模型结果。</p></div>;
  if (slide.layout === 'override-table') return <MiniTable columns={['检查项', '参考模板', '云南项目', '处理']} rows={overrides.slice(1).map((item) => [item.item, item.template, item.project, item.state])}/>;
  if (['result-summary', 'result-matrix', 'lead-results'].includes(slide.layout)) return <div className="result-grid">{[['2.621s', '隔震后第一周期'], ['1/697', '历史最不利位移角'], ['17.17', '历史最小抗倾覆比'], ['30', '历史模型振型数']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span><small>历史评审结果</small></div>)}</div>;
  if (slide.layout === 'structure-summary') return <div className="structure-summary"><FigureSlots figures={['整体结构模型']} wide /><ul><li>钢筋混凝土框架结构</li><li>转换梁柱按一级采取抗震措施</li><li>地下室顶板设置隔震层</li><li>与相邻结构通过结构缝脱开</li></ul></div>;
  if (slide.layout === 'seismic-summary') return <div className="seismic-summary"><div><strong>8度</strong><span>设防烈度</span></div><div><strong>0.20g</strong><span>基本地震加速度</span></div><div><strong>第三组</strong><span>设计地震分组</span></div><div><strong>Ⅲ类</strong><span>暂用场地类别</span></div><div><strong>0.65s</strong><span>多遇及设防周期</span></div><div><strong>0.70s</strong><span>罕遇周期</span></div></div>;
  if (slide.layout === 'foundation-summary') return <div className="foundation-summary"><div><strong>钻孔灌注桩</strong><span>基础方案</span></div><MiniTable columns={['控制项', '方案记录']} rows={[[ '桩径', '800mm'], ['桩长', '约22～26m'], ['承载力特征值', '暂按2200kN'], ['抗浮设防水位', '1907.50m'], ['地质控制', '软弱土、负摩阻力、震陷']]}/></div>;
  if (slide.layout === 'decisions') return <div className="slide-flat-list">{issues.slice(0, 3).map((issue, index) => <article key={issue.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{issue.title}</strong><p>{issue.detail}</p></div></article>)}</div>;
  if (slide.layout === 'references') return <div className="slide-references"><ReferenceRows compact /><aside><strong>待确认</strong><p>当前模型结果</p><p>正式图纸</p><p>建筑输入日期</p></aside></div>;
  return <FigureSlots figures={slide.figures || ['待补充技术图表']} wide />;
}

function SlideCanvas({ slide, index, total }) {
  const cover = slide.layout === 'cover';
  return (
    <article className={`slide-canvas ${cover ? 'is-cover' : ''}`}>
      {!cover && <header><div><b>02</b><strong>2号学生食堂结构设计</strong></div><span>{slide.no}</span></header>}
      {!cover && <div className="slide-title"><h2>{slide.title}</h2><p>{slide.subtitle}</p></div>}
      <main><SlideBody slide={slide} /></main>
      <footer><Citations ids={slide.source_ids} foot /><span>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span></footer>
    </article>
  );
}

function SlidesPage() {
  const [deckId, setDeckId] = useState('technical');
  const [index, setIndex] = useState(0);
  const deck = slideOutputs[deckId];
  const slide = deck.slides[index] || deck.slides[0];
  useEffect(() => setIndex(0), [deckId]);
  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(deck.slides.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deck.slides.length]);
  return (
    <div className="artifact-stage slide-stage">
      <div className="artifact-toolbar">
        <div><strong>PPT 网页版</strong><span>{deck.description} · 方向键翻页</span></div>
        <div className="segmented">{Object.values(slideOutputs).map((item) => <button key={item.id} className={deckId === item.id ? 'active' : ''} onClick={() => setDeckId(item.id)}>{item.title}</button>)}</div>
        <button className="secondary" onClick={() => runPrint('slides')}><Printer size={17} />打印 / 导出 PDF</button>
      </div>
      <SlideCanvas slide={slide} index={index} total={deck.slides.length} />
      <div className="slide-controls">
        <button onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}><ArrowLeft size={18} />上一页</button>
        <div><strong>{String(index + 1).padStart(2, '0')}</strong><span>/ {String(deck.slides.length).padStart(2, '0')}</span><input type="range" min="1" max={deck.slides.length} value={index + 1} onChange={(event) => setIndex(Number(event.target.value) - 1)} /></div>
        <button onClick={() => setIndex((value) => Math.min(deck.slides.length - 1, value + 1))} disabled={index === deck.slides.length - 1}>下一页<ArrowRight size={18} /></button>
      </div>
      <div className="ppt-print-deck">{deck.slides.map((item, itemIndex) => <SlideCanvas key={item.no} slide={item} index={itemIndex} total={deck.slides.length} />)}</div>
    </div>
  );
}

function IssuesPage({ query }) {
  const list = issues.filter((issue) => `${issue.title}${issue.detail}${issue.status}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="page-content">
      <PageHeading title="问题清单" description="只保留仍会影响正式成果的问题；已经确认的名称和高度转入决定记录。" action={<span className="issue-count">{issues.length} 项</span>} />
      <div className="issue-list">{list.map((issue) => <article key={issue.id} className={`issue-card ${issue.severity}`}><div className="issue-code"><span>{issue.id}</span><em>{issue.severity === 'high' ? '高优先级' : '中优先级'}</em></div><div className="issue-body"><h2>{issue.title}</h2><p>{issue.detail}</p><div><ClaimType>{issue.claimType}</ClaimType><Citations ids={issue.source_ids} /></div></div><span className="issue-state">{issue.status}</span></article>)}</div>
      <section className="resolved-list"><h2>已确认决定</h2>{projectResolutions.map((decision) => <article key={decision.id}><Check size={17} /><div><strong>{decision.title}</strong><p>{decision.detail}</p><Citations ids={decision.source_ids} /></div></article>)}</section>
    </div>
  );
}

function ReferencesPage() {
  return <div className="page-content"><PageHeading title="参考资料" description="页面中的数字上标与本索引一一对应；内部来源标识不对读者显示。" /><section className="references-panel"><ReferenceRows /></section><section className="citation-policy"><h2>引用规则</h2><p>所有可复用结论内部保留来源标识；阅读界面只显示数字引用。用户确认事项作为独立决定记录引用，外部项目统一措施始终标注为参考总则。</p><div>{['原文事实', '作者观点', '我的观点', 'AI推断'].map((item) => <ClaimType key={item}>{item}</ClaimType>)}</div></section></div>;
}

function App() {
  const [page, setPage] = useState(() => {
    const stored = localStorage.getItem('struct-ai-page');
    return allPageIds.has(stored) && stored !== 'measures' ? stored : 'overview';
  });
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => localStorage.setItem('struct-ai-page', page), [page]);
  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.global-search input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const content = {
    overview: <Overview query={query} onSelect={setSelected} setPage={setPage} />,
    parameters: <ParametersPage query={query} onSelect={setSelected} />,
    confirmation: <ConfirmationWorkspace />,
    measures: <MeasuresPage query={query} />,
    documents: <DocumentsPage />,
    slides: <SlidesPage />,
    issues: <IssuesPage query={query} />,
    references: <ReferencesPage />,
  }[page];
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} open={menuOpen} close={() => setMenuOpen(false)} />{menuOpen && <button className="mobile-overlay" onClick={() => setMenuOpen(false)} aria-label="关闭菜单" />}<div className="workspace"><Header onMenu={() => setMenuOpen(true)} query={query} setQuery={setQuery} /><div className={`content-shell ${selected ? 'has-inspector' : ''}`}><main className="main-content">{content}</main>{selected && <Inspector selected={selected} close={() => setSelected(null)} />}</div></div></div>;
}

export default App;
