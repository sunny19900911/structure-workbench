import assert from 'node:assert/strict';
import { __test, extractAnchors, recordsFromNotice } from './online-sources.mjs';

const anchors = extractAnchors('<a href="/a.html" title="发布《测试标准》的通知">通知</a><span>2026-08-01</span>', 'https://example.gov.cn/list/');
assert.equal(anchors[0].url, 'https://example.gov.cn/a.html');
assert.equal(anchors[0].publicationDate, '2026-08-01');

assert.equal(__test.extractStandardNo('编号为 DB/T29-38-2025，自2026年实施'), 'DB/T29-38-2025');
assert.deepEqual(__test.normalizeKeywords('建筑抗震设计标准\nGB 50011-2010\n3、地基基础'), ['建筑抗震设计标准', 'GB 50011-2010', '地基基础']);
assert.deepEqual(__test.buildSearchVariants('GB 50011-2010'), ['GB50011-2010', 'GB50011']);

const source = { id: 'test', name: '测试权威源', authority: '测试机构', homepage: 'https://example.gov.cn/' };
const notice = recordsFromNotice({
  title: '关于发布《新标准》的通知',
  url: 'https://example.gov.cn/a.html',
  publicationDate: '2025-10-20',
  catalogStatus: 'announcement',
  html: '<p>现批准《新标准》，编号为 DB/T29-38-2025，自2026年4月1日起实施。原《旧标准》（DB/T29-38-2015）同时废止。</p>',
  response: { retrievedAt: '2026-09-25T00:00:00.000Z', sha256: 'abc' },
  source,
  asOf: '2026-09-25',
  layer: 'local',
  province: '天津市',
});
assert.equal(notice[0].status, 'implemented_current_unverified');
assert.equal(notice[0].documentNo, 'DB/T29-38-2025');
assert.ok(notice.some((item) => item.status === 'repealed' && item.documentNo.includes('2015')));
assert.equal(notice.find((item) => item.status === 'repealed').documentNo, 'DB/T29-38-2015');

const renamed = recordsFromNotice({
  title: '关于发布国家标准《建筑抗震设计规范》局部修订的公告',
  url: 'https://example.gov.cn/b.html',
  publicationDate: '2024-04-24',
  catalogStatus: 'announcement',
  html: '<p>现批准国家标准《建筑抗震设计规范》（GB50011-2010）局部修订，自2024年8月1日起实施。标准名称修改为《建筑抗震设计标准》，标准编号修改为GB/T50011-2010。</p>',
  response: { retrievedAt: '2026-09-25T00:00:00.000Z', sha256: 'def' },
  source,
  asOf: '2026-09-25',
  layer: 'national',
});
assert.equal(renamed[0].title, '建筑抗震设计标准');
assert.equal(renamed[0].documentNo, 'GB/T50011-2010');
assert.equal(renamed[0].status, 'implemented_current_unverified');

const currentCatalog = recordsFromNotice({
  title: '云南省工程建设地方标准岩土工程与地基基础板块现行标准目录',
  url: 'https://example.gov.cn/c.html',
  publicationDate: '2026-06-30',
  catalogStatus: 'official_standard_catalog',
  html: '<p>1.建筑基坑工程监测技术规程（DBJ53T-67-2014）2.云南省建筑基坑支护技术规程（DBJ 53T-71-2015）</p>',
  response: { retrievedAt: '2026-09-25T00:00:00.000Z', sha256: 'ghi' },
  source,
  asOf: '2026-09-25',
  layer: 'local',
  province: '云南省',
  queryTerm: '地基基础',
});
assert.equal(currentCatalog.length, 2);
assert.equal(currentCatalog[0].status, 'effective');
assert.equal(currentCatalog[1].documentNo, 'DBJ53T-71-2015');

const shanghaiCatalog = __test.extractShanghaiCatalog(`
  <script>
  { "mc": "建筑抗震设计标准", "url": "/cmsres/a.pdf", "bh": "DG/TJ08-9-2023", "pz": "2023-1-12", "ss": "2023-6-1", "lx": "推荐性标准", "wjh": "", "bah": "J10284-2023" },
  { "mc": "地基基础设计标准", "url": "/cmsres/b.pdf", "bh": "DGJ08-11-2018", "pz": "2019-01-18", "ss": "2019-08-01", "lx": "推荐性标准", "wjh": "", "bah": "J11595-2018" }
  </script>`, 'https://zjw.sh.gov.cn/xxbz/');
assert.equal(shanghaiCatalog.length, 2);
assert.equal(shanghaiCatalog[0].implementationDate, '2023-06-01');
assert.equal(shanghaiCatalog[1].documentUrl, 'https://zjw.sh.gov.cn/cmsres/b.pdf');

assert.equal(__test.verifiedCatalogs.tianjin.length, 14);
assert.equal(new Set(__test.verifiedCatalogs.tianjin.map((item) => item.localFileName)).size, 14);
assert.ok(__test.verifiedCatalogs.tianjin.some((item) => item.status === 'repealed' && item.documentNo.includes('2016〕256')));
assert.ok(__test.verifiedCatalogs.tianjin.some((item) => item.status === 'unknown' && item.documentNo.includes('2016〕39')));
assert.ok(__test.verifiedCatalogs.beijing.some((item) => item.status === 'repealed'));
for (const documentNo of ['DB11/T 689-2025', 'DB11/637-2015', 'DB11/1740-2020', 'DB11/T 367-2021', 'DBJ11-501-2009', 'DB11/1245-2015', 'DB11/T 849-2011', 'DB11/T 689-2009', 'DB11/T 882-2012', 'DB11/T 1831-2021']) {
  assert.ok(__test.verifiedCatalogs.beijing.some((item) => item.documentNo === documentNo), `北京 iMA 基准缺少 ${documentNo}`);
}
assert.ok(__test.verifiedCatalogs.beijing.some((item) => item.documentNo === 'DB11/1245-2015' && item.status === 'unknown'));
assert.equal(__test.verifiedCatalogs.shanghaiHistorical.filter((item) => item.status === 'repealed').length, 2);
assert.ok(__test.verifiedCatalogs.guangdong.some((item) => item.status === 'repealed'));
assert.ok(__test.verifiedCatalogs.jiangsu.some((item) => item.status === 'repealed'));
assert.ok(__test.verifiedCatalogs.yunnan.some((item) => item.status === 'repealed'));

console.log('PASS online parser tests');
