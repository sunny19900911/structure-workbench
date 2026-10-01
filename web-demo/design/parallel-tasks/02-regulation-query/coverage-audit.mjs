import fs from 'node:fs';

const base = new URL('./', import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(new URL('main-workbench-pilot-tj-bj.json', base), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(new URL('prototype/catalog/catalog.json', base), 'utf8'));

const normalizeCode = (value = '') => String(value)
  .toUpperCase()
  .replaceAll('（', '(')
  .replaceAll('）', ')')
  .replace(/[^A-Z0-9]/g, '');

const looksLikeStandardCode = (value = '') => /^(DB|DBJ|DG|XJJ)/i.test(String(value).trim());
const statuses = { current: 0, non_current: 0, pending: 0 };
const provinceRows = [];
const pageCodesByProvince = new Map();

for (const [province, payload] of Object.entries(snapshot.provinces)) {
  const row = { province, total: payload.records.length, current: 0, non_current: 0, pending: 0 };
  const codes = new Set();
  for (const record of payload.records) {
    statuses[record.status] += 1;
    row[record.status] += 1;
    codes.add(normalizeCode(record.code));
  }
  row.pending_rate = row.total ? Number((row.pending / row.total).toFixed(3)) : 0;
  provinceRows.push(row);
  pageCodesByProvince.set(province, codes);
}

const catalogCodesByProvince = new Map();
for (const record of catalog.records) {
  if (!looksLikeStandardCode(record.code)) continue;
  const code = normalizeCode(record.code);
  if (!code) continue;
  if (!catalogCodesByProvince.has(record.province)) catalogCodesByProvince.set(record.province, new Map());
  catalogCodesByProvince.get(record.province).set(code, {
    code: record.code,
    title: record.title,
    source_id: record.source_id,
  });
}

const catalogGapRows = [];
for (const [province, catalogCodes] of catalogCodesByProvince) {
  const pageCodes = pageCodesByProvince.get(province) || new Set();
  const missing = [...catalogCodes.entries()]
    .filter(([code]) => !pageCodes.has(code))
    .map(([, record]) => record);
  if (missing.length) catalogGapRows.push({
    province,
    catalog_unique_codes: catalogCodes.size,
    page_records: snapshot.provinces[province]?.records.length || 0,
    missing_candidate_count: missing.length,
    missing_candidates: missing,
  });
}

const result = {
  audit_source_id: snapshot.coverage.audit_source_id,
  as_of_date: snapshot.as_of_date,
  snapshot_source_id: snapshot.source_id,
  interpretation: 'missing_candidates 仅表示 iMA 目录中的编号未在页面找到；须分类并经权威源核查后才能入正式快照。',
  totals: {
    provinces: provinceRows.length,
    records: Object.values(statuses).reduce((sum, count) => sum + count, 0),
    ...statuses,
  },
  low_coverage: provinceRows.filter((row) => row.total < 5),
  high_pending: provinceRows.filter((row) => row.pending_rate >= 0.5),
  catalog_gap_top: catalogGapRows
    .sort((a, b) => b.missing_candidate_count - a.missing_candidate_count)
    .slice(0, 15),
};

console.log(JSON.stringify(result, null, 2));
