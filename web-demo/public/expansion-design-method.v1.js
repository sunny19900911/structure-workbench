(function attachExpansionDesignMethod(root) {
  'use strict';

  const METHOD = Object.freeze({
    id: 'METHOD-EXPANSION-DESIGN-V1.1',
    version: '1.1.0',
    updatedAt: '2026-09-27',
    sourceId: 'SRC-ITER-YNTC2-20260927-001',
    sourcePriority: [
      'user_confirmed',
      'current_project_formal_source',
      'library_601_approved_regulation',
      'library_602_historical_reference',
      'ai_inference',
    ],
    rules: [
      '先确定结构单元边界，再确定结构体系和构件截面。',
      '逐层比较地下室、首层、标准层、大屋面和小屋面的柱墙布置，检查柱终止、错位、抽柱、梁托柱和梁托墙。',
      '普通构件与转换梁、转换柱、大跨梁和大悬挑等特殊构件分开表述。',
      '楼板厚度按地下室顶板、隔震层顶板、普通楼板和局部加强板分项表述。',
      '没有当前模型时只列不规则性候选，不把扭转、位移比或周期比写成已确认结论。',
      '周期、位移角、剪重比、隔震位移和支座结果只能采用当前模型，不从历史项目回填。',
      '发现资料冲突时保留不同取值和来源，按来源优先级给出建议并要求人工确认。',
    ],
    outputContract: Object.freeze({
      factTypes: ['source_fact', 'author_view', 'user_confirmed', 'ai_inference'],
      unknownValue: '待确认',
      currentModelOnly: [
        'periods',
        'story_drift',
        'torsional_displacement_ratio',
        'shear_weight_ratio',
        'isolation_displacement',
        'bearing_pressure_and_tension',
      ],
    }),
  });

  function triState(value) {
    if (value === true || value === 'true' || value === '有' || value === '需要' || value === '是') return true;
    if (value === false || value === 'false' || value === '无' || value === '不需要' || value === '否') return false;
    return null;
  }

  function extractSignals(text) {
    const source = String(text || '');
    const match = (pattern) => source.split(/[。；;\n，,]/).some(part => pattern.test(part) && !/(?:无|不设|没有|不采用|未发现|未设置|无需|建议|拟|尚未|待定|历史|相邻)/.test(part));
    return {
      transferMember: match(/梁抬柱|托柱转换|转换梁|转换柱|梁托柱|梁托墙|抽柱/),
      doubleColumnLines: match(/双柱线|双轴线|独立柱线|两道柱线/),
      seismicJoint: match(/抗震缝|结构缝|隔震缝|缝宽/),
      commonBasement: match(/整体地下室|共用(?:一层)?地下室|地下室连成整体|地下室不设缝/),
      largeOpening: match(/楼板大开洞|大洞口|开洞率|自动扶梯洞口|中庭洞口/),
      largeSpan: match(/大跨|跨度\s*(?:≥|>|不小于)\s*(?:18|20|24)|跨度\s*(?:18|20|24)\s*m/),
      longCantilever: match(/大悬挑|长悬挑|悬挑\s*(?:≥|>|不小于)\s*2/),
      verticalSetback: match(/竖向收进|立面收进|退台|楼层收进/),
      planIrregularity: match(/扭转不规则|凹凸不规则|楼板不连续|平面不规则|细腰/),
    };
  }

  function joinUnique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function run(snapshot) {
    const input = snapshot || {};
    const p = input.parameters || {};
    const signals = Object.assign({}, extractSignals(input.architectureText), input.signals || {});
    const hasBasement = triState(p.has_basement);
    const hasIsolation = triState(p.has_iso);
    const hasJoin = triState(p.has_join);
    const hasTransfer = triState(p.has_convert) === true || signals.transferMember;
    const hasLargeSpan = triState(p.has_longspan) === true || signals.largeSpan;
    const hasLargeOpening = signals.largeOpening;

    const irregularityCandidates = [];
    if (hasTransfer) irregularityCandidates.push('局部构件转换');
    if (signals.planIrregularity) irregularityCandidates.push('平面或扭转不规则');
    if (signals.verticalSetback) irregularityCandidates.push('竖向收进');
    if (hasLargeOpening) irregularityCandidates.push('楼板大开洞或不连续');
    if (hasLargeSpan || signals.longCantilever) irregularityCandidates.push('大跨度或大悬挑');

    const boundaryCandidate = hasBasement === true &&
      (signals.commonBasement || signals.doubleColumnLines || signals.seismicJoint || hasJoin === true)
      ? '优先复核“地上各结构单元分缝、地下室整体连接”的结构边界模式；最终以结构总平、地下室分缝图和隔震专项设计确认。'
      : '应结合结构总平、相邻单体双柱线、地下室轮廓和隔震缝要求确认结构单元边界；资料不足时不得直接假定为整体结构。';

    const specialMemberText = hasTransfer
      ? '已识别转换构件线索，普通框架梁与托柱转换梁、转换柱应分开给出截面和性能要求。'
      : '应逐层比较地下室、首层、标准层、大屋面和小屋面柱墙布置；如发现柱终止、错位、抽柱或梁托墙，应增列特殊转换构件，不得并入普通梁截面。';

    const slabZones = ['普通楼层板'];
    if (hasBasement === true) slabZones.unshift('地下室顶板');
    if (hasIsolation === true) slabZones.push('隔震层顶板');
    if (hasLargeOpening || irregularityCandidates.length) slabZones.push('洞口及不规则部位局部加强板');

    const irregularityText = irregularityCandidates.length
      ? `根据当前资料列出${joinUnique(irregularityCandidates).join('、')}等候选项；是否成立须由当前计算模型、结构平面和专业负责人确认。`
      : '当前资料尚不足以确认扭转、楼板不连续和竖向不规则；首版模型完成后应依据周期比、位移比、刚度和受剪承载力复核。';

    const system = p.struct_sys || '待确认的结构体系';
    const selection = `各单体结构体系与主要构件截面见表6.2-1。结构体系以统一技术措施确认的“${system}”及当前建筑功能、层数、高度、主要跨度和抗震条件为边界；框架柱、普通框架梁和次梁先给模型启动截面，再由轴压比、层间位移、承载力、裂缝挠度和建筑净高共同调整。${specialMemberText}`;
    const slab = `楼（屋）盖采用现浇钢筋混凝土梁板体系，板厚按${joinUnique(slabZones).join('、')}分别确定，不使用单一“楼板厚度”统括全部部位。${irregularityText}`;
    const review = `扩初阶段应完成逐层柱网差异、转换构件、结构单元边界和不规则性候选复核。周期、位移角、剪重比、隔震层最大位移及支座受力等指标仅采用当前项目模型；未导入当前模型时均保留为待确认，不沿用历史项目数值。`;

    return {
      methodId: METHOD.id,
      methodVersion: METHOD.version,
      sourceId: METHOD.sourceId,
      boundaryCandidate,
      irregularityCandidates: joinUnique(irregularityCandidates),
      slabZones: joinUnique(slabZones),
      currentModelOnly: METHOD.outputContract.currentModelOnly.slice(),
      outputs: { joint: boundaryCandidate, selection, slab, review },
      promptRules: METHOD.rules.slice(),
    };
  }

  root.WorkbenchExpansionMethod = Object.freeze({
    definition: METHOD,
    extractSignals,
    run,
  });
})(typeof window !== 'undefined' ? window : globalThis);
