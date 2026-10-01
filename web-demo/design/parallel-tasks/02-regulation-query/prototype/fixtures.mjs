export const AS_OF_DATE = '2026-09-25';

function provincePlace(code, province, shortName, aliases = []) {
  return {
    placeId: `PLACE-${code}`,
    province,
    placeType: 'province_level_admin',
    displayPath: province,
    reviewStatus: 'approved_formal',
    sourceId: `SRC-PLACE-${code}`,
    locator: `重点省份/${province}`,
    aliases: [
      { name: province, kind: 'official_name' },
      { name: shortName, kind: 'official_name' },
      ...aliases.map((name) => ({ name, kind: 'official_name' })),
    ],
  };
}

export const places = [
  provincePlace('TJ', '天津市', '天津', ['天津滨海新区', '滨海新区']),
  provincePlace('SH', '上海市', '上海'),
  provincePlace('BJ', '北京市', '北京'),
  provincePlace('GD', '广东省', '广东', ['广州市', '深圳市']),
  provincePlace('JS', '江苏省', '江苏', ['南京市', '苏州市']),
  provincePlace('ZJ', '浙江省', '浙江', ['杭州市', '宁波市']),
  provincePlace('YN', '云南省', '云南', ['昆明市', '云南省昆明市']),
];

export const scenarios = {
  tianjin: {
    province: '天津市',
    query: '天津市',
    keywords: '岩土工程技术规范\n岩土工程勘察规范\n建筑基桩检测技术规程\n建筑工程消能减震隔震技术规程\n绿色建筑设计标准',
  },
  shanghai: {
    province: '上海市',
    query: '上海市',
    keywords: '建筑抗震设计标准\n地基基础设计标准\n现有建筑抗震鉴定与加固标准\n建筑消能减震及隔震技术标准\n基坑工程技术标准\n岩土工程勘察规范',
  },
  beijing: {
    province: '北京市',
    query: '北京市',
    keywords: '建筑基坑支护技术规程\n基坑工程内支撑技术规程\n农村民居建筑抗震设计施工规程',
  },
  guangdong: {
    province: '广东省',
    query: '广东省',
    keywords: '高层建筑混凝土结构技术规程\n建筑基坑工程技术规程',
  },
  jiangsu: {
    province: '江苏省',
    query: '江苏省',
    keywords: '建筑地基基础检测规程\n住宅设计标准',
  },
  zhejiang: {
    province: '浙江省',
    query: '浙江省',
    keywords: '刚-柔性复合桩基技术规程\n复合地基技术规程\n建筑地基基础设计规范\n工程建设岩土工程勘察规范',
  },
  yunnan: {
    province: '云南省',
    query: '云南省',
    keywords: '建筑基坑工程监测技术规程\n云南省建筑基坑支护技术规程\n岩土工程与地基基础',
  },
};
