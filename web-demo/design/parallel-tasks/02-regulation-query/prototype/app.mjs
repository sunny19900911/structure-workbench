import { resolvePlace, statusLabel } from './core.mjs';
import { AS_OF_DATE, places, scenarios } from './fixtures.mjs';

const state = {
  resolution: null,
  selectedPlace: null,
  placeConfirmed: false,
  records: [],
  backendOnline: false,
  loading: false,
  lastRun: null,
  activeScenario: 'tianjin',
};

const $ = (selector) => document.querySelector(selector);
const queryInput = $('#place-query');
const provinceFilter = $('#province-filter');
const resolutionBox = $('#resolution');
const resultBody = $('#result-body');
const resultEmpty = $('#result-empty');
const discoveryButton = $('#discover-online');
const networkStatus = $('#network-status');

$('#resolve-form').addEventListener('submit', (event) => {
  event.preventDefault();
  runResolution(queryInput.value, true);
});

provinceFilter.addEventListener('change', () => {
  selectScenario(provinceFilter.value, true);
});

discoveryButton.addEventListener('click', runLiveAudit);

async function checkBackend() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.backendOnline = payload.mode === 'live-readonly';
    networkStatus.textContent = state.backendOnline ? '联网服务已连接' : '联网服务状态异常';
    networkStatus.className = state.backendOnline ? 'network-status online' : 'network-status offline';
  } catch {
    state.backendOnline = false;
    networkStatus.textContent = '联网服务未启动';
    networkStatus.className = 'network-status offline';
  }
  updateDiscoveryButton();
  renderResults();
  if (state.backendOnline && state.placeConfirmed && !state.lastRun) await runLiveAudit();
}

async function runLiveAudit() {
  if (!state.placeConfirmed || !state.backendOnline || state.loading) return;
  state.loading = true;
  state.records = [];
  state.lastRun = null;
  discoveryButton.textContent = '正在联网查询…';
  updateDiscoveryButton();
  renderResults();

  try {
    const scenario = scenarios[state.activeScenario];
    const response = await fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        province: state.selectedPlace.province,
        placeId: state.selectedPlace.placeId,
        keywords: scenario?.keywords || '建筑结构\n抗震\n地基基础',
        asOf: AS_OF_DATE,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    state.records = payload.records || [];
    state.lastRun = payload;
    discoveryButton.textContent = '重新联网查询';
  } catch (error) {
    state.lastRun = { error: error.message };
    discoveryButton.textContent = '重试联网查询';
    toast(`联网查询失败：${error.message}`);
  } finally {
    state.loading = false;
    updateDiscoveryButton();
    renderResults();
  }
}

function selectScenario(key, autoSearch) {
  const scenario = scenarios[key];
  if (!scenario) return;
  state.activeScenario = key;
  provinceFilter.value = key;
  queryInput.value = scenario.query;
  window.history.replaceState(null, '', `?province=${key}`);
  runResolution(scenario.query, autoSearch);
}

function runResolution(query, autoSearch = false) {
  state.resolution = resolvePlace(query, places);
  state.selectedPlace = state.resolution.selected || null;
  state.placeConfirmed = Boolean(state.resolution.confirmed);
  state.records = [];
  state.lastRun = null;

  if (state.selectedPlace) {
    const matchedScenario = Object.entries(scenarios).find(([, scenario]) => scenario.province === state.selectedPlace.province);
    if (matchedScenario) {
      state.activeScenario = matchedScenario[0];
      provinceFilter.value = matchedScenario[0];
    }
  }

  renderResolution();
  renderResults();
  updateDiscoveryButton();
  if (autoSearch && state.placeConfirmed && state.backendOnline) runLiveAudit();
}

function renderResolution() {
  const resolution = state.resolution;
  if (resolution.state === 'resolved_exact') {
    resolutionBox.innerHTML = `<p class="resolution-ok">已确认：${escapeHtml(state.selectedPlace.displayPath)}</p>`;
    return;
  }
  if (resolution.state === 'ambiguous') {
    resolutionBox.innerHTML = '<p class="resolution-warn">地点有歧义，请输入完整省市名称。</p>';
    return;
  }
  resolutionBox.innerHTML = '<p class="resolution-warn">当前页面仅收录上方 7 个重点省份。</p>';
}

function updateDiscoveryButton() {
  discoveryButton.disabled = !state.placeConfirmed || !state.backendOnline || state.loading;
}

function renderResults() {
  resultBody.innerHTML = '';
  if (!state.placeConfirmed) {
    showEmpty('请先确认查询地区。');
    return;
  }
  if (state.loading) {
    showEmpty('正在逐条访问权威原始网页，请稍候…');
    return;
  }
  if (!state.lastRun) {
    showEmpty(state.backendOnline ? '点击“联网查询”查看适用规范。' : '正在连接联网服务…');
    return;
  }
  if (state.lastRun.error) {
    showEmpty(`查询失败：${state.lastRun.error}`);
    return;
  }
  if (!state.records.length) {
    showEmpty('本次没有从权威网页核到相关规范。未命中不代表废止。');
    return;
  }

  resultEmpty.hidden = true;
  state.records.forEach((regulation) => {
    const link = regulation.secondarySourceUrl || regulation.sourceUrl;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${layerLabel(regulation.layer)}</td>
      <td><strong>${escapeHtml(regulation.title)}</strong><code>${escapeHtml(regulation.documentNo)}</code></td>
      <td>
        <b class="status ${regulation.status}">${statusLabel(regulation.status)}</b>
        <span>发布：${regulation.publicationDate || '已发布'}</span>
        <span>执行：${regulation.implementationDate || '待核'}</span>
        ${regulation.repealDate ? `<span>废止：${escapeHtml(regulation.repealDate)}</span>` : ''}
      </td>
      <td><a class="table-source-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">打开官网</a></td>`;
    resultBody.appendChild(tr);
  });
}

function showEmpty(message) {
  resultEmpty.hidden = false;
  resultEmpty.textContent = message;
}

function layerLabel(layer) {
  return {
    national: '国家标准', industry: '行业标准', local: '地方标准', supplementary: '专项规定',
    local_regulation: '地方性法规', policy: '政策文件', review_guidance: '审查技术文件',
  }[layer] || layer;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 3200);
}

const requestedProvince = new URLSearchParams(window.location.search).get('province');
selectScenario(scenarios[requestedProvince] ? requestedProvince : 'tianjin', false);
checkBackend();
