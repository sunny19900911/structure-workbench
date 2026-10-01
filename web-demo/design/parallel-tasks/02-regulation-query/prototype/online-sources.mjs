import { createHash } from 'node:crypto';

const USER_AGENT = 'WorkBuddy-Regulation-Audit/0.1 (+read-only; evidence capture)';
const REQUEST_TIMEOUT_MS = 18_000;
const MAX_DETAIL_FETCHES = 12;

const SOURCE_REGISTRY = {
  samr: {
    id: 'samr',
    name: '全国标准信息公共服务平台',
    authority: '国家市场监督管理总局 / 国家标准化管理委员会',
    homepage: 'https://std.samr.gov.cn/',
  },
  mohurd: {
    id: 'mohurd',
    name: '住房和城乡建设部文件库',
    authority: '中华人民共和国住房和城乡建设部',
    homepage: 'https://www.mohurd.gov.cn/gongkai/zc/wjk/index.html',
  },
  tianjin: {
    id: 'tianjin',
    name: '天津市住房和城乡建设委员会',
    authority: '天津市住房和城乡建设委员会',
    homepage: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/',
  },
  shanghai: {
    id: 'shanghai',
    name: '上海市住房和城乡建设管理委员会',
    authority: '上海市住房和城乡建设管理委员会',
    homepage: 'https://zjw.sh.gov.cn/xxbz/',
    reviewUrl: 'https://zjw.sh.gov.cn/jsgl/20250206/ba2dcb8bc35245ef9206424ec77368eb.html',
  },
  beijing: {
    id: 'beijing',
    name: '北京市住房和城乡建设委员会',
    authority: '北京市住房和城乡建设委员会',
    homepage: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/index.shtml',
  },
  guangdong: {
    id: 'guangdong',
    name: '广东省住房和城乡建设厅',
    authority: '广东省住房和城乡建设厅',
    homepage: 'https://zfcxjst.gd.gov.cn/',
  },
  jiangsu: {
    id: 'jiangsu',
    name: '全国标准信息公共服务平台（江苏地方标准）',
    authority: '国家市场监督管理总局 / 国家标准化管理委员会',
    homepage: 'https://dbba.sacinfo.org.cn/',
  },
  zhejiang: {
    id: 'zhejiang',
    name: '浙江省住房和城乡建设厅',
    authority: '浙江省住房和城乡建设厅',
    homepage: 'https://jst.zj.gov.cn/',
  },
  yunnan: {
    id: 'yunnan',
    name: '云南省住房和城乡建设厅',
    authority: '云南省住房和城乡建设厅',
    homepage: 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/',
  },
  yunnanSupplement: {
    id: 'yunnan-supplement',
    name: '云南省工程建设科技与标准定额管理网',
    authority: '云南省工程建设技术经济室（省住建厅科技与标准定额处指导）',
    homepage: 'https://www.ynbzde.com/web1/index',
  },
};

const ALLOWED_HOSTS = new Set([
  'std.samr.gov.cn',
  'www.mohurd.gov.cn',
  'zfcxjs.tj.gov.cn',
  'zjw.sh.gov.cn',
  'zjw.beijing.gov.cn',
  'scjgj.beijing.gov.cn',
  'ghzrzyw.beijing.gov.cn',
  'zfcxjst.gd.gov.cn',
  'dbba.sacinfo.org.cn',
  'jst.zj.gov.cn',
  'www.moj.gov.cn',
  'jsszfhcxjst.jiangsu.gov.cn',
  'www.gdsjskb.com',
  'zfcxjst.yn.gov.cn',
  'www.ynbzde.com',
]);

export async function runDiscovery({ province, keywords, asOf = new Date().toISOString().slice(0, 10) }) {
  const normalizedKeywords = normalizeKeywords(keywords);
  const tasks = [];

  if (province.includes('天津')) tasks.push(queryTianjin(normalizedKeywords, asOf));
  if (province.includes('上海')) tasks.push(queryShanghai(normalizedKeywords, asOf));
  if (province.includes('北京')) tasks.push(queryBeijing(normalizedKeywords, asOf));
  if (province.includes('广东')) tasks.push(queryGuangdong(normalizedKeywords, asOf));
  if (province.includes('江苏')) tasks.push(queryJiangsu(normalizedKeywords, asOf));
  if (province.includes('浙江')) tasks.push(queryZhejiang(normalizedKeywords, asOf));
  if (province.includes('云南')) tasks.push(queryYunnanVerified(normalizedKeywords, asOf));

  const settled = await Promise.allSettled(tasks);
  const records = [];
  const sourceRuns = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      records.push(...result.value.records);
      sourceRuns.push(result.value.run);
    } else {
      sourceRuns.push({
        sourceId: 'unknown', sourceName: '未识别来源', status: 'failed', count: 0,
        error: safeError(result.reason), retrievedAt: new Date().toISOString(),
      });
    }
  }
  const provinceSourceIds = new Set([
    province.includes('天津') ? 'tianjin' : null,
    province.includes('上海') ? 'shanghai' : null,
    province.includes('北京') ? 'beijing' : null,
    province.includes('广东') ? 'guangdong' : null,
    province.includes('江苏') ? 'jiangsu' : null,
    province.includes('浙江') ? 'zhejiang' : null,
    province.includes('云南') ? 'yunnan' : null,
  ].filter(Boolean));
  const deduped = dedupeRecords(records)
    .sort((a, b) => {
      const sourceOrder = Number(!provinceSourceIds.has(a.sourceId)) - Number(!provinceSourceIds.has(b.sourceId));
      return sourceOrder || String(b.publicationDate || '').localeCompare(String(a.publicationDate || ''));
    })
    .slice(0, 80);

  return {
    runId: `AUDIT-${Date.now()}`,
    retrievedAt: new Date().toISOString(),
    asOf,
    query: { province, keywords: normalizedKeywords },
    records: deduped,
    targetChecks: normalizedKeywords.map((queryTerm) => {
      const hits = deduped.filter((record) => String(record.queryTerm || '').split('；').includes(queryTerm));
      return {
        queryTerm,
        status: hits.length ? 'matched_candidates' : 'no_match',
        count: hits.length,
        note: hits.length ? '已命中权威源候选，仍需人工确认同名、版本与适用关系。' : '权威源未命中；不得据此判定废止。',
      };
    }),
    sourceRuns,
    decisionRule: '只有权威源明确给出“现行/废止”时才判定当前状态；发布公告仅证明曾发布或已到实施日，不能单独证明截至核查日仍现行；未命中不等于废止。',
  };
}

export async function querySamr(keywords, asOf) {
  const source = SOURCE_REGISTRY.samr;
  const retrievedAt = new Date().toISOString();
  const rows = [];
  const errors = [];

  for (const keyword of keywords.slice(0, 5)) {
    for (const searchTerm of buildSearchVariants(keyword)) {
      for (const tid of ['2', '3']) {
      const url = new URL('https://std.samr.gov.cn/gb/search/gbAdvancedSearchPage');
      url.searchParams.set('tid', tid);
      const looksLikeStandardNo = /^(?:GB|JGJ|CJJ|DBJ|DB\s*\d|DB\/T|NB|JG|CJ)\b/i.test(searchTerm);
      url.searchParams.set(looksLikeStandardNo ? 'std_p4' : 'std_p8', searchTerm.replace(/\s+(?=\d)/g, ''));
      url.searchParams.set('pageNumber', '1');
      url.searchParams.set('pageSize', '30');
      try {
        const response = await fetchOfficial(url.href, source.homepage);
        const payload = JSON.parse(response.body);
        for (const item of payload.rows || []) rows.push(mapSamrRecord(item, source, response, asOf, keyword));
      } catch (error) {
        errors.push(`${searchTerm}/${tid}: ${safeError(error)}`);
      }
      }
    }
  }

  const records = dedupeRecords(rows);
  return {
    records,
    run: {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.homepage,
      status: records.length ? 'ok' : errors.length ? 'failed' : 'no_match',
      count: records.length,
      error: errors.length ? errors.join('；') : null,
      retrievedAt,
    },
  };
}

export async function queryMohurd(keywords, asOf) {
  const source = SOURCE_REGISTRY.mohurd;
  const retrievedAt = new Date().toISOString();
  const listings = [];
  const errors = [];

  for (const keyword of keywords.slice(0, 5)) {
    for (const searchTerm of buildSearchVariants(keyword)) {
      try {
        const html = await fetchMohurdSearch(searchTerm);
        listings.push(...extractMohurdRows(html).map((item) => ({ ...item, keyword, searchTerm })));
      } catch (error) {
        errors.push(`${searchTerm}: ${safeError(error)}`);
      }
    }
  }

  const uniqueListings = mergeListingsByUrl(listings).slice(0, MAX_DETAIL_FETCHES);
  const records = [];
  await Promise.all(uniqueListings.map(async (item) => {
    try {
      const response = await fetchOfficial(item.url, source.homepage);
      records.push(...recordsFromNotice({ ...item, html: response.body, response, source, asOf, layer: 'national' }));
    } catch (error) {
      records.push(listingFallback(item, source, asOf, safeError(error)));
    }
  }));

  return {
    records: dedupeRecords(records),
    run: {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.homepage,
      status: records.length ? 'ok' : errors.length ? 'failed' : 'no_match',
      count: records.length,
      error: errors.length ? errors.join('；') : null,
      retrievedAt,
    },
  };
}

export async function queryTianjin(keywords, asOf) {
  return queryVerifiedEntries({ source: SOURCE_REGISTRY.tianjin, province: '天津市', keywords, asOf, entries: TIANJIN_VERIFIED });
}

const TIANJIN_VERIFIED = [
  {
    title: '天津市岩土工程技术规范', documentNo: 'DB/T29-20-2017', status: 'effective',
    publicationDate: '2017', implementationDate: '2017-07-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539221398593.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '01-天津市岩土工程技术规范（DB_T 29-20-2017）.pdf',
  },
  {
    title: '天津市岩土工程勘察规范', documentNo: 'DB/T29-247-2017', status: 'effective',
    publicationDate: '2017', implementationDate: '2017-07-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539255550825.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '02-天津市岩土工程勘察规范（DB_T 29-247-2017）.pdf',
  },
  {
    title: '天津市建筑基桩检测技术规程', documentNo: 'DB/T29-38-2025', status: 'effective',
    publicationDate: '2025', implementationDate: '2026-04-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202508/W020260130364172357440.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '03-天津市建筑基桩检测技术规程（DB_T 29-38-2025）.pdf',
  },
  {
    title: '天津市预防混凝土碱骨料反应技术规程', documentNo: 'DB/T29-176-2016', status: 'effective',
    publicationDate: '2016', implementationDate: '2016-10-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539165237657.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '04-天津市预防混凝土碱骨料反应技术规程.pdf',
  },
  {
    title: '天津市建筑工程消能减震隔震技术规程', documentNo: 'DB/T29-320-2025', status: 'effective',
    publicationDate: '2025', implementationDate: '2025-04-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202503/W020250331521348687587.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '31-天津市建筑工程消能减震隔震技术规程（DB_T 29-320-2025）.pdf',
  },
  {
    title: '天津市绿色建筑设计标准', documentNo: 'DB29-205-2024', status: 'effective',
    publicationDate: '2024', implementationDate: '2024-03-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202402/W020240315404849525830.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '11-天津市绿色建筑设计标准（DB 29-205-2024）.pdf',
  },
  {
    title: '天津市绿色建筑评价标准', documentNo: 'DB/T29-204-2026', status: 'effective',
    publicationDate: '2026', implementationDate: '2026-04-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202508/W020260306505365174301.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '12-天津市绿色建筑评价标准（DB_T 29-204-2026）.pdf',
  },
  {
    title: '天津市装配式建筑评价标准', documentNo: 'DB/T29-305-2024', status: 'effective',
    publicationDate: '2024', implementationDate: '2024-04-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202403/W020240321560546742004.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '13-天津市装配式建筑评价标准（DB_T 29-305-2024）.pdf',
  },
  {
    title: '天津市城市轨道交通结构安全保护技术规程', documentNo: 'DB/T29-279-2020', status: 'effective',
    publicationDate: '2020', implementationDate: '2020-12-01',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202102/W020210225526079993696.pdf',
    statusBasis: '天津住建委“现行标准规范”栏目列示。',
    localFileName: '21-天津市城市轨道交通结构安全保护技术规程（2020）.pdf',
  },
  {
    layer: 'local_regulation',
    title: '天津市轨道交通运营安全条例', documentNo: '天津市人大常委会公告第一一三号', status: 'effective',
    publicationDate: '2022-12-01', implementationDate: '2023-01-01',
    sourceUrl: 'https://www.moj.gov.cn/pub/sfbgw/fzgz/fzgzxzlf/fzgzbagz/202303/t20230313_474203.html',
    statusBasis: '天津市人大常委会公布并经司法部备案；当前效力仍需在天津法规库持续复核。',
    publisher: '天津市人民代表大会常务委员会', sourceName: '司法部法规规章备案信息',
    localFileName: '22-天津市轨道交通运营安全条例（2023）.pdf',
  },
  {
    layer: 'review_guidance',
    title: '天津市超限高层建筑工程设计要点（2016修订版）', documentNo: '津建设〔2016〕39号', status: 'unknown',
    publicationDate: '2016-01-28', implementationDate: '2016-01-28',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgfsj/',
    statusBasis: '天津住建委历史审查资料及2023年抗震专篇仍引用该要点；旧附件链接已迁移，尚未定位到独立现行/废止结论，状态保持待核实。',
    localFileName: '32-天津市超限工程设计要点（2016修订版）.pdf',
  },
  {
    layer: 'policy',
    title: '关于贯彻落实《建设工程抗震管理条例》工作方案', documentNo: '津住建设〔2022〕9号', status: 'effective',
    publicationDate: '2022-03-15', implementationDate: '2022-03-15',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/xxgk_70/zcwj/wfwj/202204/t20220408_5851631.html',
    statusBasis: '天津住建委政府信息公开页面标注“有效”。',
    localFileName: '33-关于贯彻落实《建设工程抗震管理条例》工作方案的通知（津住建设〔2022〕9号）.docx',
  },
  {
    layer: 'policy',
    title: '关于贯彻执行《中国地震动参数区划图》的通知', documentNo: '津建设〔2016〕256号', status: 'repealed',
    publicationDate: '2016', implementationDate: '2016', repealDate: '2022-12-19',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/sylm/gabsycs/tzgggh/202212/t20221229_6063704.html',
    statusBasis: '天津住建委2022年行政规范性文件清理公告第12项明确废止。',
    localFileName: '34-关于贯彻执行《中国地震动参数区划图》的通知（津建设〔2016〕256号）.docx',
  },
  {
    layer: 'review_guidance',
    title: '天津市民用建筑施工图设计审查要点（结构篇）', documentNo: '津18MS-G / DBJT29-183-2018', status: 'implemented_current_unverified',
    publicationDate: '2018', implementationDate: '2018-12-25',
    sourceUrl: 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgfsj/',
    statusBasis: '天津住建委“工程建设标准设计”历史栏目曾提供正式正文；旧附件链接已迁移，当前执行状态需继续复核。',
    localFileName: '41-天津市民用建筑施工图设计审查要点（结构篇）.pdf',
  },
];

const BEIJING_VERIFIED = [
  {
    title: '既有建筑抗震加固技术规程', documentNo: 'DB11/T 689-2025', status: 'effective',
    publicationDate: '2025-06-25', implementationDate: '2026-01-01', replacedBy: null,
    sourceUrl: 'https://scjgj.beijing.gov.cn/zwxx/gs/dfbzgg/202507/t20250707_4143412.html',
    statusBasis: '北京市市场监督管理局2025年标字第8号公告明确发布、实施日期及被修订标准DB11/689-2016。',
    publisher: '北京市市场监督管理局', sourceName: '北京市地方标准公告', sourceId: 'beijing-samr',
  },
  {
    title: '房屋结构综合安全性鉴定标准', documentNo: 'DB11/T 637-2024', status: 'effective',
    publicationDate: '2024-07-01', implementationDate: '2024-10-01',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743799392/index.shtml',
    statusBasis: '北京市住建委发布通知明确新版自2024-10-01实施，并明确旧版DB11/637-2015同日起废止。',
  },
  {
    title: '房屋结构综合安全性鉴定标准（旧版）', documentNo: 'DB11/637-2015', status: 'repealed',
    publicationDate: '2015-05-25', implementationDate: '2015-06-01', repealDate: '2024-10-01', replacedBy: 'DB11/T 637-2024',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743799392/index.shtml',
    statusBasis: '北京市住建委2024年发布通知明确该旧版自2024-10-01起废止。',
  },
  {
    title: '住宅设计规范', documentNo: 'DB11/1740-2020', status: 'effective',
    publicationDate: '2020-07-02', implementationDate: '2021-01-01',
    sourceUrl: 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=A9C23746BB0D4037E05397BE0A0AAD35',
    statusBasis: '全国标准信息公共服务平台标注为“现行”，并列出发布日期、实施日期。',
    publisher: '北京市市场监督管理局', sourceName: '全国标准信息公共服务平台', sourceId: 'samr-local',
  },
  {
    title: '地下室防水技术规程', documentNo: 'DB11/T 367-2021', status: 'effective',
    publicationDate: '2021-04-01', implementationDate: '2021-07-01', repealDate: '2026-12-31',
    sourceUrl: 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=BF83AA3C84EB27B9E05397BE0A0A964D',
    statusBasis: '全国标准信息公共服务平台截至核查日标注为“现行”，同时登记未来废止日期2026-12-31；不得提前显示为已废止。',
    publisher: '北京市市场监督管理局', sourceName: '全国标准信息公共服务平台', sourceId: 'samr-local',
  },
  {
    title: '北京地区建筑地基基础勘察设计规范（2016年版）', documentNo: 'DBJ11-501-2009', status: 'effective',
    publicationDate: '2009-05-11', implementationDate: '2009-08-01',
    sourceUrl: 'https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bz/kc/202002/t20200218_1655684.html',
    verificationUrl: 'https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bztg/202208/P020220812628559588278.pdf',
    statusBasis: '北京市规划自然资源委2022年地方标准复审结果列为“继续有效”。',
    publisher: '北京市规划和自然资源委员会', sourceName: '北京市规划自然资源标准管理', sourceId: 'beijing-planning',
  },
  {
    title: '建筑防火涂料（板）工程设计、施工与验收规程', documentNo: 'DB11/1245-2015', status: 'unknown',
    publicationDate: '2015-10-09', implementationDate: '2016-04-01',
    sourceUrl: 'https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bztg/202110/P020211012392065109420.pdf',
    statusBasis: '北京市规划自然资源委复审材料显示继续有效，但全国标准平台搜索列表与详情页状态冲突；保留为待人工确认。',
    publisher: '北京市规划和自然资源委员会', sourceName: '北京市规划自然资源标准复审', sourceId: 'beijing-planning',
  },
  {
    title: '房屋结构检测与鉴定操作规程', documentNo: 'DB11/T 849-2021', status: 'effective',
    publicationDate: '2021-03-29', implementationDate: '2021-07-01',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800523/index.shtml',
    statusBasis: '北京市住建委发布通知列明新版、实施日期和被修订标准DB11/T 849-2011。',
  },
  {
    title: '房屋鉴定与结构检测操作规程（旧版）', documentNo: 'DB11/T 849-2011', status: 'unknown',
    publicationDate: '2011-12-23', implementationDate: '2012-04-01', replacedBy: 'DB11/T 849-2021',
    sourceUrl: 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D531B2E24E05397BE0A0A3A10',
    statusBasis: '全国标准信息公共服务平台标注“有更新版”；尚未定位到明确废止日期，不自动判定为已废止。',
    publisher: '北京市市场监督管理局', sourceName: '全国标准信息公共服务平台', sourceId: 'samr-local',
  },
  {
    title: '建筑抗震鉴定与加固技术规程（历史版）', documentNo: 'DB11/T 689-2009', status: 'unknown',
    publicationDate: '2009', implementationDate: '2010', replacedBy: 'DB11/637-2015 + DB11/689-2016',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800868/index.shtml',
    statusBasis: '北京市住建委2015年通知明确DB11/637-2015代替该规程中的建筑抗震鉴定部分；加固部分后续版本链仍需定位完整废止文号。',
  },
  {
    title: '房屋建筑安全评估技术规程', documentNo: 'DB11/T 882-2023', status: 'effective',
    publicationDate: '2023-04-04', implementationDate: '2023-07-01',
    sourceUrl: 'https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=F9BFBEDAD7008FF7E05397BE0A0A9EAC',
    statusBasis: '全国标准信息公共服务平台标注新版现行，并明确全部代替DB11/T 882-2012。',
    publisher: '北京市市场监督管理局', sourceName: '全国标准信息公共服务平台', sourceId: 'samr-local',
  },
  {
    title: '房屋建筑安全评估技术规程（旧版）', documentNo: 'DB11/T 882-2012', status: 'superseded',
    publicationDate: '2012-05-10', implementationDate: '2012-09-01', repealDate: '2023-07-01', replacedBy: 'DB11/T 882-2023',
    sourceUrl: 'https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=F9BFBEDAD7008FF7E05397BE0A0A9EAC',
    statusBasis: '新版平台记录明确“全部代替DB11/T 882-2012”，以新版实施日作为被替代日期展示。',
    publisher: '北京市市场监督管理局', sourceName: '全国标准信息公共服务平台', sourceId: 'samr-local',
  },
  {
    title: '装配式建筑评价标准', documentNo: 'DB11/T 1831-2021', status: 'effective',
    publicationDate: '2021-04-01', implementationDate: '2021-07-01',
    sourceUrl: 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=BF83AA3C84ED27B9E05397BE0A0A964D',
    statusBasis: '全国标准信息公共服务平台标注为“现行”，并列出发布、实施日期。',
    publisher: '北京市市场监督管理局', sourceName: '全国标准信息公共服务平台', sourceId: 'samr-local',
  },
  {
    title: '建筑基坑支护技术规程', documentNo: 'DB11/T 489-2024', status: 'implemented_current_unverified',
    publicationDate: '2024-03-29', implementationDate: '2024-07-01',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml',
    statusBasis: '北京市住建委发布通知明确发布、实施日期及旧版同时废止。',
  },
  {
    title: '基坑工程内支撑技术规程', documentNo: 'DB11/T 940-2024', status: 'implemented_current_unverified',
    publicationDate: '2024-03-29', implementationDate: '2024-07-01',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml',
    statusBasis: '北京市住建委发布通知明确发布、实施日期及旧版同时废止。',
  },
  {
    title: '农村民居建筑抗震设计施工规程', documentNo: 'DB11/T 536-2021', status: 'implemented_current_unverified',
    publicationDate: '2021-12-23', implementationDate: '2022-04-01',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800544/index.shtml',
    statusBasis: '北京市住建委发布通知明确批准日期、实施日期及被修订版本。',
  },
  {
    title: '建筑基坑支护技术规程', documentNo: 'DB11/489-2016', status: 'repealed',
    publicationDate: '2016', implementationDate: '2016', repealDate: '2024-07-01', replacedBy: 'DB11/T 489-2024',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml',
    statusBasis: '北京市住建委2024年发布通知明确自2024-07-01起废止。',
  },
  {
    title: '基坑工程内支撑技术规程', documentNo: 'DB11/940-2012', status: 'repealed',
    publicationDate: '2012', implementationDate: '2012', repealDate: '2024-07-01', replacedBy: 'DB11/T 940-2024',
    sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml',
    statusBasis: '北京市住建委2024年发布通知明确自2024-07-01起废止。',
  },
];

const GUANGDONG_VERIFIED = [
  {
    title: '高层建筑混凝土结构技术规程', documentNo: 'DBJ/T 15-92-2021', status: 'implemented_current_unverified',
    publicationDate: '2021-02-05', implementationDate: '2021-06-01',
    sourceUrl: 'https://zfcxjst.gd.gov.cn/gkmlpt/content/3/3222/post_3222044.html',
    statusBasis: '广东省住建厅发布公告明确实施日期及旧版同时废止。',
  },
  {
    title: '建筑基坑工程技术规程', documentNo: 'DBJ/T15-20-2016', status: 'implemented_current_unverified',
    publicationDate: '2016-12-16', implementationDate: '2017-04-30',
    sourceUrl: 'https://www.gdsjskb.com/index/service/local_detail/id/7.html',
    archivedStatusUrl: 'https://zfcxjst.gd.gov.cn/gkmlpt/content/1/1454/mmpost_1454771.html',
    sourceId: 'guangdong-supplement', sourceName: '广东省建设科技与标准化协会',
    statusBasis: '省建设科技与标准化协会仍提供标准条目；原广东省住建厅发布公告URL已迁移，当前效力需继续回到主管部门复核。',
  },
  {
    title: '高层建筑混凝土结构技术规程', documentNo: 'DBJ 15-92-2013', status: 'repealed',
    publicationDate: '2013', implementationDate: '2013', repealDate: '2021-06-01', replacedBy: 'DBJ/T 15-92-2021',
    sourceUrl: 'https://zfcxjst.gd.gov.cn/gkmlpt/content/3/3222/post_3222044.html',
    statusBasis: '广东省住建厅发布公告明确原DBJ 15-92-2013自新版实施时同时废止。',
  },
];

const JIANGSU_VERIFIED = [
  {
    title: '建筑地基基础检测规程', documentNo: 'DB32/T 3916-2020', status: 'effective',
    publicationDate: '2020-12-21', implementationDate: '2021-05-01',
    sourceUrl: 'https://dbba.sacinfo.org.cn/stdDetail/25a113ec00f6a1fa086f2497cdb821c9aad347f7298bd80ea039402c3548c6c9',
    statusBasis: '全国标准信息公共服务平台标注为“现行”。',
  },
  {
    title: '住宅设计标准', documentNo: 'DB32/3920-2020', status: 'effective',
    publicationDate: '2020-12-30', implementationDate: '2021-07-01',
    sourceUrl: 'https://dbba.sacinfo.org.cn/stdDetail/edcffc0f090d0cf456c6d3149eaeb6ab2a973b01728d1d4711d7944692248731',
    statusBasis: '全国标准信息公共服务平台标注为“现行”。',
  },
  ...[
    ['江苏省城市地下管线探测技术规程', 'DGJ32/TJ186-2015'],
    ['江苏省城市地下管线数据标准', 'DGJ32/TJ187-2015'],
    ['南京地区建筑基坑工程监测技术规程', 'DGJ32/J189-2015'],
    ['建筑外窗工程检测与评定规程', 'DGJ32/TJ197-2015'],
    ['城市轨道交通接触网系统工程质量验收规范', 'DGJ32/TJ198-2015'],
    ['钢骨架集成模块建筑技术标准', 'DB32/T 3750-2020'],
  ].map(([title, documentNo]) => ({
    title, documentNo, status: 'repealed', publicationDate: documentNo.match(/\d{4}/)?.[0] || null,
    implementationDate: null, repealDate: '2025-07-21',
    sourceUrl: 'https://jsszfhcxjst.jiangsu.gov.cn/art/2025/7/21/art_49384_11604977.html',
    statusBasis: '江苏省住建厅〔2025〕第8号公告明确即日起废止。',
  })),
];

const ZHEJIANG_VERIFIED = [
  {
    title: '刚-柔性复合桩基技术规程', documentNo: 'DB33/1048-2010', status: 'effective',
    publicationDate: '2010-09-06', implementationDate: '2010-11-01',
    sourceUrl: 'https://jst.zj.gov.cn/',
    archivedStatusUrl: 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf',
    statusBasis: '浙江省住建厅工程建设标准复审结果标注“继续有效”；原附件URL已迁移，候选保留原始地址待人工复核。',
  },
  {
    title: '复合地基技术规程', documentNo: 'DB33/1051-2008', status: 'effective',
    publicationDate: '2008-07-09', implementationDate: '2008-08-01',
    sourceUrl: 'https://jst.zj.gov.cn/',
    archivedStatusUrl: 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf',
    statusBasis: '浙江省住建厅工程建设标准复审结果标注“继续有效”；原附件URL已迁移，候选保留原始地址待人工复核。',
  },
  {
    title: '建筑地基基础设计规范', documentNo: 'DB33/T1136-2017', status: 'implemented_current_unverified',
    publicationDate: '2017-02-24', implementationDate: '2017-10-01',
    sourceUrl: 'https://jst.zj.gov.cn/attach/-1/1904041240517888613.pdf',
    statusBasis: '浙江省住建厅公开标准正文载明发布、施行日期；现行状态仍待人工复核。',
  },
  {
    title: '建筑用砂混合轻量土配合比设计规程', documentNo: 'DB33/T1046-2008', status: 'repealed',
    publicationDate: '2008-05-16', implementationDate: '2008-07-01', repealDate: '复审废止',
    sourceUrl: 'https://jst.zj.gov.cn/',
    archivedStatusUrl: 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf',
    statusBasis: '浙江省住建厅工程建设标准复审结果列为“废止”；原附件URL已迁移。',
  },
  {
    title: '固定式塔式起重机基础技术规程', documentNo: 'DB33/T1053-2008', status: 'repealed',
    publicationDate: '2008-08-14', implementationDate: '2008-09-01', repealDate: '复审废止',
    sourceUrl: 'https://jst.zj.gov.cn/',
    archivedStatusUrl: 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf',
    statusBasis: '浙江省住建厅工程建设标准复审结果列为“废止”；原附件URL已迁移。',
  },
];

const YUNNAN_VERIFIED = [
  {
    title: '建筑基坑工程监测技术规程', documentNo: 'DBJ53/T-67-2014', status: 'effective',
    publicationDate: '2014', implementationDate: '已执行',
    sourceUrl: 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html',
    statusBasis: '列于云南省住建厅2026年岩土工程与地基基础板块现行标准目录。',
  },
  {
    title: '云南省建筑基坑支护技术规程', documentNo: 'DBJ53/T-71-2015', status: 'effective',
    publicationDate: '2015', implementationDate: '已执行',
    sourceUrl: 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html',
    statusBasis: '列于云南省住建厅2026年岩土工程与地基基础板块现行标准目录。',
  },
  {
    title: '云南省膨胀土地区建筑技术规程', documentNo: 'DBJ 53/T-83-2017', status: 'effective',
    publicationDate: '2017-08-25', implementationDate: '2018-01-01',
    sourceUrl: 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html',
    archivedStatusUrl: 'https://zfcxjst.yn.gov.cn/kejiyubiaozhundinge8678/116765.html',
    statusBasis: '列于云南省住建厅2026年现行标准目录；历史发布通知明确新版实施及原1988版同时废止。',
  },
  {
    title: '云南省膨胀土地区建筑技术规程（原版）', documentNo: '云建科〔1988〕524号', status: 'repealed',
    publicationDate: '1988', implementationDate: '1988', repealDate: '2018-01-01', replacedBy: 'DBJ 53/T-83-2017',
    sourceUrl: 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html',
    archivedStatusUrl: 'https://zfcxjst.yn.gov.cn/kejiyubiaozhundinge8678/116765.html',
    statusBasis: '云南省住建厅历史发布通知明确原标准自新版实施时同时废止；旧发布页已迁移，保留原始地址待人工复核。',
  },
];

export async function queryBeijing(keywords, asOf) {
  return queryVerifiedEntries({ source: SOURCE_REGISTRY.beijing, province: '北京市', keywords, asOf, entries: BEIJING_VERIFIED });
}

export async function queryGuangdong(keywords, asOf) {
  return queryVerifiedEntries({ source: SOURCE_REGISTRY.guangdong, province: '广东省', keywords, asOf, entries: GUANGDONG_VERIFIED });
}

export async function queryJiangsu(keywords, asOf) {
  return queryVerifiedEntries({ source: SOURCE_REGISTRY.jiangsu, province: '江苏省', keywords, asOf, entries: JIANGSU_VERIFIED });
}

export async function queryZhejiang(keywords, asOf) {
  return queryVerifiedEntries({ source: SOURCE_REGISTRY.zhejiang, province: '浙江省', keywords, asOf, entries: ZHEJIANG_VERIFIED });
}

export async function queryYunnanVerified(keywords, asOf) {
  return queryVerifiedEntries({ source: SOURCE_REGISTRY.yunnan, province: '云南省', keywords, asOf, entries: YUNNAN_VERIFIED });
}

async function queryVerifiedEntries({ source, province, keywords, asOf, entries }) {
  const retrievedAt = new Date().toISOString();
  const selected = entries;
  const records = [];
  const errors = [];
  const cache = new Map();

  for (const entry of selected) {
    try {
      const verificationUrl = entry.verificationUrl || entry.sourceUrl;
      if (!cache.has(verificationUrl)) cache.set(verificationUrl, await fetchOfficial(verificationUrl, source.homepage));
      const response = cache.get(verificationUrl);
      const queryTerm = keywords.filter((keyword) => textMatchesQuery(`${entry.title} ${entry.documentNo}`, keyword)).join('；');
      records.push(finalizeRecord({
        layer: 'local',
        ...entry,
        province,
        publisher: entry.publisher || source.authority,
        sourceId: entry.sourceId || source.id,
        sourceName: entry.sourceName || source.name,
        sourceHomepage: source.homepage,
        retrievedAt: response.retrievedAt,
        fingerprint: response.sha256,
        evidenceExcerpt: entry.statusBasis,
        queryTerm,
        recordStatus: 'online_verified_candidate',
      }, asOf));
    } catch (error) {
      errors.push(`${entry.documentNo}: ${safeError(error)}`);
    }
  }

  return {
    records,
    run: {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.homepage,
      status: records.length ? 'ok' : errors.length ? 'failed' : 'no_match',
      count: records.length,
      error: errors.length ? errors.join('；') : null,
      retrievedAt,
    },
  };
}

const SHANGHAI_STATUS_EVIDENCE = {
  'dg/tj08-9-2023': {
    secondarySourceUrl: 'https://zjw.sh.gov.cn/jsgl/20230328/cfba3332dba34d0c9b8723004d8470b9.html',
    secondarySourceLabel: '打开发布与旧版废止通知',
    note: '沪建标定〔2023〕17号明确该标准自2023-06-01实施，并同时废止DGJ08-9-2013。',
  },
  'dgj08-9-2013': {
    status: 'repealed',
    repealDate: '2023-06-01',
    replacedBy: 'DG/TJ08-9-2023',
    secondarySourceUrl: 'https://zjw.sh.gov.cn/jsgl/20230328/cfba3332dba34d0c9b8723004d8470b9.html',
    secondarySourceLabel: '打开明确废止证据',
    note: '沪建标定〔2023〕17号明确原DGJ08-9-2013同时废止。',
    conflictNote: '上海住建委“现行标准”页面的数据仍含该旧版记录；以明确废止通知为准。',
  },
  'dgj08-11-2018': {
    secondarySourceUrl: 'https://zjw.sh.gov.cn/jsgl/20190225/0011-57967.html',
    secondarySourceLabel: '打开发布与旧版废止通知',
    note: '沪建标定〔2019〕69号明确该标准自2019-08-01实施，并同时废止DGJ08-11-2010。',
  },
  'dgj08-11-2010': {
    status: 'repealed',
    repealDate: '2019-08-01',
    replacedBy: 'DGJ08-11-2018',
    secondarySourceUrl: 'https://zjw.sh.gov.cn/jsgl/20190225/0011-57967.html',
    secondarySourceLabel: '打开明确废止证据',
    note: '沪建标定〔2019〕69号明确原DGJ08-11-2010同时废止。',
  },
  'dg/tj08-2326-2020': {
    secondarySourceUrl: 'https://zjw.sh.gov.cn/jsgl/20250206/ba2dcb8bc35245ef9206424ec77368eb.html',
    secondarySourceLabel: '打开2024年度复审结果',
    note: '2024年度复审附件将该标准列为“继续有效”。',
  },
  'dg/tj08-2001-2016': {
    secondarySourceUrl: 'https://zjw.sh.gov.cn/jsgl/20250206/ba2dcb8bc35245ef9206424ec77368eb.html',
    secondarySourceLabel: '打开2024年度复审结果',
    note: '2024年度复审附件将该标准列为“应予修订”；修订期间的执行状态仍需人工确认。',
  },
};

const SHANGHAI_HISTORICAL = [
  {
    title: '建筑抗震设计规程（旧版）', documentNo: 'DGJ08-9-2013', status: 'repealed',
    publicationDate: '2013', implementationDate: '2013', repealDate: '2023-06-01', replacedBy: 'DG/TJ08-9-2023',
    sourceUrl: 'https://zjw.sh.gov.cn/jsgl/20230328/cfba3332dba34d0c9b8723004d8470b9.html',
    statusBasis: '上海住建委沪建标定〔2023〕17号明确原DGJ08-9-2013同时废止。',
  },
  {
    title: '地基基础设计规范（旧版）', documentNo: 'DGJ08-11-2010', status: 'repealed',
    publicationDate: '2010', implementationDate: '2010', repealDate: '2019-08-01', replacedBy: 'DGJ08-11-2018',
    sourceUrl: 'https://zjw.sh.gov.cn/jsgl/20190225/0011-57967.html',
    statusBasis: '上海住建委沪建标定〔2019〕69号明确原DGJ08-11-2010同时废止。',
  },
];

export async function queryShanghai(keywords, asOf) {
  const source = SOURCE_REGISTRY.shanghai;
  const retrievedAt = new Date().toISOString();
  try {
    const response = await fetchOfficial(source.homepage, source.homepage);
    const rows = extractShanghaiCatalog(response.body, source.homepage)
      .filter((item) => matchesKeywords(`${item.title} ${item.documentNo}`, keywords));
    const records = rows.map((item) => {
      const evidence = SHANGHAI_STATUS_EVIDENCE[item.documentNo.toLowerCase()] || {};
      const status = evidence.status || 'effective';
      const queryTerm = keywords.filter((keyword) => textMatchesQuery(`${item.title} ${item.documentNo}`, keyword)).join('；');
      return finalizeRecord({
        layer: 'local',
        title: item.title,
        documentNo: item.documentNo,
        status,
        publicationDate: item.approvalDate,
        implementationDate: item.implementationDate,
        repealDate: evidence.repealDate || null,
        replacedBy: evidence.replacedBy || null,
        publisher: source.authority,
        province: '上海市',
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: item.documentUrl || source.homepage,
        sourceHomepage: source.homepage,
        retrievedAt: response.retrievedAt,
        fingerprint: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
        statusBasis: evidence.note
          ? `上海住建委目录记录；${evidence.note}`
          : '列于上海市住房和城乡建设管理委员会“现行标准”目录；仍需人工确认是否存在目录未及时清退的旧记录。',
        evidenceExcerpt: `${item.type}；${item.documentNo}《${item.title}》；批准日期=${item.approvalDate || '未返回'}；实施日期=${item.implementationDate || '未返回'}；备案号=${item.filingNo || '未返回'}`,
        queryTerm,
        recordStatus: 'authority_current_catalog',
        secondarySourceUrl: evidence.secondarySourceUrl || null,
        secondarySourceLabel: evidence.secondarySourceLabel || null,
        conflictNote: evidence.conflictNote || null,
      }, asOf);
    });
    const historical = await queryVerifiedEntries({
      source,
      province: '上海市',
      keywords,
      asOf,
      entries: SHANGHAI_HISTORICAL,
    });
    const mergedRecords = dedupeRecords([...records, ...historical.records]);
    return {
      records: mergedRecords,
      run: {
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.homepage,
        status: records.length ? 'ok' : 'no_match',
        count: mergedRecords.length,
        error: historical.run.error,
        retrievedAt,
      },
    };
  } catch (error) {
    return {
      records: [],
      run: {
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.homepage,
        status: 'failed',
        count: 0,
        error: safeError(error),
        retrievedAt,
      },
    };
  }
}

export function extractShanghaiCatalog(html, baseUrl) {
  const rows = [];
  const pattern = /\{\s*"mc"\s*:\s*"[^"]*"\s*,\s*"url"\s*:\s*"[^"]*"\s*,\s*"bh"\s*:\s*"[^"]*"\s*,\s*"pz"\s*:\s*"[^"]*"\s*,\s*"ss"\s*:\s*"[^"]*"\s*,\s*"lx"\s*:\s*"[^"]*"\s*,\s*"wjh"\s*:\s*"[^"]*"\s*,\s*"bah"\s*:\s*"[^"]*"\s*\}/g;
  for (const match of String(html || '').matchAll(pattern)) {
    try {
      const item = JSON.parse(match[0]);
      rows.push({
        title: decodeEntities(item.mc).trim(),
        documentNo: String(item.bh || '').trim(),
        approvalDate: normalizeLooseDate(item.pz),
        implementationDate: normalizeLooseDate(item.ss),
        type: String(item.lx || '类型未返回').trim(),
        filingNo: String(item.bah || '').trim() || null,
        documentUrl: item.url ? new URL(item.url, baseUrl).href : null,
      });
    } catch {
      // Ignore a malformed embedded item and retain the rest of the official catalog.
    }
  }
  return rows;
}

export async function queryYunnan(keywords, asOf) {
  return queryProvincialListings({
    source: SOURCE_REGISTRY.yunnan,
    province: '云南省',
    asOf,
    keywords,
    layer: 'local',
    pages: [
      { url: 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/index.html', catalogStatus: 'official_standard_catalog' },
      { url: 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/index_1.html', catalogStatus: 'official_standard_catalog' },
    ],
  });
}

export async function queryYunnanSupplement(keywords, asOf) {
  return queryProvincialListings({
    source: SOURCE_REGISTRY.yunnanSupplement,
    province: '云南省',
    asOf,
    keywords,
    layer: 'supplementary',
    pages: [{ url: SOURCE_REGISTRY.yunnanSupplement.homepage, catalogStatus: 'supplementary_catalog' }],
  });
}

async function queryProvincialListings({ source, province, pages, keywords, asOf, layer }) {
  const retrievedAt = new Date().toISOString();
  const listings = [];
  const errors = [];
  for (const page of pages) {
    try {
      const response = await fetchOfficial(page.url, source.homepage);
      const extracted = extractAnchors(response.body, page.url)
        .filter((item) => isStandardRelated(item.title))
        .filter((item) => matchesKeywords(item.title, keywords))
        .map((item) => ({
          ...item,
          queryTerm: keywords.filter((keyword) => textMatchesQuery(item.title, keyword)).join('；'),
          catalogStatus: page.catalogStatus,
          listingFingerprint: response.sha256,
        }));
      listings.push(...extracted);
    } catch (error) {
      errors.push(`${page.url}: ${safeError(error)}`);
    }
  }

  const uniqueListings = dedupeBy(listings, (item) => item.url).slice(0, MAX_DETAIL_FETCHES);
  const records = [];
  await Promise.all(uniqueListings.map(async (item) => {
    if (/\.pdf(?:$|\?)/i.test(item.url)) {
      records.push(listingFallback(item, source, asOf, null, province, layer));
      return;
    }
    try {
      const response = await fetchOfficial(item.url, source.homepage);
      const noticeRecords = recordsFromNotice({ ...item, html: response.body, response, source, asOf, layer, province });
      records.push(...noticeRecords);
    } catch (error) {
      records.push(listingFallback(item, source, asOf, safeError(error), province, layer));
    }
  }));

  return {
    records: dedupeRecords(records),
    run: {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.homepage,
      status: records.length ? 'ok' : errors.length ? 'failed' : 'no_match',
      count: records.length,
      error: errors.length ? errors.join('；') : null,
      retrievedAt,
    },
  };
}

async function fetchOfficial(url, referer) {
  const parsed = new URL(url);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`域名不在白名单：${parsed.hostname}`);
  const response = await fetch(parsed, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', Referer: referer },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const body = new TextDecoder('utf-8').decode(bytes);
  return {
    url: response.url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    retrievedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    body,
  };
}

async function fetchMohurdSearch(keyword) {
  const source = SOURCE_REGISTRY.mohurd;
  const search = JSON.stringify({ title_text: keyword, searchKeywordRange: 'createDateDesc' });
  const paramJson = JSON.stringify({ pageNo: 1, pageSize: 30, search });
  const url = new URL('https://www.mohurd.gov.cn/api-gateway/jpaas-publish-server/front/page/build/unit');
  const params = {
    parseType: 'bulidstatic',
    webId: '86ca573ec4df405db627fdc2493677f3',
    tplSetId: 'fc259c381af3496d85e61997ea7771cb',
    pageType: 'column',
    tagId: '内容1',
    editType: 'null',
    pageId: 'vhiC3JxmPC8o7Lqg4Jw0E',
    paramJson,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchOfficial(url.href, source.homepage);
  const payload = JSON.parse(response.body);
  if (!payload.success || !payload.data?.html) throw new Error(payload.message || '住建部检索接口未返回HTML');
  return payload.data.html;
}

function mapSamrRecord(item, source, response, asOf, queryTerm) {
  const state = mapAuthorityState(item.STATE2 || item.STATE || item.G_STATE);
  const table = item.TABLE_NAME || '';
  const detailPath = table.includes('HB') ? '/hb/search/stdHBDetailed' : table.includes('DB') ? '/db/search/stdDBDetailed' : '/gb/search/gbDetailed';
  const sourceUrl = `https://std.samr.gov.cn${detailPath}?id=${encodeURIComponent(item.id)}`;
  return finalizeRecord({
    layer: table.includes('HB') ? 'industry' : table.includes('DB') ? 'local' : 'national',
    title: item.C_NAME || item.C_C_NAME || '名称未返回',
    documentNo: item.C_STD_CODE || item.STD_CODE || item.C_STD_CODE2 || '编号未返回',
    status: state,
    publicationDate: item.ISSUE_DATE || null,
    implementationDate: item.ACT_DATE || null,
    repealDate: item.ANNUL_DATE || null,
    replacedBy: item.REPLACE_STD || item.ALL_REPLACE_STD || null,
    publisher: item.CD_NAME || item.TA_NAME || source.authority,
    province: item.G_PROVINCE || null,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl,
    sourceHomepage: source.homepage,
    retrievedAt: response.retrievedAt,
    fingerprint: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
    statusBasis: `全国标准平台返回状态：${item.STATE2 || item.STATE || item.G_STATE || '未返回'}`,
    evidenceExcerpt: `${item.C_STD_CODE || item.STD_CODE || ''} ${item.C_NAME || item.C_C_NAME || ''}；状态=${item.STATE2 || item.STATE || item.G_STATE || '未返回'}；发布日期=${item.ISSUE_DATE || '未返回'}；实施日期=${item.ACT_DATE || '未返回'}`,
    queryTerm,
    recordStatus: 'authority_result',
  }, asOf);
}

function extractMohurdRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const link = rowHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]+title=["']([^"']+)["'][^>]*>/i);
    if (!link) continue;
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => htmlToText(cell[1]));
    rows.push({
      title: decodeEntities(link[2]),
      url: new URL(link[1], SOURCE_REGISTRY.mohurd.homepage).href,
      documentNo: cells[2] || null,
      publicationDate: normalizeDate(cells.at(-1)) || null,
      catalogStatus: 'announcement',
    });
  }
  return rows;
}

export function extractAnchors(html, baseUrl) {
  const output = [];
  for (const match of html.matchAll(/<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1];
    const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) continue;
    const explicitTitle = attrs.match(/title\s*=\s*["']([^"']+)["']/i)?.[1];
    const text = htmlToText(match[2]);
    const title = decodeEntities(explicitTitle || text).trim();
    if (!title || title.length < 4) continue;
    const following = html.slice(match.index + match[0].length, match.index + match[0].length + 260);
    const date = normalizeDate(htmlToText(following));
    let url;
    try { url = new URL(decodeEntities(href), baseUrl).href; } catch { continue; }
    output.push({ title, url, publicationDate: date });
  }
  return output;
}

export function recordsFromNotice({ title, url, publicationDate, catalogStatus, html, response, source, asOf, layer, province = null, keyword = null, queryTerm = null }) {
  const text = htmlToText(html);
  if (/现行标准目录/.test(title)) {
    const catalogRecords = recordsFromCurrentCatalog({
      title, url, publicationDate, text, response, source, asOf, layer, province, queryTerm: queryTerm || keyword,
    });
    if (catalogRecords.length) return catalogRecords;
  }
  const quotedTitles = [...text.matchAll(/《([^》]{2,100})》/g)].map((match) => match[1].trim());
  const modifiedTitle = text.match(/标准名称修改为\s*《([^》]{2,100})》/)?.[1]?.trim();
  const modifiedDocumentNo = text.match(/标准编号修改为\s*[（(]?\s*((?:GB(?:\/T)?|JGJ(?:\/T)?|CJJ(?:\/T)?|DBJ|DB\/T|DB)\s*[\dA-Z./-]{2,30})/i)?.[1]?.trim();
  const primaryTitle = modifiedTitle || quotedTitles.find((item) => !/征求意见|通知|公告/.test(item)) || cleanNoticeTitle(title);
  const documentNo = modifiedDocumentNo || extractDeclaredStandardNo(text) || extractStandardNo(title) || extractStandardNo(text) || '编号未核到';
  const implementationDate = extractChineseDate(text, /自\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*起(?:实施|施行)/);
  const issueDate = publicationDate || extractChineseDate(text, /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  let status = 'unknown';
  let statusBasis = '页面未提供足够信息，需人工核验';

  if (/征求意见稿|公开征求意见|立项公示|报批稿公示/.test(`${title} ${text.slice(0, 1200)}`)) {
    status = 'draft';
    statusBasis = '官方页面明确标注征求意见或公示，不能作为已发布执行标准';
  } else if (/废止|停止执行/.test(title)) {
    status = 'repealed';
    statusBasis = '官方公告标题明确包含废止或停止执行';
  } else if (catalogStatus === 'official_current_catalog') {
    status = 'effective';
    statusBasis = '该文件列于主管部门“现行标准规范”栏目';
  } else if (implementationDate) {
    status = implementationDate <= asOf ? 'implemented_current_unverified' : 'not_yet_effective';
    statusBasis = implementationDate <= asOf
      ? `官方发布页面证明自 ${implementationDate} 起实施，但该历史公告不能单独证明截至 ${asOf} 仍现行`
      : `官方发布页面明确：自 ${implementationDate} 起实施`;
  } else if (/批准为.*(?:标准|规程|规范|导则)|现予发布|关于发布/.test(text.slice(0, 3500))) {
    status = 'published_pending_date';
    statusBasis = '官方页面明确发布，但未稳定提取到实施日期';
  }

  const records = [finalizeRecord({
    layer,
    title: primaryTitle,
    documentNo,
    status,
    publicationDate: issueDate,
    implementationDate,
    repealDate: status === 'repealed' ? issueDate : null,
    publisher: source.authority,
    province,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: url,
    sourceHomepage: source.homepage,
    retrievedAt: response.retrievedAt,
    fingerprint: response.sha256,
    statusBasis,
    evidenceExcerpt: evidenceSnippet(text),
    queryTerm: queryTerm || keyword,
    recordStatus: 'online_verified_candidate',
  }, asOf)];

  const replacedPattern = /原《([^》]+)》\s*[（(]?\s*((?:GB(?:\/T)?|JGJ(?:\/T)?|CJJ(?:\/T)?|DBJ|DB\/T|DB)\s*[\dA-Z./-]{2,30})\s*[）)]?\s*(?:同时)?废止/gi;
  for (const match of text.matchAll(replacedPattern)) {
    records.push(finalizeRecord({
      layer,
      title: match[1].trim(),
      documentNo: match[2].trim(),
      status: 'repealed',
      publicationDate: null,
      implementationDate: null,
      repealDate: implementationDate || issueDate,
      replacedBy: documentNo !== '编号未核到' ? documentNo : primaryTitle,
      publisher: source.authority,
      province,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: url,
      sourceHomepage: source.homepage,
      retrievedAt: response.retrievedAt,
      fingerprint: response.sha256,
      statusBasis: `官方发布页面明确“原《${match[1].trim()}》同时废止”`,
      evidenceExcerpt: evidenceSnippet(text, '废止'),
      queryTerm: queryTerm || keyword,
      recordStatus: 'online_verified_candidate',
    }, asOf));
  }
  return records;
}

function recordsFromCurrentCatalog({ title, url, publicationDate, text, response, source, asOf, layer, province, queryTerm }) {
  const records = [];
  const seen = new Set();
  const pattern = /\d{1,2}[.、]\s*([^（）()]{2,100}?)[（(]\s*((?:DBJ|DB)\s*[\dA-Z/T .-]{3,35})\s*[）)]/gi;
  for (const match of text.matchAll(pattern)) {
    const standardTitle = match[1].replace(/^.*?现行标准目录\s*/i, '').trim();
    const documentNo = match[2].replace(/\s+/g, '');
    const key = `${normalizeKey(standardTitle)}|${normalizeKey(documentNo)}`;
    if (!standardTitle || seen.has(key)) continue;
    seen.add(key);
    records.push(finalizeRecord({
      layer,
      title: standardTitle,
      documentNo,
      status: 'effective',
      publicationDate: publicationDate || null,
      implementationDate: null,
      repealDate: null,
      publisher: source.authority,
      province,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: url,
      sourceHomepage: source.homepage,
      retrievedAt: response.retrievedAt,
      fingerprint: response.sha256,
      statusBasis: `列于主管部门发布的“${title}”`,
      evidenceExcerpt: `${standardTitle}（${documentNo}）列于${title}`,
      queryTerm,
      recordStatus: 'authority_current_catalog',
    }, asOf));
  }
  return records;
}

function listingFallback(item, source, asOf, error = null, province = null, layer = 'local') {
  let status = 'unknown';
  let statusBasis = error ? `详情页读取失败：${error}` : '仅命中官方目录，尚未提取实施/废止依据';
  if (item.catalogStatus === 'official_current_catalog') {
    status = 'effective';
    statusBasis = '该文件列于主管部门“现行标准规范”栏目';
  }
  return finalizeRecord({
    layer,
    title: item.title,
    documentNo: extractStandardNo(item.title) || '编号未核到',
    status,
    publicationDate: item.publicationDate || null,
    implementationDate: null,
    repealDate: null,
    publisher: source.authority,
    province,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: item.url,
    sourceHomepage: source.homepage,
    retrievedAt: new Date().toISOString(),
    fingerprint: item.listingFingerprint || createHash('sha256').update(`${item.title}|${item.url}`).digest('hex'),
    statusBasis,
    evidenceExcerpt: item.title,
    queryTerm: item.queryTerm || item.keyword || null,
    recordStatus: 'online_verified_candidate',
  }, asOf);
}

function finalizeRecord(record, asOf) {
  return {
    id: createHash('sha256').update(`${record.sourceId}|${record.documentNo}|${record.title}|${record.sourceUrl}`).digest('hex').slice(0, 20),
    ...record,
    asOf,
    requiresHumanReview: true,
  };
}

function mapAuthorityState(value) {
  if (value === '现行') return 'effective';
  if (value === '即将实施') return 'not_yet_effective';
  if (value === '废止') return 'repealed';
  return 'unknown';
}

function normalizeKeywords(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n|[,，;；]+/);
  const cleaned = source
    .map((item) => String(item).replace(/^\s*(?:[-*•]|\d+[.、])\s*/, '').trim())
    .filter((item) => item.length >= 2);
  return [...new Set(cleaned)].slice(0, 8).length ? [...new Set(cleaned)].slice(0, 8) : ['建筑结构', '抗震', '地基基础'];
}

function matchesKeywords(title, keywords) {
  return keywords.some((keyword) => textMatchesQuery(title, keyword));
}

function textMatchesQuery(text, query) {
  const rawText = String(text || '');
  const rawQuery = String(query || '');
  return rawText.includes(rawQuery) || normalizeKey(rawText).includes(normalizeKey(rawQuery));
}

function buildSearchVariants(keyword) {
  const value = String(keyword || '').trim();
  const compact = value.replace(/\s+/g, '');
  if (!/^(?:GB|JGJ|CJJ|DBJ|DB\d*\/T|DB\/T|NB|JG|CJ)/i.test(compact)) return [value];
  const withoutYear = compact.replace(/[-—–]\d{4}(?:\/XG\d+)?$/i, '');
  return [...new Set([compact, withoutYear])].filter(Boolean);
}

function isStandardRelated(title) {
  return /标准|规范|规程|导则|图集|技术要点|废止|发布/.test(title)
    && !/价格指数|招标|资质|招聘|会议|培训/.test(title);
}

function extractStandardNo(text) {
  const normalized = String(text || '').replace(/[－—–]/g, '-').replace(/／/g, '/');
  return normalized.match(/(?:GB(?:\/T)?|JGJ(?:\/T)?|CJJ(?:\/T)?|DBJ|DB\/T|DB\s*\d+\/T|DB)\s*[\dA-Z./-]{2,30}(?:-\d{4})?/i)?.[0]?.replace(/\s+/g, ' ').trim() || null;
}

function extractDeclaredStandardNo(text) {
  const normalized = String(text || '').replace(/[－—–]/g, '-').replace(/／/g, '/');
  const match = normalized.match(/(?:标准)?编号\s*(?:为|：|:)\s*[（(]?\s*((?:GB(?:\/T)?|JGJ(?:\/T)?|CJJ(?:\/T)?|DBJ|DB\/T|DB\s*\d+\/T|DB)\s*[\dA-Z./-]{2,30}(?:-\d{4})?)/i);
  return match?.[1]?.replace(/\s+/g, ' ').trim() || null;
}

function cleanNoticeTitle(title) {
  return String(title || '')
    .replace(/^.*?关于(?:发布|印发|批准发布|废止)/, '')
    .replace(/的(?:通知|公告|函).*$/, '')
    .replace(/[《》]/g, '')
    .trim() || String(title || '').trim();
}

function extractChineseDate(text, regex) {
  const match = String(text || '').match(regex);
  if (!match) return null;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function normalizeDate(text) {
  const match = String(text || '').match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : null;
}

function normalizeLooseDate(text) {
  const match = String(text || '').match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : null;
}

function evidenceSnippet(text, preferred = '实施') {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  const index = compact.indexOf(preferred);
  const start = index >= 0 ? Math.max(0, index - 120) : 0;
  return compact.slice(start, start + 360);
}

function htmlToText(value) {
  return decodeEntities(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')).trim();
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function dedupeRecords(records) {
  const merged = new Map();
  for (const item of records) {
    const key = `${normalizeKey(item.documentNo)}|${normalizeKey(item.title)}|${item.status}|${item.sourceId}`;
    if (!merged.has(key)) {
      merged.set(key, item);
      continue;
    }
    const existing = merged.get(key);
    const queryTerms = [...new Set(`${existing.queryTerm || ''}；${item.queryTerm || ''}`.split('；').filter(Boolean))];
    existing.queryTerm = queryTerms.join('；') || null;
  }
  return [...merged.values()];
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeListingsByUrl(items) {
  const merged = new Map();
  for (const item of items) {
    if (!merged.has(item.url)) {
      merged.set(item.url, { ...item, queryTerm: item.queryTerm || item.keyword || null });
      continue;
    }
    const existing = merged.get(item.url);
    const queryTerms = [...new Set(`${existing.queryTerm || ''}；${item.queryTerm || item.keyword || ''}`.split('；').filter(Boolean))];
    existing.queryTerm = queryTerms.join('；') || null;
  }
  return [...merged.values()];
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

function safeError(error) {
  return String(error?.message || error || '未知错误').slice(0, 300);
}

export const __test = {
  extractMohurdRows,
  extractDeclaredStandardNo,
  extractStandardNo,
  htmlToText,
  buildSearchVariants,
  normalizeKeywords,
  normalizeDate,
  extractShanghaiCatalog,
  verifiedCatalogs: {
    tianjin: TIANJIN_VERIFIED,
    shanghaiHistorical: SHANGHAI_HISTORICAL,
    beijing: BEIJING_VERIFIED,
    guangdong: GUANGDONG_VERIFIED,
    jiangsu: JIANGSU_VERIFIED,
    zhejiang: ZHEJIANG_VERIFIED,
    yunnan: YUNNAN_VERIFIED,
  },
};
