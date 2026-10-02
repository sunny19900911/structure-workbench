(function () {
  'use strict';

  // 内嵌只读快照，保证用户直接双击 HTML（file://）时也能查询。
  // 字段真源与完整说明仍保存在 design/parallel-tasks/02-regulation-query/main-workbench-pilot-tj-bj.json。
  var statusLabels = { current: '现行', non_current: '已废止', pending: '待核实' };
  var rawProvinces = {
    '天津市': {
      aliases: ['天津', '天津市'],
      records: [
        ['TJ-01', '天津市岩土工程技术规范', 'DB/T29-20-2017', 'current', 'SRC-TJ-ZFCXJS-DBT29-20-2017', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539221398593.pdf'],
        ['TJ-02', '天津市岩土工程勘察规范', 'DB/T29-247-2017', 'current', 'SRC-TJ-ZFCXJS-DBT29-247-2017', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539255550825.pdf'],
        ['TJ-03', '天津市建筑基桩检测技术规程', 'DB/T29-38-2025', 'current', 'SRC-TJ-ZFCXJS-DBT29-38-2025', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202508/W020260130364172357440.pdf'],
        ['TJ-04', '天津市预防混凝土碱骨料反应技术规程', 'DB/T29-176-2016', 'current', 'SRC-TJ-ZFCXJS-DBT29-176-2016', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539165237657.pdf'],
        ['TJ-05', '天津市绿色建筑设计标准', 'DB29-205-2024', 'current', 'SRC-TJ-ZFCXJS-DB29-205-2024', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202402/W020240315404849525830.pdf'],
        ['TJ-06', '天津市绿色建筑评价标准', 'DB/T29-204-2026', 'current', 'SRC-TJ-ZFCXJS-DBT29-204-2026', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202508/W020260306505365174301.pdf'],
        ['TJ-07', '天津市装配式建筑评价标准', 'DB/T29-305-2024', 'current', 'SRC-TJ-ZFCXJS-DBT29-305-2024', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202403/W020240321560546742004.pdf'],
        ['TJ-08', '天津市城市轨道交通结构安全保护技术规程', 'DB/T29-279-2020', 'current', 'SRC-TJ-ZFCXJS-DBT29-279-2020', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202102/W020210225526079993696.pdf'],
        ['TJ-09', '天津市轨道交通运营安全条例', '天津市人大常委会公告第一一三号', 'current', 'SRC-TJ-MOJ-2023007873', 'https://www.moj.gov.cn/pub/sfbgw/fzgz/fzgzxzlf/fzgzbagz/202303/t20230313_474203.html'],
        ['TJ-10', '天津市建筑工程消能减震隔震技术规程', 'DB/T29-320-2025', 'current', 'SRC-TJ-ZFCXJS-DBT29-320-2025', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202503/W020250331521348687587.pdf'],
        ['TJ-11', '天津市超限高层建筑工程设计要点（2016修订版）', '津建设〔2016〕39号', 'pending', 'SRC-TJ-ZFCXJS-JINJIANSHE-2016-39-LATER-REFERENCE', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgfsj/202010/W020201029573134189664.pdf'],
        ['TJ-12', '关于贯彻落实《建设工程抗震管理条例》工作方案', '津住建设〔2022〕9号', 'current', 'SRC-TJ-ZFCXJS-JINZHUJIANSHE-2022-9', 'https://zfcxjs.tj.gov.cn/xxgk_70/zcwj/wfwj/202204/t20220408_5851631.html'],
        ['TJ-13', '关于贯彻执行《中国地震动参数区划图》的通知', '津建设〔2016〕256号', 'non_current', 'SRC-TJ-ZFCXJS-REPEAL-2022-12-19-ITEM12', 'https://zfcxjs.tj.gov.cn/sylm/gabsycs/tzgggh/202212/t20221229_6063704.html', '已废止', '2022-12-19', '公告未注明替代文件', []],
        ['TJ-14', '天津市民用建筑施工图设计审查要点（结构篇）', '津18MS-G / DBJT29-183-2018', 'pending', 'SRC-TJ-ZFCXJS-DBJT29-183-2018', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgfsj/202010/W020201029573145809487.pdf'],
        ['TJ-15', '预制混凝土构件质量检验标准', 'DB/T29-245-2021', 'current', 'SRC-TJ-ZFCXJS-DBT29-245-2021', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202106/W020210602398830596282.pdf'],
        ['TJ-16', '装配式建筑预制混凝土构件质量与检验标准', 'DB/T29-245-2017', 'non_current', 'SRC-TJ-ZFCXJS-DBT29-245-2021-REPLACE', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202106/W020210602398830596282.pdf', '已替代', '2021-07-01', '→ DB/T29-245-2021《预制混凝土构件质量检验标准》', ['DB/T29-245-2021']],
        ['TJ-17', '天津市蒸压砂加气混凝土制品应用技术规程', 'DB/T29-128-2015', 'current', 'SRC-TJ-ZFCXJS-DBT29-128-2015', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539124646948.pdf'],
        ['TJ-18', '天津市空间网格结构技术规程', 'DB29-140-2011', 'current', 'SRC-TJ-ZFCXJS-DB29-140-2011', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539483130408.pdf'],
        ['TJ-19', '天津市铝合金空间网格结构技术规程', 'DB/T29-261-2019', 'current', 'SRC-TJ-ZFCXJS-DBT29-261-2019', 'https://zfcxjs.tj.gov.cn/ztzl_70/bzgf/xxbz/xxbzgf/202010/W020201029539581361606.pdf']
      ]
    },
    '北京市': {
      aliases: ['北京', '北京市'],
      records: [
        ['BJ-01', '既有建筑抗震加固技术规程', 'DB11/T 689-2025', 'current', 'SRC-BJ-SCJGJ-DB11T689-2025', 'https://scjgj.beijing.gov.cn/zwxx/gs/dfbzgg/202507/t20250707_4143412.html'],
        ['BJ-02', '房屋结构综合安全性鉴定标准', 'DB11/637-2015', 'non_current', 'SRC-BJ-ZJW-DB11T637-2024-REPLACE', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743799392/index.shtml', '已替代', '2024-10-01', '→ DB11/T 637-2024《房屋结构综合安全性鉴定标准》', ['DB11/T 637-2024']],
        ['BJ-11', '房屋结构综合安全性鉴定标准', 'DB11/T 637-2024', 'current', 'SRC-BJ-ZJW-DB11T637-2024', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743799392/index.shtml'],
        ['BJ-03', '住宅设计规范', 'DB11/1740-2020', 'current', 'SRC-SAMR-DB11-1740-2020', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=A9C23746BB0D4037E05397BE0A0AAD35'],
        ['BJ-04', '地下室防水技术规程', 'DB11/T 367-2021', 'current', 'SRC-SAMR-DB11T367-2021', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=BF83AA3C84EB27B9E05397BE0A0A964D'],
        ['BJ-05', '北京地区建筑地基基础勘察设计规范', 'DBJ11-501-2009（2016年版）', 'current', 'SRC-BJ-GHZRZY-DBJ11-501-2009-2016', 'https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bz/kc/202002/t20200218_1655684.html'],
        ['BJ-06', '建筑防火涂料（板）工程设计、施工与验收规程', 'DB11/1245-2015', 'pending', 'SRC-BJ-GHZRZY-REVIEW-2021-DB11-1245-CONFLICT', 'https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bztg/202110/P020211012392065109420.pdf'],
        ['BJ-07', '房屋鉴定与结构检测操作规程', 'DB11/T 849-2011', 'non_current', 'SRC-BJ-ZJW-DB11T849-2021-REPLACE', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800523/index.shtml', '已替代', '2021-07-01', '→ DB11/T 849-2021《房屋结构检测与鉴定操作规程》', ['DB11/T 849-2021']],
        ['BJ-12', '房屋结构检测与鉴定操作规程', 'DB11/T 849-2021', 'current', 'SRC-BJ-ZJW-DB11T849-2021', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800523/index.shtml'],
        ['BJ-08', '建筑抗震鉴定与加固技术规程', 'DB11/T 689-2009', 'non_current', 'SRC-BJ-HISTORY-DB11T689-2009', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800868/index.shtml', '分拆替代', '鉴定 2015-06-01；加固 2017-07-01', '→ DB11/637-2015《房屋结构综合安全性鉴定标准》；DB11/689-2016《建筑抗震加固技术规程》', ['DB11/637-2015', 'DB11/689-2016']],
        ['BJ-13', '建筑抗震加固技术规程', 'DB11/689-2016', 'non_current', 'SRC-BJ-SCJGJ-DB11T689-2025-REPLACE', 'https://scjgj.beijing.gov.cn/zwxx/gs/dfbzgg/202507/t20250707_4143412.html', '已替代', '2026-01-01', '→ DB11/T 689-2025《既有建筑抗震加固技术规程》', ['DB11/T 689-2025']],
        ['BJ-09', '房屋建筑安全评估技术规程', 'DB11/T 882-2012', 'non_current', 'SRC-BJ-ZJW-DB11T882-2023-REPLACE', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800547/index.shtml', '已替代', '2023-07-01', '→ DB11/T 882-2023《房屋建筑安全评估技术规程》', ['DB11/T 882-2023']],
        ['BJ-14', '房屋建筑安全评估技术规程', 'DB11/T 882-2023', 'current', 'SRC-BJ-ZJW-DB11T882-2023', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800547/index.shtml'],
        ['BJ-10', '装配式建筑评价标准', 'DB11/T 1831-2021', 'current', 'SRC-BJ-ZJW-DB11T1831-2021', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800523/index.shtml'],
        ['BJ-15', '建筑工程减隔震技术规程', 'DB11/2075-2022', 'current', 'SRC-BJ-SAMR-DB11-2075-2022', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=F1E1504BFBCBC2D1E05397BE0A0AB86B'],
        ['BJ-16', '钢结构住宅技术规程', 'DB11/T 1746-2020', 'current', 'SRC-BJ-SAMR-DB11T-1746-2020', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=A9C24DAD85984C24E05397BE0A0A266F'],
        ['BJ-17', '装配式框架及框架-剪力墙结构设计规程', 'DB11/1310-2015', 'current', 'SRC-BJ-SAMR-DB11-1310-2015', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4DE1F72E24E05397BE0A0A3A10'],
        ['BJ-18', '装配式剪力墙结构设计规程', 'DB11/1003-2013', 'non_current', 'SRC-BJ-SAMR-DB11-1003-2022-REPLACE', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=F1E15641F0DAC4B3E05397BE0A0A8C45', '已替代', '2023-07-01', '→ DB11/1003-2022《装配式剪力墙结构设计规程》', ['DB11/1003-2022']],
        ['BJ-19', '装配式剪力墙结构设计规程', 'DB11/1003-2022', 'current', 'SRC-BJ-SAMR-DB11-1003-2022', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=F1E15641F0DAC4B3E05397BE0A0A8C45'],
        ['BJ-20', '装配式混凝土结构工程施工与质量验收规程', 'DB11/T 1030-2013', 'non_current', 'SRC-BJ-SAMR-DB11T-1030-2021-REPLACE', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=BF83BE9BD2FB318AE05397BE0A0A770D', '已替代', '2021-07-01', '→ DB11/T 1030-2021《装配式混凝土结构工程施工与质量验收规程》', ['DB11/T 1030-2021']],
        ['BJ-21', '装配式混凝土结构工程施工与质量验收规程', 'DB11/T 1030-2021', 'current', 'SRC-BJ-SAMR-DB11T-1030-2021', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=BF83BE9BD2FB318AE05397BE0A0A770D'],
        ['BJ-22', '绿色建筑评价标准', 'DB11/T 825-2021', 'non_current', 'SRC-BJ-SAMR-DB11T-825-2025-REPLACE', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=4995C6A4F0685D83E06397BE0A0A9DEF', '已替代', '2026-04-01', '→ DB11/T 825-2025《绿色建筑评价标准》', ['DB11/T 825-2025']],
        ['BJ-23', '绿色建筑评价标准', 'DB11/T 825-2025', 'current', 'SRC-BJ-SAMR-DB11T-825-2025', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=4995C6A4F0685D83E06397BE0A0A9DEF'],
        ['BJ-24', '建筑基坑支护技术规程', 'DB11/T 489-2024', 'current', 'SRC-BJ-ZJW-DB11T489-2024', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml'],
        ['BJ-25', '建筑基坑支护技术规程', 'DB11/489-2016', 'non_current', 'SRC-BJ-ZJW-DB11T489-2024-REPLACE', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml', '已替代', '2024-07-01', '→ DB11/T 489-2024《建筑基坑支护技术规程》', ['DB11/T 489-2024']],
        ['BJ-26', '基坑工程内支撑技术规程', 'DB11/T 940-2024', 'current', 'SRC-BJ-ZJW-DB11T940-2024', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml'],
        ['BJ-27', '基坑工程内支撑技术规程', 'DB11/940-2012', 'non_current', 'SRC-BJ-ZJW-DB11T940-2024-REPLACE', 'https://zjw.beijing.gov.cn/bjjs/bzgl17/bzxx/fbgg/743800559/index.shtml', '已替代', '2024-07-01', '→ DB11/T 940-2024《基坑工程内支撑技术规程》', ['DB11/T 940-2024']]
      ]
    },
    '上海市': {
      aliases: ['上海', '上海市'],
      records: [
        ['SH-01', '建筑抗震设计标准', 'DG/TJ08-9-2023', 'current', 'SRC-SH-ZJW-DGTJ08-9-2023', 'https://zjw.sh.gov.cn/jsgl/20230328/cfba3332dba34d0c9b8723004d8470b9.html'],
        ['SH-02', '建筑抗震设计规程', 'DGJ08-9-2013', 'non_current', 'SRC-SH-ZJW-DGTJ08-9-2023-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20230328/cfba3332dba34d0c9b8723004d8470b9.html', '已替代', '2023-06-01', '→ DG/TJ08-9-2023《建筑抗震设计标准》', ['DG/TJ08-9-2023']],
        ['SH-03', '地基基础设计标准', 'DGJ08-11-2018', 'current', 'SRC-SH-ZJW-DGJ08-11-2018', 'https://zjw.sh.gov.cn/jsgl/20190225/0011-57967.html'],
        ['SH-04', '地基基础设计规范', 'DGJ08-11-2010', 'non_current', 'SRC-SH-ZJW-DGJ08-11-2018-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20190225/0011-57967.html', '已替代', '2019-08-01', '→ DGJ08-11-2018《地基基础设计标准》', ['DGJ08-11-2018']],
        ['SH-05', '现有建筑抗震鉴定与加固标准', 'DGJ08-81-2021', 'current', 'SRC-SH-ZJW-DGJ08-81-2021', 'https://zjw.sh.gov.cn/cmsres/70/70c1a5c3608141f7b12e22dda36f702a/0eb4335ec853a054ba763ada4704072e.pdf'],
        ['SH-06', '建筑消能减震及隔震技术标准', 'DG/TJ08-2326-2020', 'current', 'SRC-SH-ZJW-REVIEW-2024-DGTJ08-2326-2020', 'https://zjw.sh.gov.cn/jsgl/20250206/ba2dcb8bc35245ef9206424ec77368eb.html'],
        ['SH-07', '基坑工程技术标准', 'DG/TJ08-61-2018', 'current', 'SRC-SH-ZJW-DGTJ08-61-2018', 'https://zjw.sh.gov.cn/cmsres/de/deb9c9b5f4d244a38fb0c39c6b4cbbcd/68c8216c59552f6eba595989143f81f0.pdf'],
        ['SH-08', '岩土工程勘察规范', 'DGJ08-37-2012', 'non_current', 'SRC-SH-ZJW-DGTJ08-37-2023-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20230703/13d55c15901843efbdaa9796e1ea511f.html', '已替代', '2023-12-01', '→ DG/TJ08-37-2023《岩土工程勘察标准》', ['DG/TJ08-37-2023']],
        ['SH-09', '高层建筑钢结构设计标准', 'DG/TJ08-32-2025', 'current', 'SRC-SH-ZJW-DGTJ08-32-2025', 'https://zjw.sh.gov.cn/jsgl/20251223/9abd25d61f2d4a729aba30d897f34515.html'],
        ['SH-10', '高层建筑钢结构设计规程', 'DG/TJ08-32-2008', 'non_current', 'SRC-SH-ZJW-DGTJ08-32-2025-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20251223/9abd25d61f2d4a729aba30d897f34515.html', '已替代', '2026-05-01', '→ DG/TJ08-32-2025《高层建筑钢结构设计标准》', ['DG/TJ08-32-2025']],
        ['SH-11', '关于进一步明确装配式建筑实施范围和单体预制率、装配率计算细则的通知', '沪建建材〔2025〕250号', 'current', 'SRC-SH-ZJW-HJJC-2025-250', 'https://zjw.sh.gov.cn/jsgl/20250529/116d173660334dc3a77dd8687eeea89f.html'],
        ['SH-12', '关于进一步明确装配式建筑实施范围和相关工作要求的通知', '沪建建材〔2019〕97号', 'non_current', 'SRC-SH-ZJW-HJJC-2025-250-TRANSITION', 'https://zjw.sh.gov.cn/jsgl/20250529/116d173660334dc3a77dd8687eeea89f.html', '新项目已替代', '2025-09-01', '→ 沪建建材〔2025〕250号《关于进一步明确装配式建筑实施范围和单体预制率、装配率计算细则的通知》', ['沪建建材〔2025〕250号']],
        ['SH-13', '上海市装配式建筑单体预制率和装配率计算细则', '沪建建材〔2019〕765号', 'non_current', 'SRC-SH-ZJW-HJJC-2025-250-TRANSITION', 'https://zjw.sh.gov.cn/jsgl/20250529/116d173660334dc3a77dd8687eeea89f.html', '新项目已替代', '2025-09-01', '→ 沪建建材〔2025〕250号《关于进一步明确装配式建筑实施范围和单体预制率、装配率计算细则的通知》', ['沪建建材〔2025〕250号']],
        ['SH-14', '上海市超限高层建筑抗震设防管理实施细则', '沪建管〔2014〕954号', 'pending', 'SRC-SH-ZJW-LATER-REFERENCE-2014-954', 'https://zjw.sh.gov.cn/cmsres/ae/ae1badad44e24ad78b0c67a91e62d533/832ff1c2d2f2c570caccdb6c8d964b7c.pdf', '仍被官方引用', '2020年度材料'],
        ['SH-15', '上海市建筑工程初步（总体）设计文件抗震设防审查管理办法', '沪建管〔2015〕958号', 'pending', 'SRC-SH-ZJW-LATER-REFERENCE-2015-958', 'https://zjw.sh.gov.cn/cmsres/0b/0bb88d3413744577b312c9e0e401834c/7badaf1e8611cbb4e187e783519d9c09.pdf', '仍被官方引用', '2023年度材料'],
        ['SH-16', '高延性纤维增强水泥基复合材料加固砌体结构技术标准', 'DG/TJ08-2415-2022', 'current', 'SRC-SH-ZJW-CURRENT-DGTJ08-2415-2022', 'https://zjw.sh.gov.cn/xxbz/'],
        ['SH-17', '优秀历史建筑抗震鉴定与加固标准', 'DG/TJ08-2403-2022', 'current', 'SRC-SH-ZJW-CURRENT-DGTJ08-2403-2022', 'https://zjw.sh.gov.cn/xxbz/'],
        ['SH-18', '住宅设计标准', 'DGJ08-20-2019', 'current', 'SRC-SH-ZJW-DGJ08-20-2019', 'https://zjw.sh.gov.cn/jsgl/20191108/0011-71452.html'],
        ['SH-19', '住宅设计标准', 'DGJ08-20-2013', 'non_current', 'SRC-SH-ZJW-DGJ08-20-2019-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20191108/0011-71452.html', '已替代', '2020-01-01', '→ DGJ08-20-2019《住宅设计标准》', ['DGJ08-20-2019']],
        ['SH-20', '混凝土结构工程施工标准', 'DG/TJ08-020-2019', 'current', 'SRC-SH-ZJW-CURRENT-DGTJ08-020-2019', 'https://zjw.sh.gov.cn/xxbz/index_11.html'],
        ['SH-21', '岩土工程勘察标准', 'DG/TJ08-37-2023', 'current', 'SRC-SH-ZJW-DGTJ08-37-2023', 'https://zjw.sh.gov.cn/jsgl/20230703/13d55c15901843efbdaa9796e1ea511f.html'],
        ['SH-22', '高层建筑钢-混凝土混合结构设计规程', 'DG/TJ08-015-2018', 'current', 'SRC-SH-ZJW-DGTJ08-015-2018', 'https://zjw.sh.gov.cn/jsgl/20190114/0011-56117.html'],
        ['SH-23', '高层建筑钢-混凝土混合结构设计规程', 'DG/TJ08-015-2004', 'non_current', 'SRC-SH-ZJW-DGTJ08-015-2018-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20190114/0011-56117.html', '已替代', '2019-05-01', '→ DG/TJ08-015-2018《高层建筑钢-混凝土混合结构设计规程》', ['DG/TJ08-015-2018']],
        ['SH-24', '大跨度建筑空间结构抗连续倒塌设计标准', 'DG/TJ08-2350-2021', 'current', 'SRC-SH-ZJW-DGTJ08-2350-2021', 'https://zjw.sh.gov.cn/jsgl/20210628/fdf729bb5c2a44cf9f9fdee67ede1260.html'],
        ['SH-25', '建筑地基与基桩检测技术规程', 'DG/TJ08-218-2017', 'current', 'SRC-SH-ZJW-REVIEW-2022-DGTJ08-218-2017', 'https://zjw.sh.gov.cn/pdf/%E5%A4%8D%E5%AE%A1%E7%BB%93%E6%9E%9C%E7%9A%84%E9%80%9A%E7%9F%A5%2B%EF%BC%88%E9%99%84%E4%BB%B61%E3%80%81%E9%99%84%E4%BB%B62%E3%80%81%E9%99%84%E4%BB%B63%EF%BC%89.pdf'],
        ['SH-26', '多高层钢结构住宅技术标准', 'DG/TJ08-2029-2021', 'current', 'SRC-SH-ZJW-DGTJ08-2029-2021', 'https://zjw.sh.gov.cn/jsgl/20210706/e3387b05109c4fb581224542e0a0390b.html'],
        ['SH-27', '多高层钢结构住宅技术规程', 'DG/TJ08-2029-2007', 'non_current', 'SRC-SH-ZJW-DGTJ08-2029-2021-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20210706/e3387b05109c4fb581224542e0a0390b.html', '已替代', '2021-11-01', '→ DG/TJ08-2029-2021《多高层钢结构住宅技术标准》', ['DG/TJ08-2029-2021']],
        ['SH-28', '地下铁道结构抗震设计标准', 'DG/TJ08-2064-2022', 'current', 'SRC-SH-ZJW-DGTJ08-2064-2022', 'https://zjw.sh.gov.cn/jsgl/20220923/9c0728b936df4895a4e0e447a9ffb29b.html'],
        ['SH-29', '地下铁道建筑结构抗震设计规范', 'DG/TJ08-2064-2009', 'non_current', 'SRC-SH-ZJW-DGTJ08-2064-2022-REPLACE', 'https://zjw.sh.gov.cn/jsgl/20220923/9c0728b936df4895a4e0e447a9ffb29b.html', '已替代', '2022-11-01', '→ DG/TJ08-2064-2022《地下铁道结构抗震设计标准》', ['DG/TJ08-2064-2022']],
        ['SH-30', '纤维增强复合材料加固混凝土结构技术规程', 'DG/TJ08-012-2017', 'current', 'SRC-SH-ZJW-CURRENT-DGTJ08-012-2017', 'https://zjw.sh.gov.cn/xxbz/index_14.html'],
        ['SH-31', '既有地下建筑改扩建技术规范', 'DG/TJ08-2235-2017', 'current', 'SRC-SH-ZJW-CURRENT-DGTJ08-2235-2017', 'https://zjw.sh.gov.cn/xxbz/index_14.html'],
        ['SH-32', '基坑工程微变形控制技术标准', 'DG/TJ08-2364-2021', 'current', 'SRC-SH-ZJW-CURRENT-DGTJ08-2364-2021', 'https://zjw.sh.gov.cn/xxbz/index_3.html']
      ]
    },
    '广东省': {
      aliases: ['广东', '广东省', '广州', '广州市', '深圳', '深圳市'],
      records: [
        ['GD-01', '高层建筑混凝土结构技术规程', 'DBJ/T 15-92-2021', 'pending', 'SRC-GD-ZFCXJST-DBJT15-92-2021', 'https://zfcxjst.gd.gov.cn/gkmlpt/content/3/3222/post_3222044.html', '已实施，现行待核', '2021-06-01'],
        ['GD-02', '高层建筑混凝土结构技术规程', 'DBJ 15-92-2013', 'non_current', 'SRC-GD-ZFCXJST-DBJT15-92-2021-REPLACE', 'https://zfcxjst.gd.gov.cn/gkmlpt/content/3/3222/post_3222044.html', '已替代', '2021-06-01', '→ DBJ/T 15-92-2021《高层建筑混凝土结构技术规程》', ['DBJ/T 15-92-2021']],
        ['GD-03', '建筑基坑工程技术规程', 'DBJ/T15-20-2016', 'pending', 'SRC-GD-ZFCXJST-DBJT15-20-2016', 'https://zfcxjst.gd.gov.cn/gkmlpt/content/1/1454/mmpost_1454771.html', '已实施，现行待核', '2017-04-30'],
        ['GD-04', '建筑基坑支护工程技术规程', 'DBJ/T15-20-97', 'non_current', 'SRC-GD-ZFCXJST-DBJT15-20-2016-REPLACE', 'https://zfcxjst.gd.gov.cn/gkmlpt/content/1/1454/mmpost_1454771.html', '已替代', '2017-04-30', '→ DBJ/T15-20-2016《建筑基坑工程技术规程》', ['DBJ/T15-20-2016']],
        ['GD-05', '锤击式预应力混凝土管桩工程技术规程', 'DBJ/T 15-22-2021', 'current', 'SRC-GD-ZFCXJST-DBJT15-22-2021-CORRIGENDUM', 'https://zfcxjst.gd.gov.cn/gkmlpt/content/4/4245/post_4245193.html'],
        ['GD-06', '房屋建筑和市政基础设施工程绿色施工评价标准', 'DBJ/T15-97-2025', 'current', 'SRC-GD-GDCIC-DBJT15-97-2025', 'https://www.gdcic.net/ShowNews?KeyId=b38700aba4b1420bb213098322c29269'],
        ['GD-07', '建筑工程绿色施工评价标准', 'DBJ/T15-97-2013', 'non_current', 'SRC-GD-GDCIC-DBJT15-97-2025-REPLACE', 'https://www.gdcic.net/ShowNews?KeyId=b38700aba4b1420bb213098322c29269', '已替代', '2025-11-01', '→ DBJ/T15-97-2025《房屋建筑和市政基础设施工程绿色施工评价标准》', ['DBJ/T15-97-2025']]
      ]
    },
    '海南省': {
      aliases: ['海南', '海南省', '海口', '海口市', '三亚', '三亚市', '儋州', '儋州市'],
      records: [
        ['HN-01', '非承重砌体材料应用技术规程', 'DBJ46-008-2016', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-008-2016', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/8c2afd0f23774ccaa8601bbc660912b1.pdf'],
        ['HN-02', '预拌混凝土应用技术标准', 'DBJ46-018-2019', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-018-2019', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/14d4278714064f378ac9edfc219aeec1.pdf'],
        ['HN-03', '装配式混凝土结构工程施工质量验收标准', 'DBJ46-047-2018', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-047-2018', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/076cc2e5c95d4b9085e4981a650e9bc4.pdf'],
        ['HN-04', '海南省建筑工程防水技术标准', 'DBJ46-048-2018', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-048-2018', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/a91db62517854102a5aa0bb56da1e763.pdf'],
        ['HN-05', '海南省建筑钢结构防腐技术标准', 'DBJ46-057-2020', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-057-2020', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/2fedaeabddca4d06a4bc533698172a91.pdf'],
        ['HN-06', '海南省绿色建筑评价标准（民用建筑篇）', 'DBJ46-064-2023', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-064-2023', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/9dcd5ae0f7b9417fa53bd571e5ea5888.pdf'],
        ['HN-07', '海南省装配式混凝土预制构件生产和安装技术标准', 'DBJ46-058-2021', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-058-2021', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/282d1686bc394b38aee271c43a9b0be0.pdf'],
        ['HN-08', '海南省装配式建筑标准化设计技术标准', 'DBJ46-061-2021', 'current', 'SRC-HN-ZJT-CURRENT-DBJ46-061-2021', 'https://zjt.hainan.gov.cn/szjt/dexzzx/201902/d2c026586d88478cae814af3eafb0a72/files/13243f02768b467eab2ae60428733f13.pdf']
      ]
    },
    '江苏省': {
      aliases: ['江苏', '江苏省', '南京', '南京市', '苏州', '苏州市'],
      records: [
        ['JS-01', '建筑地基基础检测规程', 'DB32/T 3916-2020', 'current', 'SRC-SAMR-DB32T3916-2020', 'https://dbba.sacinfo.org.cn/stdDetail/25a113ec00f6a1fa086f2497cdb821c9aad347f7298bd80ea039402c3548c6c9'],
        ['JS-02', '住宅设计标准', 'DB32/3920-2020', 'current', 'SRC-SAMR-DB32-3920-2020', 'https://dbba.sacinfo.org.cn/stdDetail/edcffc0f090d0cf456c6d3149eaeb6ab2a973b01728d1d4711d7944692248731'],
        ['JS-03', '江苏省城市地下管线探测技术规程', 'DGJ32/TJ186-2015', 'non_current', 'SRC-JS-ZJST-REPEAL-2025-8', 'https://jsszfhcxjst.jiangsu.gov.cn/art/2025/7/21/art_49384_11604977.html', '已废止', '2025-07-21', '公告未注明替代文件', []],
        ['JS-04', '江苏省城市地下管线数据标准', 'DGJ32/TJ187-2015', 'non_current', 'SRC-JS-ZJST-REPEAL-2025-8', 'https://jsszfhcxjst.jiangsu.gov.cn/art/2025/7/21/art_49384_11604977.html', '已废止', '2025-07-21', '公告未注明替代文件', []],
        ['JS-05', '南京地区建筑基坑工程监测技术规程', 'DGJ32/J189-2015', 'non_current', 'SRC-JS-ZJST-REPEAL-2025-8', 'https://jsszfhcxjst.jiangsu.gov.cn/art/2025/7/21/art_49384_11604977.html', '已废止', '2025-07-21', '公告未注明替代文件', []],
        ['JS-06', '建筑外窗工程检测与评定规程', 'DGJ32/TJ197-2015', 'non_current', 'SRC-JS-ZJST-REPEAL-2025-8', 'https://jsszfhcxjst.jiangsu.gov.cn/art/2025/7/21/art_49384_11604977.html', '已废止', '2025-07-21', '公告未注明替代文件', []],
        ['JS-07', '城市轨道交通接触网系统工程质量验收规范', 'DGJ32/TJ198-2015', 'non_current', 'SRC-JS-ZJST-REPEAL-2025-8', 'https://jsszfhcxjst.jiangsu.gov.cn/art/2025/7/21/art_49384_11604977.html', '已废止', '2025-07-21', '公告未注明替代文件', []],
        ['JS-08', '钢骨架集成模块建筑技术标准', 'DB32/T 3750-2020', 'non_current', 'SRC-JS-ZJST-REPEAL-2025-8', 'https://jsszfhcxjst.jiangsu.gov.cn/art/2025/7/21/art_49384_11604977.html', '已废止', '2025-07-21', '公告未注明替代文件', []],
        ['JS-09', '江苏省防震减灾条例（2017年修正）', '江苏省地方性法规', 'current', 'SRC-JS-RD-EARTHQUAKE-2017', 'https://www.jsrd.gov.cn/qwfb/sjfg/201706/t20170607_1221118.shtml'],
        ['JS-10', '预应力混凝土管桩基础技术规程', 'DGJ32/TJ109-2010', 'pending', 'SRC-JS-SUZHOU-LATER-REFERENCE-DGJ32TJ109', 'https://www.suzhou.gov.cn/szsrmzf/bmwj/202103/81005361c7034e96a95b8c597f6be39e.shtml', '仍被官方引用', '2021-03'],
        ['JS-11', '江苏省建筑防水工程技术规程', 'DGJ32/TJ212-2016', 'pending', 'SRC-JS-CABP-DBJ32TJ212-2016-CANDIDATE', 'https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&bookID=102894', '出版库显示现行', '省厅目录待核'],
        ['JS-12', '高层建筑工程抗震设防超限界定标准', 'DB32/T 4399-2022', 'current', 'SRC-JS-SAMR-DB32T-4399-2022', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=EEAB111F7BA16675E05397BE0A0A0E4E'],
        ['JS-13', '基桩自平衡法静载试验技术规程', 'DB32/T 3917-2020', 'current', 'SRC-JS-SAMR-DB32T-3917-2020', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=B8C50F87B1E77A7FE05397BE0A0A2A6E'],
        ['JS-14', '绿色建筑设计标准', 'DB32/3962-2020', 'current', 'SRC-JS-SAMR-DB32-3962-2020', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=B96682D1F0FA2591E05397BE0A0A48B6'],
        ['JS-15', '预应力混凝土空心方桩基础技术规程（含第1号修改单）', 'DB32/T 4285-2022', 'current', 'SRC-JS-SAMR-DB32T-4285-2022-AMENDMENT1', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=20055B838C3B4922E06397BE0A0AF48E'],
        ['JS-16', '预应力混凝土实心方桩基础技术规程', 'DB32/T 4111-2021', 'current', 'SRC-JS-SAMR-DB32T-4111-2021', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=D8996864BEEE4563E05397BE0A0A6D75'],
        ['JS-17', '防灾避难场所建设技术标准', 'DB32/3709-2019', 'non_current', 'SRC-JS-SAMR-DB32-3709-2019-REPEAL', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=9DB959268689D016E05397BE0A0AFE92', '已废止', '2025-08-25', '平台未注明替代文件', []],
        ['JS-18', '模块装配式剪力墙结构应用技术规程', 'DB32/T 3968-2021', 'current', 'SRC-JS-SAMR-DB32T-3968-2021', 'https://std.samr.gov.cn/db/search/stdDBDetailed?id=BBA85C1CA0998B26E05397BE0A0A6531']
      ]
    },
    '浙江省': {
      aliases: ['浙江', '浙江省', '杭州', '杭州市', '宁波', '宁波市'],
      records: [
        ['ZJ-01', '刚-柔性复合桩基技术规程', 'DB33/1048-2010', 'current', 'SRC-ZJ-ZJST-REVIEW-DB33-1048-2010', 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf'],
        ['ZJ-02', '复合地基技术规程', 'DB33/1051-2008', 'current', 'SRC-ZJ-ZJST-REVIEW-DB33-1051-2008', 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf'],
        ['ZJ-03', '建筑地基基础设计规范', 'DB33/T1136-2017', 'pending', 'SRC-ZJ-ZJST-DB33T1136-2017', 'https://jst.zj.gov.cn/attach/-1/1904041240517888613.pdf', '已实施，现行待核', '2017-10-01'],
        ['ZJ-04', '建筑用砂混合轻量土配合比设计规程', 'DB33/T1046-2008', 'non_current', 'SRC-ZJ-ZJST-REVIEW-DB33T1046-2008', 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf', '复审废止', '结论未载明日期', '复审结果未注明替代文件', []],
        ['ZJ-05', '固定式塔式起重机基础技术规程', 'DB33/T1053-2008', 'non_current', 'SRC-ZJ-ZJST-REVIEW-DB33T1053-2008', 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=3576ac8f96644975ab1879c049fb7094.pdf', '复审废止', '结论未载明日期', '复审结果未注明替代文件', []],
        ['ZJ-06', '建筑结构抗震性能化设计标准', 'DBJ33/T 1318-2024', 'pending', 'SRC-ZJ-JST-DBJ33T-1318-2024', 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3162/site/attach/0/86faea3e2d41447aa687a80bf5ce8a21.pdf', '已发布施行', '2024-10-01'],
        ['ZJ-07', '蒸压加气混凝土墙板应用技术规程', 'DB33/T1232-2021', 'pending', 'SRC-ZJ-JST-LATER-REFERENCE-DB33T-1232-2021', 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=9ec6dd19786f41ab92b7c8384663dc50.pdf', '仍被官方引用', '2025技术资料'],
        ['ZJ-08', '蒸压加气混凝土砌块应用技术规程', 'DB33/T1027-2018', 'pending', 'SRC-ZJ-JST-DB33T-1027-2018', 'https://jst.zj.gov.cn/attach/-1/1904041304121404174.pdf', '官网正文可查', '2018-12-01施行'],
        ['ZJ-09', '装配式建筑评价标准', 'DB33/T1165-2019', 'non_current', 'SRC-ZJ-JST-DB33T-1165-2024-REPLACE', 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=9ec6dd19786f41ab92b7c8384663dc50.pdf', '已替代', '2025-01-01', '→ DB33/T1165-2024《装配式建筑评价标准》', ['DB33/T1165-2024']],
        ['ZJ-10', '装配式建筑评价标准', 'DB33/T1165-2024', 'current', 'SRC-ZJ-JST-DB33T-1165-2024', 'https://jst.zj.gov.cn/module/download/downfile.jsp?classid=0&filename=9ec6dd19786f41ab92b7c8384663dc50.pdf']
      ]
    },
    '云南省': {
      aliases: ['云南', '云南省', '昆明', '昆明市', '云南省昆明市'],
      records: [
        ['YN-01', '建筑基坑工程监测技术规程', 'DBJ53/T-67-2014', 'current', 'SRC-YN-ZFCXJST-CURRENT-DBJ53T-67-2014', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html'],
        ['YN-02', '云南省建筑基坑支护技术规程', 'DBJ53/T-71-2015', 'current', 'SRC-YN-ZFCXJST-CURRENT-DBJ53T-71-2015', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html'],
        ['YN-03', '云南省膨胀土地区建筑技术规程', 'DBJ 53/T-83-2017', 'current', 'SRC-YN-ZFCXJST-CURRENT-DBJ53T-83-2017', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html'],
        ['YN-04', '云南省膨胀土地区建筑技术规程（原版）', '云建科〔1988〕524号', 'non_current', 'SRC-YN-ZFCXJST-DBJ53T-83-2017-REPLACE', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273947.html', '已替代', '2018-01-01', '→ DBJ 53/T-83-2017《云南省膨胀土地区建筑技术规程》', ['DBJ 53/T-83-2017']],
        ['YN-05', '云南省建筑工程叠层橡胶隔震支座性能要求和检验标准', 'DBJ 53/T-47-2020', 'current', 'SRC-YN-ZFCXJST-CURRENT-DBJ53T-47-2020', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273846.html'],
        ['YN-06', '云南省建筑工程叠层橡胶隔震支座施工及验收标准', 'DBJ 53/T-48-2020', 'current', 'SRC-YN-ZFCXJST-CURRENT-DBJ53T-48-2020', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273846.html'],
        ['YN-07', '建筑结构隔震构造详图', '滇20G9-1', 'pending', 'SRC-YN-ZFCXJST-DIAN20G9-1', 'https://zfcxjst.yn.gov.cn/submodule/Editor/uploadfile/20200722162244200.pdf', '官网原文可查', '2020'],
        ['YN-08', '建筑隔震工程专用标识技术规程', 'DBJ 53/T-70-2015', 'non_current', 'SRC-YN-ZFCXJST-CURRENT-CATALOG-DBJ53T-70-2025', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273846.html', '同编号已更新', '2025版进入现行目录', '→ DBJ 53/T-70-2025《云南省隔震减震建筑标识标准》', ['DBJ 53/T-70-2025']],
        ['YN-09', '云南省隔震减震建筑标识标准', 'DBJ 53/T-70-2025', 'current', 'SRC-YN-ZFCXJST-CURRENT-DBJ53T-70-2025', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273846.html'],
        ['YN-10', '云南省建筑消能减震应用技术规程', 'DBJ 53/T-125-2021', 'current', 'SRC-YN-ZFCXJST-CURRENT-DBJ53T-125-2021', 'https://zfcxjst.yn.gov.cn/ztzl/ynsgcjsdfbz/202606/t20260630_3273846.html'],
        ['YN-11', '云南省建筑工程抗震设防专项审查技术要点（试行）', '云建震〔2020〕178号', 'pending', 'SRC-YN-ZFCXJST-LATER-REFERENCE-YJZ-2020-178', 'https://zfcxjst.yn.gov.cn/ewebeditor/uploadfile/20220105101845217.pdf', '仍被官方引用', '2021项目审查'],
        ['YN-12', '云南省隔震减震建筑工程促进规定', '云南省人民政府令第202号', 'current', 'SRC-YN-GOV-CURRENT-RULE-202', 'https://www.yn.gov.cn/zwgk/zfxxgkpt/gkptzcwj/ynsrmzfxxyxgzml/202305/t20230505_258597.html'],
        ['YN-13', '云南省隔震减震建筑工程促进规定实施细则', '云南住建厅公告第54号', 'pending', 'SRC-YN-ZFCXJST-IMPLEMENTATION-RULE-54', 'https://zfcxjst.yn.gov.cn/ewebeditor/uploadfile/20210906155015474.pdf', '官网原文可查', '2017-02-01施行'],
        ['YN-14', '云南省装配式建筑评价标准', 'DBJ 53/T-96-2018', 'pending', 'SRC-YN-ZFCXJST-LATER-REFERENCE-DBJ53T-96', 'https://zfcxjst.yn.gov.cn/zfxxgk/zcwj/bjwj/202304/t20230404_2068749.html', '仍被官方引用', '2023官方文件'],
        ['YN-15', '关于进一步促进装配式建筑产业健康发展的通知', '云建科〔2021〕42号', 'pending', 'SRC-YN-ZFCXJST-YJK-2021-42', 'https://zfcxjst.yn.gov.cn/gongzuodongtai2/gongshigonggao4/282891.html', '官网原文可查', '2021-04-06'],
        ['YN-16', '云南省人民政府办公厅关于大力发展装配式建筑的实施意见', '云政办发〔2017〕65号', 'pending', 'SRC-YN-ZFCXJST-LATER-REFERENCE-YZBF-2017-65', 'https://zfcxjst.yn.gov.cn/zhengfuxinxigongkai/zhengcejiedu8735/282893.html', '仍被官方引用', '2021政策文件'],
        ['YN-17', '云南省山地城镇建筑设计导则（试行）', '2013年版', 'pending', 'SRC-YN-ZFCXJST-LATER-REFERENCE-MOUNTAIN-GUIDE', 'https://zfcxjst.yn.gov.cn/ewebeditor/uploadfile/20220105184051961.pdf', '仍被官方审查引用', '2021项目审查']
      ]
    },
    '重庆市': {
      aliases: ['重庆', '重庆市'],
      records: [
        ['CQ-01','建筑地基基础设计标准','DBJ50/T-047-2024','current','SRC-CQ-ZFCXJW-DBJ50T-047-2024','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202412/t20241211_13881773_jlb.html'],
        ['CQ-02','建筑地基基础设计规范','DBJ50-047-2016','non_current','SRC-CQ-ZFCXJW-DBJ50T-047-2024-REPLACE','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202412/t20241211_13881773_jlb.html','已替代','2025-03-01','→ DBJ50/T-047-2024《建筑地基基础设计标准》',['DBJ50/T-047-2024']],
        ['CQ-03','工程勘察标准','DBJ50/T-043-2024','current','SRC-CQ-ZFCXJW-REVIEW-DBJ50T-043-2024','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202412/P020241203672891774435.pdf'],
        ['CQ-04','工程地质勘察规范','DBJ50/T-043-2016','non_current','SRC-CQ-STD-TEXT-DBJ50T-043-2024-REPLACE','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202406/P020240611433189977629.pdf','已替代','2024-07-01','→ DBJ50/T-043-2024《工程勘察标准》',['DBJ50/T-043-2024']],
        ['CQ-05','建筑桩基础技术标准','DBJ50/T-200-2024','current','SRC-CQ-ZFCXJW-DBJ50T-200-2024','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202411/t20241122_13824988.html'],
        ['CQ-06','建筑桩基础设计与施工验收规范','DBJ50-200-2014','non_current','SRC-CQ-ZFCXJW-DBJ50T-200-2024-REPLACE','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202411/t20241122_13824988.html','已替代','2025-02-01','→ DBJ50/T-200-2024《建筑桩基础技术标准》',['DBJ50/T-200-2024']],
        ['CQ-07','旋挖成孔灌注桩工程技术规程','DBJ50-156-2012','non_current','SRC-CQ-ZFCXJW-DBJ50T-200-2024-REPLACE','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202411/t20241122_13824988.html','已替代','2025-02-01','→ DBJ50/T-200-2024《建筑桩基础技术标准》',['DBJ50/T-200-2024']],
        ['CQ-08','旋转挤压灌注桩技术规程','DBJ50/T-207-2014','non_current','SRC-CQ-ZFCXJW-DBJ50T-200-2024-REPLACE','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202411/t20241122_13824988.html','已替代','2025-02-01','→ DBJ50/T-200-2024《建筑桩基础技术标准》',['DBJ50/T-200-2024']],
        ['CQ-09','建筑与市政工程地基基础施工质量验收标准','DBJ50/T-125-2025','current','SRC-CQ-ZFCXJW-DBJ50T-125-2025','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202509/t20250925_15040607_jlb.html'],
        ['CQ-10','建筑地基基础工程施工质量验收规范','DBJ50-125-2011','non_current','SRC-CQ-ZFCXJW-DBJ50T-125-2025-REPLACE','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202509/t20250925_15040607_jlb.html','已替代','2025-12-01','→ DBJ50/T-125-2025《建筑与市政工程地基基础施工质量验收标准》',['DBJ50/T-125-2025']],
        ['CQ-11','建筑高边坡工程施工安全技术标准','DBJ50/T-344-2019','current','SRC-CQ-ZFCXJW-DBJ50T-344-2019','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/201912/t20191230_5275377.html'],
        ['CQ-12','建筑护栏技术标准','DBJ50/T-123-2020','current','SRC-CQ-ZFCXJW-DBJ50T-123-2020','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202004/t20200414_7049281.html'],
        ['CQ-13','建筑护栏技术规程','DBJ50-123-2010','non_current','SRC-CQ-ZFCXJW-DBJ50T-123-2020-REPLACE','https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202004/t20200414_7049281.html','已替代','2020-08-01','→ DBJ50/T-123-2020《建筑护栏技术标准》',['DBJ50/T-123-2020']]
      ]
    },
    '河北省': {
      aliases: ['河北','河北省','雄安','雄安新区','河北雄安新区'],
      records: [
        ['HE-01','雄安新区工程建设关键质量指标体系：建筑工程','DB1331/T 025.1-2022','current','SRC-SAMR-DB1331T-025-1-2022','https://std.samr.gov.cn/db/search/stdDBDetailed?id=F0B644751BE94AB8E05397BE0A0A118E'],
        ['HE-02','雄安新区工程建设关键质量指标体系：地下空间工程','DB1331/T 025.5-2022','current','SRC-SAMR-DB1331T-025-5-2022','https://std.samr.gov.cn/db/search/stdDBDetailed?id=F0B644751BED4AB8E05397BE0A0A118E'],
        ['HE-03','雄安新区工程建设关键质量指标体系：防灾减灾工程','DB1331/T 025.7-2022','current','SRC-SAMR-DB1331T-025-7-2022','https://std.samr.gov.cn/db/search/stdDBDetailed?id=F0B644751BEF4AB8E05397BE0A0A118E'],
        ['HE-04','雄安新区建设工程防水技术规程','DB1331/T 053-2023','current','SRC-SAMR-DB1331T-053-2023','https://std.samr.gov.cn/db/search/stdDBDetailed?id=12A54B926F94DAF5E06397BE0A0AF7DF'],
        ['HE-05','雄安新区建设工程抗震设防标准','DB1331/T 109-2025','current','SRC-SAMR-DB1331T-109-2025','https://std.samr.gov.cn/db/search/stdDBDetailed?id=337D893ED753BBB6E06397BE0A0A5942'],
        ['HE-06','雄安新区建设工程振动舒适度标准','DB1331/T 110-2025','current','SRC-SAMR-DB1331T-110-2025','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=337D893ED754BBB6E06397BE0A0A5942'],
        ['HE-07','雄安新区建设工程基坑导则','DB1331/T 015-2022','current','SRC-SAMR-DB1331T-015-2022','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=EAA53848E1B530D8E05397BE0A0A4C0D'],
        ['HE-08','雄安新区综合管廊防水技术规程','DB1331/T 098-2024','current','SRC-SAMR-DB1331T-098-2024','https://std.samr.gov.cn/db/search/stdDBDetailed?id=2B00EFB776B660FAE06397BE0A0AADDF'],
        ['HE-09','既有建筑地基基础鉴定与加固技术标准','DB13(J)/T 8422-2021','pending','SRC-HE-CABP-DB13JT-8422-2021','https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&bookID=149000','出版库显示现行','省厅现行目录待核'],
        ['HE-10','建筑基坑支护技术规程','DB13(J)/T 8390-2020','pending','SRC-HE-CABP-DB13JT-8390-2020','https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&bookID=147652','出版库显示现行','省厅现行目录待核']
      ]
    },
    '山西省': {
      aliases: ['山西','山西省','太原','太原市'],
      records: [
        ['SX-01','建筑地基基础检测规程','DBJ04/T 312-2015','pending','SRC-SX-CABP-DBJ04T-312-2015','https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&bookID=75601','出版库显示现行','省厅现行目录待核'],
        ['SX-02','建筑地基基础工程施工质量验收规程','DBJ04/T 258-2016','pending','SRC-SX-OFFICIAL-LATER-REFERENCE-DBJ04T-258-2016','https://kcy.sxcig.com/info/1291/7051.htm','仍被官方引用','2025省属机构资料'],
        ['SX-03','装配式混凝土建筑技术标准','DBJ04/T 415-2021','pending','SRC-SX-CABP-DBJ04T-415-2021','https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&bookID=148860','出版库显示现行','省厅现行目录待核'],
        ['SX-04','湿陷性黄土地区建筑基坑工程技术标准','DBJ04/T 374-2018','pending','SRC-SX-CABP-DBJ04T-374-2018','https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&bookID=127212','出版库显示现行','省厅现行目录待核']
      ]
    },
    '辽宁省': {
      aliases: ['辽宁','辽宁省','沈阳','沈阳市','大连','大连市'],
      records: [
        ['LN-01','建筑地基基础技术规范','DB21/T 907-2015','current','SRC-SAMR-DB21T-907-2015','https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D36502E24E05397BE0A0A3A10','现行至2026-09-29','新版2026-09-30实施','→ DB21/T 907-2026《建筑地基基础技术标准》',['DB21/T 907-2026']],
        ['LN-02','建筑地基基础技术标准','DB21/T 907-2026','pending','SRC-SAMR-DB21T-907-2026','https://std.samr.gov.cn/db/search/stdDBDetailed?id=5AF0C5295D6E3523E06397BE0A0A7480','已发布，尚未实施','2026-09-30实施'],
        ['LN-03','地下混凝土结构防裂技术规程','DB21/T 1745-2009','current','SRC-SAMR-DB21T-1745-2009','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=91D99E4DE0282E24E05397BE0A0A3A10'],
        ['LN-04','辽宁省既有建筑绿色改造评价标准','DB21/T 3410-2021','current','SRC-SAMR-DB21T-3410-2021','https://std.samr.gov.cn/db/search/stdDBDetailed?id=C362B3DB6272A067E05397BE0A0A1ED8'],
        ['LN-05','预应力混凝土管桩基础技术规程','DB21/T 1565-2015','non_current','SRC-SAMR-DB21T-1565-2015-UPDATE','https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D2E702E24E05397BE0A0A3A10','已替代','2025-08-30','→ DB21/T 1565-2025《预应力混凝土管桩基础技术规程》',['DB21/T 1565-2025']],
        ['LN-06','预应力混凝土管桩基础技术规程','DB21/T 1565-2025','current','SRC-SAMR-DB21T-1565-2025','https://std.samr.gov.cn/db/search/stdDBDetailed?id=3D279E455EBF2A8FE06397BE0A0A7BE6'],
        ['LN-07','多层装配式钢结构建筑技术标准','DB21/T 3196-2019','current','SRC-SAMR-DB21T-3196-2019','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=9A6D0B5D94303E0BE05397BE0A0AB704'],
        ['LN-08','绿色建筑评价标准','DB21/T 2017-2022','current','SRC-SAMR-DB21T-2017-2022','https://std.samr.gov.cn/db/search/stdDBDetailed?id=DDAEF7147B102E93E05397BE0A0AAA92']
      ]
    },
    '吉林省': {
      aliases: ['吉林','吉林省','长春','长春市'],
      records: [
        ['JL-01','螺旋锥体挤土压灌桩技术标准','DB22/T 5008-2018','non_current','SRC-SAMR-DB22T-5008-2018-UPDATE','https://std.samr.gov.cn/db/search/stdDBDetailed?id=D7B84D7F3BF945E5E05397BE0A0A47D2','已替代','2023-07-12','→ DB22/T 5008-2023《螺旋锥体挤土压灌桩技术标准》',['DB22/T 5008-2023']],
        ['JL-02','螺旋锥体挤土压灌桩技术标准','DB22/T 5008-2023','current','SRC-SAMR-DB22T-5008-2023','https://std.samr.gov.cn/db/search/stdDBDetailed?id=00F6A069E8B7FC7BE06397BE0A0AB9E2'],
        ['JL-03','双静压管桩技术标准','DB22/T 5026-2019','current','SRC-SAMR-DB22T-5026-2019','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=D7B6988FDA4FAABEE05397BE0A0A1B36'],
        ['JL-04','绿色建筑评价标准','DB22/T 5045-2020','non_current','SRC-SAMR-DB22T-5045-2020-REPEAL','https://std.samr.gov.cn/db/search/stdDBDetailed?id=D7B6988FDA11AABEE05397BE0A0A1B36','已废止','2026-05-01','平台未注明替代文件',[]],
        ['JL-05','绿色建筑设计标准','DB22/T 5055-2021','non_current','SRC-SAMR-DB22T-5055-2021-REPEAL','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=D7B6988FD9F6AABEE05397BE0A0A1B36','已废止','平台未载明日期','平台未注明替代文件',[]],
        ['JL-06','预拌砂浆应用技术标准','DB22/T 5056-2021','current','SRC-SAMR-DB22T-5056-2021','https://std.samr.gov.cn/db/search/stdDBDetailed?id=D7B6988FD9F7AABEE05397BE0A0A1B36'],
        ['JL-07','长螺旋钻孔压灌混凝土桩基础技术规程','DB22/T 5090-2014','current','SRC-SAMR-DB22T-5090-2014','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=17D5144C5F1F6F77E06397BE0A0ADFD5'],
        ['JL-08','预应力混凝土桩基础技术标准','DB22/T 5159-2024','current','SRC-JL-JST-DB22T-5159-2024','https://jst.jl.gov.cn/zwgk/dfnzh/jlsgcjsdfbzqwgk/202406/t20240624_3247890.html']
      ]
    },
    '黑龙江省': {
      aliases: ['黑龙江','黑龙江省','哈尔滨','哈尔滨市'],
      records: [
        ['HLJ-01','黑龙江省建设施工现场安全生产标准化实施标准','DB23/T 1318-2020','current','SRC-SAMR-DB23T-1318-2020','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=ABA58E1641331CE8E05397BE0A0AD33C'],
        ['HLJ-02','建筑地基基础设计规程','DB23/T 902-2019','current','SRC-SAMR-DB23T-902-2019','https://std.samr.gov.cn/db/search/stdDBDetailed?id=9A5BB811ED2C3E9DE05397BE0A0AA9A0'],
        ['HLJ-03','黑龙江省建筑与市政地基基础检测技术标准','DB23/T 3822-2024','current','SRC-SAMR-DB23T-3822-2024','https://std.samr.gov.cn/db/search/stdDBDetailed?id=22D43926AD7B09FAE06397BE0A0AAED7'],
        ['HLJ-04','建筑屋面结构雪荷载设计标准','DB23/T 4000-2026','current','SRC-SAMR-DB23T-4000-2026','https://ba.sacinfo.org.cn/portal/online/7b934d5136df194a1654b561b1b9e275f3b8fce04e0824396d490ffd0f93d73a'],
        ['HLJ-05','黑龙江省超低能耗建筑检测技术标准','DB23/T 3559-2023','current','SRC-SAMR-DB23T-3559-2023','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=0201987C77EA494EE06397BE0A0ABE85'],
        ['HLJ-06','黑龙江省既有建筑绿色低碳改造技术标准','DB23/T 4057-2026','pending','SRC-SAMR-DB23T-4057-2026','https://std.samr.gov.cn/db/search/stdDBDetailed?id=597570A5C6113233E06397BE0A0ABA8E','已发布，尚未实施','2026-09-28实施'],
        ['HLJ-07','黑龙江省地震安全性评价场地地震工程地质条件钻孔标准化数据规则','DB23/T 3486-2023','current','SRC-SAMR-DB23T-3486-2023','https://std.samr.gov.cn/db/search/stdDBDetailed?id=020006B60461C724E06397BE0A0A4179']
      ]
    },
    '安徽省': {
      aliases: ['安徽','安徽省','合肥','合肥市'],
      records: [
        ['AH-01','装配式钢结构预制墙板应用技术规程','DB34/T 3953-2021','current','SRC-SAMR-DB34T-3953-2021','https://std.samr.gov.cn/db/search/stdDBDetailed?id=C9E4811D5A2E3A47E05397BE0A0AA777'],
        ['AH-02','建筑墙式金属阻尼器减震技术规程','DB34/T 3957-2021','current','SRC-SAMR-DB34T-3957-2021','https://std.samr.gov.cn/db/search/stdDBDetailed?id=C9E4811D5A323A47E05397BE0A0AA777'],
        ['AH-03','装配式钢-混叠合柱框架结构技术规程','DB34/T 3958-2021','non_current','SRC-SAMR-DB34T-3958-2021-REPEAL','https://dbba.sacinfo.org.cn/stdDetail/25b01df15e92de0d4751342b0f9d4c80417d548172b8f05747b786d77db26733','已废止','平台未载明日期','平台未注明替代文件',[]],
        ['AH-04','住宅工程质量通病防治技术规程','DB34/1659-2012','non_current','SRC-SAMR-DB34-1659-2012-UPDATE','https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D517E2E24E05397BE0A0A3A10','已替代','2022-05-29','→ DB34/1659-2022《住宅工程质量常见问题防治技术规程》',['DB34/1659-2022']],
        ['AH-05','住宅工程质量常见问题防治技术规程','DB34/1659-2022','current','SRC-SAMR-DB34-1659-2022','https://std.samr.gov.cn/db/search/stdDBDetailed?id=DE3E818AF78EDBBEE05397BE0A0A35A2'],
        ['AH-06','建筑工程施工质量验收统一标准','DB34/5005-2014','pending','SRC-AH-CABP-DB34-5005-2014','https://ebook.chinabuilding.com.cn/zbooklib/book/detail/show?SiteID=1&bookID=62112','出版库显示现行','省厅现行目录待核'],
        ['AH-07','装配式混凝土结构技术规程','DB34/T 5018-2015','pending','SRC-AH-PUBLISHER-DB34T-5018-2015','https://www.biaozhuns.com/archives/20210828/show-294809-24-1.html','已发布施行','现行状态待省厅确认']
      ]
    },
    '福建省': {
      aliases: ['福建','福建省','福州','福州市','厦门','厦门市'],
      records: [
        ['FJ-01','福建省桩基础与地下结构防腐蚀技术标准','DBJ/T 13-200-2025','current','SRC-FJ-ZJT-DBJT13-200-2025','https://zjt.fujian.gov.cn/xxgk/zfxxgkzl/xxgkml/dfxfgzfgzhgfxwj/jskj_3794/202503/t20250324_6787101.htm'],
        ['FJ-02','桩基础与地下结构防腐蚀技术规程','DBJ/T 13-200-2014','non_current','SRC-FJ-ZJT-DBJT13-200-2025-REPLACE','https://zjt.fujian.gov.cn/xxgk/zfxxgkzl/xxgkml/dfxfgzfgzhgfxwj/jskj_3794/202503/P020250324636190031271.pdf','已替代','2025-06-01','→ DBJ/T 13-200-2025《福建省桩基础与地下结构防腐蚀技术标准》',['DBJ/T 13-200-2025']],
        ['FJ-03','建筑与市政工程地基处理技术标准','DBJ/T 13-471-2024','current','SRC-FJ-ZJT-DBJT13-471-2024','https://zjt.fujian.gov.cn/xxgk/zfxxgkzl/xxgkml/dfxfgzfgzhgfxwj/jskj_3794/202501/t20250122_6706689.htm'],
        ['FJ-04','建筑地基检测技术规程','DBJ/T 13-146-2012','pending','SRC-FJ-ZJT-DBJT13-146-2012','https://zjt.fujian.gov.cn/ztzl/wqzt/gcjsbzzl/dfbz/xxfb/201202/t20120214_2856577.htm','官网已发布','废止状态待核'],
        ['FJ-05','福建省既有建筑地基基础检测技术规程','DBJ/T 13-291-2018','current','SRC-FJ-ZJT-DBJT13-291-2018','https://zjt.fujian.gov.cn/xxgk/zfxxgkzl/xxgkml/dfxfgzfgzhgfxwj/jskj_3794/201807/t20180731_3597503.htm'],
        ['FJ-06','福建省建筑结构风压规程','DBJ/T 13-141-2011','pending','SRC-FJ-ZJT-DBJT13-141-2011','https://zjt.fujian.gov.cn/hygl/kxjs/wjhb/201107/t20110728_2791522.htm','官网已发布','废止状态待核'],
        ['FJ-07','旋挖成孔灌注桩工程技术规程','DBJ/T 13-301-2018','pending','SRC-FJ-IMA-DBJT13-301-2018','https://zjt.fujian.gov.cn/hygl/kxjs/jsbz/','待省厅复核','已收录原始目录'],
        ['FJ-08','灌注桩后注浆施工技术规程','DBJ/T 13-247-2016','pending','SRC-FJ-IMA-DBJT13-247-2016','https://zjt.fujian.gov.cn/hygl/kxjs/jsbz/','待省厅复核','已收录原始目录'],
        ['FJ-09','福建省建筑工程常见质量问题控制规程','DBJ/T 13-107-2015','pending','SRC-FJ-IMA-DBJT13-107-2015','https://zjt.fujian.gov.cn/hygl/kxjs/jsbz/','待省厅复核','已收录原始目录'],
        ['FJ-10','福建省既有建筑改造提升工程结构加固技术标准','DBJ/T 13-212-2024','current','SRC-FJ-ZJT-DBJT13-212-2024','https://zjt.fujian.gov.cn/xxgk/zfxxgkzl/xxgkml/dfxfgzfgzhgfxwj/jskj_3794/202410/t20241029_6555511.htm']
      ]
    },
    '江西省': {
      aliases: ['江西','江西省','南昌','南昌市','九江','九江市'],
      records: [
        ['JX-01','建筑与市政地基基础技术标准','DBJ/T 36-061-2021','pending','SRC-JX-ZJT-DISCOVERY-DBJT36-061-2021','https://zjt.jiangxi.gov.cn/','已发布施行','省厅现行目录待核'],
        ['JX-02','桥梁工程清水混凝土施工技术规程','DB36/T 1009-2018','pending','SRC-SAMR-SEARCH-DB36T-1009-2018','https://std.samr.gov.cn/search/stdPage?q=DB36%2FT%201009-2018','国家平台已收录','现行状态待核']
      ]
    },
    '山东省': {
      aliases: ['山东','山东省','济南','济南市','青岛','青岛市'],
      records: [
        ['SD-01','建筑工程抗震性态设计规范','DB37/T 5055-2016','non_current','SRC-SAMR-DB37T-5055-2016','https://std.samr.gov.cn/db/search/stdDBDetailed?id=DFBC2F851D365FEAE05397BE0A0ABF39','已替代','2024-08-29','→ DB37/T 5055-2024《建筑工程抗震性态设计标准》',['DB37/T 5055-2024']],
        ['SD-02','建筑工程抗震性态设计标准','DB37/T 5055-2024','non_current','SRC-SAMR-DB37T-5055-2024','https://std.samr.gov.cn/db/search/stdDBDetailed?id=490AA99A3A219D72E06397BE0A0AA7AC','已废止','2026-06-05','国家平台未列替代标准',[]],
        ['SD-03','建筑岩土工程勘察设计规范','DB37/5052-2015','pending','SRC-SAMR-SEARCH-DB37-5052-2015','https://std.samr.gov.cn/search/stdPage?q=DB37%2F5052-2015','国家平台已收录','现行状态待核'],
        ['SD-04','钢结构装配式建筑楼板应用技术规程','DB37/T 5180-2021','non_current','SRC-SAMR-DB37T-5180-2021','https://std.samr.gov.cn/db/search/stdDBDetailed?id=DFD0629FECEA41ABE05397BE0A0A7E58','已废止','2026-06-30','国家平台未列替代标准',[]],
        ['SD-05','装配式钢结构建筑技术规程','DB37/T 5115-2018','current','SRC-SAMR-DB37T-5115-2018','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=DFBEBC33A8C02042E05397BE0A0A751D'],
        ['SD-06','住宅工程质量常见问题防控技术标准','DB37/T 5157-2020','current','SRC-SAMR-DB37T-5157-2020','https://std.samr.gov.cn/db/search/stdDBDetailed?id=DFCDF7D98A916D10E05397BE0A0A9E53'],
        ['SD-07','绿色建筑设计标准','DB37/T 5043-2021','current','SRC-SAMR-DB37T-5043-2021','https://std.samr.gov.cn/db/search/stdDBDetailed?id=DFCF96C6247407B8E05397BE0A0A8E64'],
        ['SD-08','钢结构装配式建筑外墙板应用技术规程','DB37/T 5179-2021','pending','SRC-SAMR-SEARCH-DB37T-5179-2021','https://std.samr.gov.cn/search/stdPage?q=DB37%2FT%205179-2021','国家平台待复核','已收录原始目录'],
        ['SD-09','绿色建筑评价标准','DB37/T 5097-2021','pending','SRC-SAMR-SEARCH-DB37T-5097-2021','https://std.samr.gov.cn/search/stdPage?q=DB37%2FT%205097-2021','国家平台待复核','已收录原始目录'],
        ['SD-10','区域性地震安全性评价技术规范','DB37/T 3646-2019','pending','SRC-SAMR-SEARCH-DB37T-3646-2019','https://std.samr.gov.cn/search/stdPage?q=DB37%2FT%203646-2019','国家平台待复核','已收录原始目录']
      ]
    },
    '河南省': {
      aliases: ['河南','河南省','郑州','郑州市'],
      records: [
        ['HA-01','河南省建筑地基基础勘察设计规范','DBJ41/138-2014','pending','SRC-HA-ZJT-DBJ41-138-2014','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核'],
        ['HA-02','湿陷性黄土地区勘察与地基处理技术标准','DBJ41/T 243-2021','pending','SRC-HA-ZJT-DBJ41T-243-2021','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核'],
        ['HA-03','CRB600H高强钢筋应用技术规程','DBJ41/T 167-2017','pending','SRC-HA-ZJT-DBJ41T-167-2017','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核'],
        ['HA-04','河南省装配式建筑评价标准','DBJ41/T 222-2019','non_current','SRC-HA-ZJT-DBJ41T-222-2024-REPLACE','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','已替代','2024版实施日待核','→ DBJ41/T 222-2024《河南省装配式建筑评价标准》',['DBJ41/T 222-2024']],
        ['HA-05','河南省装配式建筑评价标准','DBJ41/T 222-2024','pending','SRC-HA-ZJT-DBJ41T-222-2024','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','新版已发布','实施日待核'],
        ['HA-06','现浇石膏墙体应用技术标准','DBJ41/T 244-2021','pending','SRC-HA-ZJT-DBJ41T-244-2021','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核'],
        ['HA-07','超低能耗建筑施工及质量验收标准','DBJ41/T 247-2021','pending','SRC-HA-ZJT-DBJ41T-247-2021','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核'],
        ['HA-08','超低能耗公共建筑节能设计标准','DBJ41/T 246-2021','pending','SRC-HA-ZJT-DBJ41T-246-2021','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核'],
        ['HA-09','600MPa级热轧带肋钢筋应用技术标准','DBJ41/T 242-2021','pending','SRC-HA-ZJT-DBJ41T-242-2021','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核'],
        ['HA-10','木结构设计标准','DBJ41/T 239-2021','pending','SRC-HA-ZJT-DBJ41T-239-2021','https://hnjs.henan.gov.cn/xxgk/xxgkml/zcfg/bzgg/xzzq/','省厅公开库收录','现行状态待核']
      ]
    },
    '湖北省': {
      aliases: ['湖北','湖北省','武汉','武汉市'],
      records: [
        ['HB-01','建筑地基基础技术规范','DB42/242-2014','non_current','SRC-HB-ZJT-DB42T-242-2026-REPLACE','https://zjt.hubei.gov.cn/zfxxgk/zc/qtzdgkwj/202606/t20260616_5959289.shtml','已替代','2026-08-03','→ DB42/T 242-2026《建筑地基基础技术标准》',['DB42/T 242-2026']],
        ['HB-02','建筑地基基础技术标准','DB42/T 242-2026','current','SRC-HB-ZJT-DB42T-242-2026','https://zjt.hubei.gov.cn/zfxxgk/zc/qtzdgkwj/202606/t20260616_5959289.shtml'],
        ['HB-03','建筑防水工程技术规范','DB42/T 1386-2018','non_current','SRC-SAMR-DB42T-1386-2018','https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D9AC02E24E05397BE0A0A3A10','已替代','2025-12-20','→ DB42/T 1386-2025《建筑防水工程技术标准》',['DB42/T 1386-2025']],
        ['HB-04','建筑防水工程技术标准','DB42/T 1386-2025','current','SRC-SAMR-DB42T-1386-2025','https://std.samr.gov.cn/db/search/stdDBDetailed?id=3E6DA46A1CF82AA1E06397BE0A0ADA0F'],
        ['HB-05','预应力混凝土管桩基础技术规程','DB42/489-2008','pending','SRC-SAMR-SEARCH-DB42-489-2008','https://std.samr.gov.cn/search/stdPage?q=DB42%2F489-2008','国家平台待复核','已收录原始目录'],
        ['HB-06','蒸压加气混凝土砌块工程技术规程','DB42/T 268-2012','pending','SRC-SAMR-SEARCH-DB42T-268-2012','https://std.samr.gov.cn/search/stdPage?q=DB42%2FT%20268-2012','国家平台待复核','已收录原始目录'],
        ['HB-07','CRB600H高强钢筋应用技术规程','DB42/T 1345-2018','non_current','SRC-SAMR-DB42T-1345-2018','https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=91D99E4D9EE62E24E05397BE0A0A3A10','已废止','平台未载明日期','国家平台未列替代标准',[]],
        ['HB-08','高强热轧带肋钢筋应用技术规程','DB42/T 1534-2019','non_current','SRC-SAMR-DB42T-1534-2019','https://std.samr.gov.cn/db/search/stdDBDetailed?id=9C7741AAF8FC3BA3E05397BE0A0A70CC','已废止','2024-05-11','国家平台未列替代标准',[]],
        ['HB-09','岩溶地区勘察设计与施工技术规程','DB4201/T 632-2020','current','SRC-SAMR-DB4201T-632-2020','https://std.samr.gov.cn/db/search/stdDBDetailed?id=B7B9953AF8171C55E05397BE0A0AAC6D']
      ]
    },
    '湖南省': {
      aliases: ['湖南','湖南省','长沙','长沙市'],
      records: [
        ['HUN-01','湖南省地下工程混凝土结构自防水技术标准','DBJ43/T 360-2020','pending','SRC-HUN-ZJT-DBJ43T-360-2020','https://zjt.hunan.gov.cn/zjt/xxgk/xinxigongkaimulu/tzgg/tzgg2jzjnykj/202106/29310058/files/a9eedd738e17418ca424b11938a58344.pdf','官网正文可核','现行状态待核'],
        ['HUN-02','住宅工程质量常见问题防治技术规程','DBJ43/T 306-2014','pending','SRC-HUN-IMA-DBJ43T-306-2014','https://zjt.hunan.gov.cn/zjt/xxgk/xinxigongkaimulu/tzgg/tzgg2jzjnykj/','省厅目录待核','已收录原始目录'],
        ['HUN-03','湖南省绿色装配式建筑评价标准','DBJ43/T 332-2018','pending','SRC-HUN-IMA-DBJ43T-332-2018','https://zjt.hunan.gov.cn/zjt/xxgk/xinxigongkaimulu/tzgg/tzgg2jzjnykj/','省厅目录待核','已收录原始目录']
      ]
    },
    '广西壮族自治区': {
      aliases: ['广西','广西壮族自治区','南宁','南宁市'],
      records: [
        ['GX-01','广西膨胀土地区建筑勘察设计施工技术规程','DB45/T 396-2007','non_current','SRC-SAMR-DB45T-396-2007','https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D931A2E24E05397BE0A0A3A10','已替代','2022-02-28','→ DB45/T 396-2022《膨胀土地区建筑技术规程》',['DB45/T 396-2022']],
        ['GX-02','膨胀土地区建筑技术规程','DB45/T 396-2022','current','SRC-SAMR-DB45T-396-2022','https://std.samr.gov.cn/db/search/stdDBDetailed?id=D9995C014BB4EFACE05397BE0A0A7C9F'],
        ['GX-03','广西建筑地基基础设计规范','DBJ45/003-2015','pending','SRC-GX-IMA-DBJ45-003-2015','https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/wjtz/','自治区目录待核','已收录原始目录'],
        ['GX-04','岩溶地区建筑地基基础技术规范','DBJ45/024-2016','pending','SRC-GX-IMA-DBJ45-024-2016','https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/wjtz/','自治区目录待核','已收录原始目录'],
        ['GX-05','广西岩土工程勘察规范','DBJ/T45-066-2018','pending','SRC-GX-IMA-DBJT45-066-2018','https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/wjtz/','自治区目录待核','已收录原始目录'],
        ['GX-06','超长混凝土结构无缝施工技术规程','DBJ/T45-047-2017','pending','SRC-GX-IMA-DBJT45-047-2017','https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/wjtz/','自治区目录待核','已收录原始目录'],
        ['GX-07','预应力混凝土管桩建筑技术规程','DBJ/T45-007-2012','pending','SRC-GX-IMA-DBJT45-007-2012','https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/wjtz/','自治区目录待核','已收录原始目录'],
        ['GX-08','岩溶地区桩基技术规范','DBJ/T45-082-2019','pending','SRC-GX-ZJT-REVIEW-DBJT45-082-2019','https://zjt.gxzf.gov.cn/zfxxgk/fdzdgknr/wjtz/t26091038.shtml','复审结论：修订','修订完成前继续核查']
      ]
    },
    '四川省': {
      aliases: ["四川","四川省","成都","成都市"],
      records: [
        ["SC-01","四川省建筑地基基础检测技术规程","DBJ51/T 014-2013","non_current","SRC-SC-ZJT-DBJ51T014-2013","https://jst.sc.gov.cn/scjst/bzgf/2015/10/1/500dba830b394d7aa8d54de1bbd9621d/files/%E5%9B%9B%E5%B7%9D%E7%9C%81%E5%BB%BA%E7%AD%91%E5%9C%B0%E5%9F%BA%E5%9F%BA%E7%A1%80%E6%A3%80%E6%B5%8B%E6%8A%80%E6%9C%AF%E8%A7%84%E7%A8%8B.pdf","已替代","2021版实施日待核","→ DBJ51/014-2021《四川省建筑地基基础检测技术规程》",["DBJ51/014-2021"]],
        ["SC-02","四川省建筑地基基础检测技术规程","DBJ51/014-2021","current","SRC-SC-ZJT-DBJ51-014-2021","https://jst.sc.gov.cn/scjst/release/2021/7/8/393f03a97cd549d3857ee627d2d0190a/files/11dd6b5ec63a40f0a16377dd8ca161a7.pdf","现行"],
        ["SC-03","四川省旋挖钻孔灌注桩基技术规程","DBJ51/T 062-2016","current","SRC-SC-ZJT-2025-SYSTEM-DBJ51T062","https://jst.sc.gov.cn/scjst/gongshitg/2025/4/15/e03795f7202742268c3da43ac03c0c64/files/%E4%BA%8C%E3%80%81%E5%BB%BA%E7%AD%91%E5%B7%A5%E7%A8%8B%E8%AE%BE%E8%AE%A1%E9%83%A8%E5%88%86%EF%BC%88%E4%B8%BB%E7%BC%96%E5%8D%95%E4%BD%8D%EF%BC%9A%E4%B8%AD%E5%9B%BD%E5%BB%BA%E7%AD%91%E8%A5%BF%E5%8D%97%E8%AE%BE%E8%AE%A1%E7%A0%94%E7%A9%B6%E9%99%A2%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8%EF%BC%89.pdf","现行"],
        ["SC-04","四川省建筑工程清水混凝土施工技术规程","DBJ51/T 065-2016","pending","SRC-SC-IMA-DBJ51T065-2016","https://jst.sc.gov.cn/scjst/bzgf/gcjsdfbz.shtml","省厅目录待核","已收录原始目录"],
        ["SC-05","四川省建筑地下结构抗浮锚杆技术标准","DBJ51/T 102-2018","current","SRC-SC-ZJT-2025-SYSTEM-DBJ51T102","https://jst.sc.gov.cn/scjst/gongshitg/2025/4/15/e03795f7202742268c3da43ac03c0c64/files/%E4%B8%80%E3%80%81%E5%B7%A5%E7%A8%8B%E5%8B%98%E5%AF%9F%E6%B5%8B%E9%87%8F%E4%B8%8E%E5%BB%BA%E7%AD%91%E5%9C%B0%E5%9F%BA%E5%9F%BA%E7%A1%80%E9%83%A8%E5%88%86%EF%BC%88%E4%B8%BB%E7%BC%96%E5%8D%95%E4%BD%8D%EF%BC%9A%E4%B8%AD%E5%9B%BD%E5%BB%BA%E7%AD%91%E8%A5%BF%E5%8D%97%E5%8B%98%E5%AF%9F%E8%AE%BE%E8%AE%A1%E7%A0%94%E7%A9%B6%E9%99%A2%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8%EF%BC%89.pdf","现行"],
        ["SC-06","四川省住宅设计标准","DBJ51/168-2021","current","SRC-SC-ZJT-DBJ51-168-2021","https://jst.sc.gov.cn/scjst/release/2021/4/27/a3bc2266bcdf46bdaf4aa432428d2bee/files/%E3%80%8A%E5%9B%9B%E5%B7%9D%E7%9C%81%E4%BD%8F%E5%AE%85%E8%AE%BE%E8%AE%A1%E6%A0%87%E5%87%86%E3%80%8B%E5%BC%BA%E5%88%B6%E6%80%A7%E6%9D%A1%E6%96%87.pdf","现行"],
        ["SC-07","四川省绿色建筑设计标准","DGJ51/T 037-2015","pending","SRC-SC-IMA-DGJ51T037-2015","https://jst.sc.gov.cn/scjst/bzgf/gcjsdfbz.shtml","省厅目录待核","已收录原始目录"],
        ["SC-08","四川省绿色建筑评价标准","DGJ51/T 009-2018","pending","SRC-SC-IMA-DGJ51T009-2018","https://jst.sc.gov.cn/scjst/bzgf/gcjsdfbz.shtml","省厅目录待核","已收录原始目录"],
        ["SC-09","四川省抗震设防超限高层民用建筑工程界定标准","DB51/T 5058-2020","current","SRC-SC-ZJT-2025-OVERLIMIT-DB51T5058","https://jst.sc.gov.cn/scjst/gfxwj/2025/9/5/a19a8a16e7c24914852d72ccf52adff3/files/%E5%9B%9B%E5%B7%9D%E7%9C%81%E8%B6%85%E9%99%90%E9%AB%98%E5%B1%82%E5%BB%BA%E7%AD%91%E5%B7%A5%E7%A8%8B%E6%8A%97%E9%9C%87%E8%AE%BE%E9%98%B2%E5%AE%A1%E6%89%B9%E7%AE%A1%E7%90%86%E5%8A%9E%E6%B3%95.pdf","现行"]
      ]
    },
    '贵州省': {
      aliases: ["贵州","贵州省","贵阳","贵阳市"],
      records: [
        ["GZ-01","贵州建筑桩基设计与施工技术规程","DBJ52/T 088-2018","pending","SRC-GZ-IMA-DBJ52T088-2018","https://zfcxjst.guizhou.gov.cn/","省厅目录待核","已收录原始目录"],
        ["GZ-02","贵州建筑岩土工程技术规范","DBJ52/T 046-2018","pending","SRC-GZ-IMA-DBJ52T046-2018","https://zfcxjst.guizhou.gov.cn/","省厅目录待核","已收录原始目录"],
        ["GZ-03","贵州建筑地基基础设计规范","DBJ52/T 045-2018","pending","SRC-GZ-IMA-DBJ52T045-2018","https://zfcxjst.guizhou.gov.cn/","省厅目录待核","已收录原始目录"],
        ["GZ-04","岩溶地区建设工程勘察规范","DB52/T 1336-2018","current","SRC-SAMR-DB52T1336-2018","https://std.samr.gov.cn/db/search/stdDBDetailed?id=9347D23FBE75D5C0E05397BE0A0AF5D4","现行"],
        ["GZ-05","钢筋位置测定仪校准规范","DBJ52/080-2016","pending","SRC-GZ-IMA-DBJ52-080-2016","https://zfcxjst.guizhou.gov.cn/","省厅目录待核","已收录原始目录"],
        ["GZ-06","贵州省装配式建筑评价标准","DBJ52/T 100-2020","pending","SRC-GZ-IMA-DBJ52T100-2020","https://zfcxjst.guizhou.gov.cn/","省厅目录待核","已收录原始目录"],
        ["GZ-07","贵州省坡地民用建筑设计防火规范","DBJ52-062-2013","pending","SRC-GZ-IMA-DBJ52-062-2013","https://zfcxjst.guizhou.gov.cn/","省厅目录待核","已收录原始目录"]
      ]
    },
    '西藏自治区': {
      aliases: ["西藏","西藏自治区","拉萨","拉萨市"],
      records: [
        ["XZ-01","建筑工程隔震与减震技术规程","DB54/T 0268-2022","current","SRC-SAMR-DB54T0268-2022","https://std.samr.gov.cn/db/search/stdDBDetailed?id=F105B855A88878DAE05397BE0A0ADB06","现行"]
      ]
    },
    '陕西省': {
      aliases: ["陕西","陕西省","西安","西安市"],
      records: [
        ["SN-01","预应力混凝土管桩基础技术规程","DBJ61/T 101-2015","pending","SRC-SN-IMA-DBJ61T101-2015","https://js.shaanxi.gov.cn/sy/yw/gcjsbz/","省厅目录待核","已收录原始目录"],
        ["SN-02","西安地裂缝场地勘察与工程设计规程","DBJ61/T 182-2021","pending","SRC-SN-CCGP-DBJ61T182-2021","https://www.ccgp-shaanxi.gov.cn/freecms/site/shaanxi/ggxx/info/2023/8a69c14b8c666e6a018c676ce9580a6e.html","后续官网仍引用","现行状态待核"],
        ["SN-03","地下工程防水施工工艺标准","DBJ/T61-35-2016","pending","SRC-SN-IMA-DBJT61-35-2016","https://js.shaanxi.gov.cn/sy/yw/gcjsbz/","省厅目录待核","已收录原始目录"]
      ]
    },
    '甘肃省': {
      aliases: ["甘肃","甘肃省","兰州","兰州市"],
      records: [
        ["GS-01","大厚度湿陷性黄土场地建筑地基处理技术规程","DB62/T25-3060-2012","pending","SRC-GS-ZJT-2021-REVIEW-3060","https://zjt.gansu.gov.cn/zjt/c108286/202105/f6552841791b478ea72d0e1499606031/files/10187929d8474b9a9d1000f665541a88.pdf","2021复审继续有效","后续状态待核"],
        ["GS-02","预应力混凝土管桩基础技术规程","DB62/T25-3099-2015","pending","SRC-GS-ZJT-2021-REVIEW-3099","https://zjt.gansu.gov.cn/zjt/c108286/202105/f6552841791b478ea72d0e1499606031/files/10187929d8474b9a9d1000f665541a88.pdf","2021复审继续有效","后续状态待核"],
        ["GS-03","甘肃省建筑抗震设计规程","DB62/T25-3055-2011","non_current","SRC-GS-ZJT-DB62T3055-2020-REPLACE","https://zjt.gansu.gov.cn/zjt/c108355/202101/d7d28b8db64a4c67aa9e18b87a5fc174/files/6531f8c385a74155a6cace26b82f8174.pdf","已替代","2021-05-01","→ DB62/T 3055-2020《建筑抗震设计规程》",["DB62/T 3055-2020"]],
        ["GS-04","建筑抗震设计规程","DB62/T 3055-2020","current","SRC-GS-ZJT-DB62T3055-2020","https://zjt.gansu.gov.cn/zjt/c108355/202101/d7d28b8db64a4c67aa9e18b87a5fc174/files/6531f8c385a74155a6cace26b82f8174.pdf","现行"],
        ["GS-05","清水混凝土结构技术规程","DB62/T25-3072-2013","pending","SRC-GS-ZJT-2021-REVIEW-3072","https://zjt.gansu.gov.cn/zjt/c108286/202105/f6552841791b478ea72d0e1499606031/files/10187929d8474b9a9d1000f665541a88.pdf","2021复审继续有效","后续状态待核"],
        ["GS-06","湿陷性黄土地区建筑灌注桩技术规程","DB62/T25-3084-2014","pending","SRC-GS-ZJT-2021-REVIEW-3084","https://zjt.gansu.gov.cn/zjt/c108286/202105/f6552841791b478ea72d0e1499606031/files/10187929d8474b9a9d1000f665541a88.pdf","2021复审继续有效","后续状态待核"],
        ["GS-07","灌注桩后注浆技术规程","DB62/T 3163-2019","pending","SRC-GS-ZJT-DB62T3163-2019","https://zjt.gansu.gov.cn/zjt/c108355/202105/56802e9f5f8643e5b781ccaac5fa68b8/files/bf68d4c212ee42548ce6e1f45a3e680f.pdf","官网正文可核","现行状态待核"],
        ["GS-08","高延性混凝土应用技术规程","DB62/T 3159-2018","pending","SRC-GS-IMA-DB62T3159-2018","https://zjt.gansu.gov.cn/zjt/c108355/list.shtml","省厅目录待核","已收录原始目录"],
        ["GS-09","自密实混凝土应用技术规程","DB62/T 3156-2018","pending","SRC-GS-IMA-DB62T3156-2018","https://zjt.gansu.gov.cn/zjt/c108355/list.shtml","省厅目录待核","已收录原始目录"],
        ["GS-10","住宅设计标准","DB62/T 3182-2020","pending","SRC-GS-IMA-DB62T3182-2020","https://zjt.gansu.gov.cn/zjt/c108355/list.shtml","省厅目录待核","已收录原始目录"]
      ]
    },
    '青海省': {
      aliases: ["青海","青海省","西宁","西宁市"],
      records: [
        ["QH-01","页岩砖及页岩多孔砖砌体结构设计与施工技术规程","DB63/868-2010","non_current","SRC-SAMR-DB63-868-2010","https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D658E2E24E05397BE0A0A3A10","已废止","2021-01-12","国家平台未列替代标准",[]],
        ["QH-02","裹体碎石桩法处理地基技术规程","DB63/T 885-2010","non_current","SRC-SAMR-DB63T885-2010","https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D26E42E24E05397BE0A0A3A10","已废止","2023-01-31","国家平台未列替代标准",[]],
        ["QH-03","砌体结构加固技术规程","DB63/1025-2011","non_current","SRC-SAMR-DB63-1025-2011","https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D51AB2E24E05397BE0A0A3A10","已废止","2021-01-12","国家平台未列替代标准",[]],
        ["QH-04","预拌砂浆生产应用技术规程","DB63/T 995-2011","non_current","SRC-SAMR-DB63T995-2011","https://std.samr.gov.cn/db/search/stdDBDetailed?id=91D99E4D4F862E24E05397BE0A0A3A10","已废止","2023-01-31","国家平台未列替代标准",[]]
      ]
    },
    '宁夏回族自治区': {
      aliases: ["宁夏","宁夏回族自治区","银川","银川市"],
      records: [
        ["NX-01","居住建筑节能设计标准","DB64/521-2022","current","SRC-NX-ZJT-CATALOG-DB64-521-2022","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/t20250529_4920847.html","现行"],
        ["NX-02","居住建筑节能设计标准","DB64/521-2013","non_current","SRC-NX-ZJT-CATALOG-DB64-521-2013-REPLACE","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/t20250529_4920847.html","已替代","2022-07-06","→ DB64/521-2022《居住建筑节能设计标准》",["DB64/521-2022"]],
        ["NX-03","绿色建筑设计标准","DB64/T 1544-2023","current","SRC-NX-ZJT-CATALOG-DB64T1544-2023","https://jst.nx.gov.cn/zwfw/gsgg/202303/t20230316_3997800.html","现行"],
        ["NX-04","绿色建筑设计标准","DB64/T 1544-2018","non_current","SRC-NX-ZJT-CATALOG-DB64T1544-2018-REPLACE","https://jst.nx.gov.cn/zwfw/gsgg/202303/t20230316_3997800.html","已替代","2023-05-21","→ DB64/T 1544-2023《绿色建筑设计标准》",["DB64/T 1544-2023"]],
        ["NX-05","住宅工程裂缝与渗漏防控技术规程","DB64/T 1872-2023","current","SRC-NX-ZJT-CATALOG-DB64T1872-2023","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/t20250529_4920847.html","现行"],
        ["NX-06","预拌混凝土质量管理规程","DB64/T 1873-2023","current","SRC-NX-ZJT-CATALOG-DB64T1873-2023","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/t20250529_4920847.html","现行"],
        ["NX-07","抗震宜居农房加固改造及新建技术规程","DB64/T 1875-2023","current","SRC-NX-ZJT-CATALOG-DB64T1875-2023","https://jst.nx.gov.cn/zwfw/gsgg/202303/t20230316_3997800.html","现行"],
        ["NX-08","农村住房抗震性能评估导则","DB64/T 1876-2023","current","SRC-NX-ZJT-CATALOG-DB64T1876-2023","https://jst.nx.gov.cn/zwfw/gsgg/202303/t20230316_3997800.html","现行"],
        ["NX-09","装配式混凝土结构技术规程","DB64/T 1914-2023","current","SRC-NX-ZJT-ANNOUNCE-DB64T1914-2023","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/P020231031378746596965.pdf","现行"],
        ["NX-10","房屋结构安全风险排查技术规程","DB64/T 2153-2025","current","SRC-NX-ZJT-CATALOG-DB64T2153-2025","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/t20250529_4920847.html","现行"],
        ["NX-11","复合保温板结构一体化系统应用技术规程","DB64/T 1539-2020","current","SRC-NX-ZJT-CATALOG-DB64T1539-2020","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/t20250529_4920847.html","现行"],
        ["NX-12","复合保温板结构一体化系统应用技术规程","DB64/T 1539-2018","non_current","SRC-NX-ZJT-CATALOG-DB64T1539-2018-REPLACE","https://jst.nx.gov.cn/zwgk/zcwjk/gcjsbz/202505/t20250529_4920847.html","已替代","2020-08-18","→ DB64/T 1539-2020《复合保温板结构一体化系统应用技术规程》",["DB64/T 1539-2020"]]
      ]
    },
    '新疆维吾尔自治区': {
      aliases: ["新疆","新疆维吾尔自治区","乌鲁木齐","乌鲁木齐市"],
      records: [
        ["XJ-01","建筑地基基础工程施工工艺标准","XJJ016-2005","pending","SRC-XJ-ZJT-2024-REVIEW-XJJ016","https://zjt.xinjiang.gov.cn/xjzjt/c113175/202410/3baafacf3360478eb675dd87145137ab.shtml","列入2024复审","复审结论待公布"],
        ["XJ-02","新疆维吾尔自治区实施国家2010（建筑结构）系列规范细则","XJJ012-2016","pending","SRC-XJ-ZJT-SYSTEM-XJJ012","https://zjt.xinjiang.gov.cn/xjzjt/c114248/202312/b86ed50a759d4d95891f4a5f2f77affe/files/%E3%80%8A%E4%BD%8F%E6%88%BF%E5%92%8C%E5%9F%8E%E4%B9%A1%E5%BB%BA%E8%AE%BE%E6%A0%87%E5%87%86%E4%BD%93%E7%B3%BB%E6%A1%86%E6%9E%B6%E3%80%8B%E4%BF%AE%E8%AE%A2%E7%89%88%E5%BE%81%E6%B1%82%E6%84%8F%E8%A7%81%E7%A8%BF.pdf","体系框架标为现行","同时标注拟修编"],
        ["XJ-03","新疆维吾尔自治区实施国家2001—2004系列岩土工程规范细则","XJJ035-2006","pending","SRC-XJ-IMA-XJJ035-2006","https://zjt.xinjiang.gov.cn/xjzjt/c113537/zwgk_list.shtml","自治区目录待核","已收录原始目录"],
        ["XJ-04","建筑消能减震应用技术规程","XJJ075-2016","pending","SRC-XJ-ZJT-2024-REVIEW-XJJ075","https://zjt.xinjiang.gov.cn/xjzjt/c113175/202410/3baafacf3360478eb675dd87145137ab.shtml","列入2024复审","复审结论待公布"],
        ["XJ-05","住宅设计标准","XJJ131-2021","pending","SRC-XJ-ZJT-XJJ131-2021","https://zjt.xinjiang.gov.cn/xjzjt/c113175/202105/080a7cc4b851496bb8f5d982c6a73d01.shtml","官网已发布","现行状态待核"],
        ["XJ-06","地下工程补偿收缩混凝土防腐阻锈防水抗裂技术标准","XJJ125-2020","pending","SRC-XJ-ZJT-XJJ125-2020","https://zjt.xinjiang.gov.cn/xjzjt/uploads/202212021604243i3trxxhdli.pdf","官网已发布施行","现行状态待核"],
        ["XJ-07","高性能混凝土应用技术规程","XJJ077-2017","pending","SRC-XJ-ZJT-2024-REVIEW-XJJ077","https://zjt.xinjiang.gov.cn/xjzjt/c113175/202410/3baafacf3360478eb675dd87145137ab.shtml","列入2024复审","复审结论待公布"],
        ["XJ-08","装配式混凝土结构工程检测技术标准","XJJ130-2021","pending","SRC-XJ-ZJT-XJJ130-2021","https://zjt.xinjiang.gov.cn/xjzjt/c113175/202105/60396fc061454e4188a03f07a5bf9dfe.shtml","官网已发布","现行状态待核"],
        ["XJ-09","住宅工程质量通病控制标准","XJJ129-2020","pending","SRC-XJ-ZJT-XJJ129-2020","https://zjt.xinjiang.gov.cn/xjzjt/c113537/zwgk_list_7.shtml","官网标准公告收录","现行状态待核"]
      ]
    },
    '内蒙古自治区': {
      aliases: ["内蒙古","内蒙古自治区","呼和浩特","呼和浩特市"],
      records: [
        ["NMG-01","居住建筑节能设计标准","DBJ03-35-2019","pending","SRC-NMG-ZJT-CITED-DBJ03-35-2019","https://zjt.nmg.gov.cn/IGI/upload/file/2022/07/15/202207150901519347kG.pdf","后续官网文件引用","现行目录待核"],
        ["NMG-02","公共建筑节能设计标准","DBJ03-27-2017","pending","SRC-NMG-ZJT-CITED-DBJ03-27-2017","https://zjt.nmg.gov.cn/IGI/upload/file/2022/07/15/202207150901519347kG.pdf","后续官网文件引用","现行目录待核"],
        ["NMG-03","建筑装配式混凝土结构工程施工及质量验收规程","DBJ/T03-103-2018","pending","SRC-NMG-ZJT-CITED-DBJT03-103-2018","https://zjt.nmg.gov.cn/IGI/upload/file/2022/01/14/20220114052032200KAx.pdf","官网后续文件称现行","现行目录待核"],
        ["NMG-04","房屋建筑和市政工程施工危险性较大的分部分项工程安全管理规程","DBJ03-107-2019","pending","SRC-NMG-ZJT-CITED-DBJ03-107-2019","https://zjt.nmg.gov.cn/IGI/upload/file/2021/09/28/20210928051254481Rb2.pdf","后续官网文件引用","现行目录待核"]
      ]
    }
  };
  var dataset = {
    as_of_date: '2026-09-27',
    provinces: Object.fromEntries(Object.entries(rawProvinces).map(function (entry) {
      return [entry[0], {
        aliases: entry[1].aliases,
        records: entry[1].records.map(function (row) {
          return {
            id: row[0], province: entry[0], category: 'local', title: row[1], code: row[2], status: row[3], status_label: row[6] || statusLabels[row[3]],
            source_id: row[4], source_url: row[5], status_date: row[7] || '', status_replacement: row[8] || '',
            replacement_codes: row[9] || []
          };
        })
      }];
    }))
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function provinceFor(rawValue) {
    if (!dataset) return null;
    var value = String(rawValue || '').trim().replace(/\s+/g, '');
    if (!value) return null;
    var entries = Object.entries(dataset.provinces || {});
    for (var i = 0; i < entries.length; i += 1) {
      var aliases = entries[i][1].aliases || [];
      if (entries[i][0] === value || aliases.indexOf(value) >= 0) return entries[i];
    }
    return null;
  }

  function clearRows() {
    var body = byId('local-regulation-body');
    if (body) body.replaceChildren();
  }

  function setMessage(message, kind) {
    var messageNode = byId('local-regulation-message');
    if (!messageNode) return;
    messageNode.textContent = message;
    messageNode.dataset.kind = kind || '';
  }

  function makeCell(text, className) {
    var td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function renderRecord(record) {
    var tr = document.createElement('tr');
    tr.dataset.sourceId = record.source_id;

    var nameCell = document.createElement('td');
    var name = document.createElement('strong');
    name.textContent = '《' + record.title + '》';
    var code = document.createElement('span');
    code.className = 'local-regulation-code';
    code.textContent = record.code;
    nameCell.append(name, code);

    var statusCell = document.createElement('td');
    statusCell.className = 'local-regulation-status status-' + record.status;
    var statusMain = document.createElement('span');
    statusMain.className = 'local-regulation-status-main';
    statusMain.textContent = record.status_label;
    statusCell.appendChild(statusMain);
    if (record.status_date) {
      var statusDate = document.createElement('span');
      statusDate.className = 'local-regulation-status-date';
      statusDate.textContent = record.status_date;
      statusCell.appendChild(statusDate);
    }
    if (record.status_replacement) {
      var statusReplacement = document.createElement('span');
      statusReplacement.className = 'local-regulation-status-replacement';
      if (record.status_label === '分拆替代') statusReplacement.classList.add('is-split');
      statusReplacement.textContent = record.status_replacement;
      statusCell.appendChild(statusReplacement);
    }
    var linkCell = document.createElement('td');
    var link = document.createElement('a');
    link.href = record.source_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '打开官网';
    link.setAttribute('aria-label', '打开《' + record.title + '》的权威原始网页');
    linkCell.appendChild(link);
    var selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.textContent = '添加到规范';
    selectButton.dataset.regulationSelect = record.source_id;
    selectButton.addEventListener('click',function(){
      window.dispatchEvent(new CustomEvent('workbuddy:local-regulation-selected',{detail:Object.assign({},record,{selected:selectButton.dataset.selected !== 'true'})}));
    });
    var actionCell = document.createElement('td');
    actionCell.className = 'local-regulation-actions';
    actionCell.appendChild(selectButton);

    tr.append(nameCell, statusCell, linkCell, actionCell);
    return tr;
  }

  var queryRecords = [];
  function queryLocalRegulations(event) {
    if (event) event.preventDefault();
    var input = byId('local-regulation-query');
    var tableWrap = byId('local-regulation-results');
    clearRows();
    queryRecords = [];

    var value = input ? input.value : '';
    if (!String(value).trim()) {
      tableWrap.hidden = true;
      setMessage('请输入省市名称。', 'empty');
      return false;
    }

    var match = provinceFor(value);
    if (!match) {
      tableWrap.hidden = true;
      setMessage('已覆盖全国31个省级地区（不含港澳台）；请输入省、市或省会名称。', 'empty');
      return false;
    }

    var body = byId('local-regulation-body');
    queryRecords = match[1].records;
    match[1].records.forEach(function (record) {
      body.appendChild(renderRecord(record));
    });
    tableWrap.hidden = false;
    refreshSelection();
    setMessage(match[0] + '地方规范查询结果（核查基准 ' + dataset.as_of_date + '）', 'success');
    return false;
  }

  window.queryLocalRegulations = queryLocalRegulations;
  function refreshSelection() {
    var selection = window.ExpansionWorkbench?.regulationSelection();
    var addAll = byId('local-regulation-add-all');
    if (addAll) {
      var remaining = queryRecords.some(function(record) { return !selection?.sourceIds.includes(record.source_id); });
      addAll.disabled = !selection?.editable || !remaining;
      addAll.textContent = queryRecords.length && !remaining ? '已全部添加' : '一键全部添加';
    }
    document.querySelectorAll('[data-regulation-select]').forEach(function(button) {
      var selected = Boolean(selection?.sourceIds.includes(button.dataset.regulationSelect));
      button.dataset.selected = String(selected);
      button.textContent = selected ? '已添加 · 移除' : '添加到规范';
      button.disabled = !selection?.editable;
    });
  }
  window.addEventListener('workbuddy:regulations-changed', refreshSelection);

  document.addEventListener('DOMContentLoaded', function () {
    byId('local-regulation-add-all')?.addEventListener('click', function () {
      if (queryRecords.length) window.dispatchEvent(new CustomEvent('workbuddy:local-regulations-add-all', {detail: queryRecords.map(function(record) { return Object.assign({},record,{selected:true}); })}));
    });
    var form = byId('local-regulation-form');
    var input = byId('local-regulation-query');
    if (form) form.addEventListener('submit', queryLocalRegulations);
    if (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        queryLocalRegulations(event);
      });
    }
    setMessage('已覆盖全国31个省级地区（不含港澳台）；目录仍在持续核全。', 'ready');
  });
})();
