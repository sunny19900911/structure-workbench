const compact = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s·•,，。;；:：/\\()（）【】\[\]_-]/g, '');

export function normalizeQuery(value) {
  return compact(value);
}

export function resolvePlace(query, places) {
  const normalized = normalizeQuery(query);
  if (!normalized) return { state: 'unresolved', normalized, candidates: [] };

  const matches = [];
  for (const place of places) {
    for (const alias of place.aliases) {
      const aliasKey = normalizeQuery(alias.name);
      let score = 0;
      let matchedBy = alias.kind;
      if (normalized === aliasKey) score = alias.kind === 'official_name' ? 1 : 0.88;
      else if (normalized.includes(aliasKey) || aliasKey.includes(normalized)) score = 0.7;
      else if (alias.fuzzy && editDistance(normalized, aliasKey) <= 1) {
        score = 0.52;
        matchedBy = 'fuzzy';
      }
      if (/天津/.test(normalized) && place.province === '天津市') score += 0.09;
      if (/云南|昆明|盘龙/.test(normalized) && place.province === '云南省') score += 0.09;
      if (/上海/.test(normalized) && place.province === '上海市') score += 0.09;
      if (/天津/.test(normalized) && place.province !== '天津市') score -= 0.25;
      if (/云南|昆明|盘龙/.test(normalized) && place.province !== '云南省') score -= 0.25;
      if (/上海/.test(normalized) && place.province !== '上海市') score -= 0.25;
      if (score > 0) matches.push({ ...place, score: Math.min(score, 1), matchedBy, alias });
    }
  }

  const bestByPlace = new Map();
  for (const item of matches.sort((a, b) => b.score - a.score)) {
    if (!bestByPlace.has(item.placeId)) bestByPlace.set(item.placeId, item);
  }
  const deduped = [...bestByPlace.values()].sort((a, b) => b.score - a.score);

  if (!deduped.length) return { state: 'unresolved', normalized, candidates: [] };
  if (deduped.length > 1 && deduped[0].score - deduped[1].score < 0.18) {
    return { state: 'ambiguous', normalized, candidates: deduped };
  }
  const first = deduped[0];
  const exactOfficial = first.matchedBy === 'official_name' && first.score >= 0.99;
  const confirmed = exactOfficial && first.reviewStatus === 'approved_formal' && first.placeType !== 'development_zone';
  return {
    state: confirmed ? 'resolved_exact' : 'resolved_needs_confirmation',
    normalized,
    candidates: confirmed ? [first] : deduped,
    selected: first,
    confirmed,
  };
}

function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

export function effectiveStatus(document, asOf) {
  const at = new Date(`${asOf}T00:00:00Z`).getTime();
  const implementation = document.implementationDate ? new Date(`${document.implementationDate}T00:00:00Z`).getTime() : null;
  const repeal = document.repealDate ? new Date(`${document.repealDate}T00:00:00Z`).getTime() : null;
  if (!Number.isFinite(at)) return 'unknown';
  if (implementation && implementation > at) return 'not_yet_effective';
  if (repeal && repeal <= at) return 'repealed';
  if (document.supersededBy && document.successorEffectiveDate
    && new Date(`${document.successorEffectiveDate}T00:00:00Z`).getTime() <= at) return 'superseded';
  if (implementation) return 'effective';
  return 'unknown';
}

export function queryRegulations({ placeId, regulations, asOf, includeDiscovery = false }) {
  return regulations
    .filter((document) => document.placeIds.includes('*') || document.placeIds.includes(placeId))
    .filter((document) => includeDiscovery || document.recordStatus !== 'discovery_candidate')
    .map((document) => ({ ...document, effectiveStatus: effectiveStatus(document, asOf) }))
    .sort((a, b) => {
      const dateOrder = String(b.publicationDate || '').localeCompare(String(a.publicationDate || ''));
      return dateOrder || layerRank(a.layer) - layerRank(b.layer);
    });
}

function layerRank(layer) {
  return { national: 1, local: 2, special: 3, project_reference: 4 }[layer] || 9;
}

export function statusLabel(status) {
  return {
    effective: '现行',
    not_yet_effective: '未实施',
    repealed: '已废止',
    superseded: '被替代',
    draft: '征求意见 / 公示',
    implemented_current_unverified: '已发布 / 已执行',
    published_pending_date: '已发布 / 执行待核',
    unknown: '待核实',
  }[status] || '待核实';
}
