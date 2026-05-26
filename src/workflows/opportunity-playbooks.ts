import type {
  OpportunityCatalystItem,
  OpportunityPlaybook,
  OpportunityPlaybookItem,
  OpportunitySummaryRecord,
} from './types';

function upcomingCatalyst(opportunity: OpportunitySummaryRecord): OpportunityCatalystItem | undefined {
  return opportunity.catalystCalendar.find((item) => item.status === 'upcoming');
}

function checklistItem(
  label: string,
  status: OpportunityPlaybookItem['status'],
  note?: string,
): OpportunityPlaybookItem {
  return {
    label,
    status,
    ...(note ? { note } : {}),
  };
}

function buildIpoPlaybook(opportunity: OpportunitySummaryRecord): OpportunityPlaybook {
  const catalyst = upcomingCatalyst(opportunity);
  const evidence = opportunity.ipoProfile?.evidence;
  const stance = opportunity.stage === 'ready' || opportunity.status === 'ready' ? 'act' : 'prepare';
  const whyNow = opportunity.heatInflection?.summary
    || catalyst
    ? `${opportunity.summary || opportunity.thesis || opportunity.title} ${catalyst ? `当前最近催化是 ${catalyst.label}${catalyst.dueAt ? ` (${catalyst.dueAt})` : ''}。` : ''}`.trim()
    : opportunity.summary || opportunity.thesis || '新代码已经进入跟踪窗口。';

  return {
    title: 'New Code Radar Playbook',
    stance,
    objective: '确认新代码是否从“早知道”升级成“可交易纯标的”。',
    whyNow,
    checklist: [
      checklistItem(
        '交易窗口',
        opportunity.ipoProfile?.officialTradingDate ? 'ready' : catalyst?.label.includes('交易窗口') ? 'watch' : 'missing',
        opportunity.ipoProfile?.officialTradingDate
          ? `已记录 ${opportunity.ipoProfile.officialTradingDate}`
          : evidence?.officialTradingDate?.note || catalyst?.note,
      ),
      checklistItem(
        '供给 overhang',
        opportunity.ipoProfile?.lockupDate || typeof opportunity.ipoProfile?.retainedStakePercent === 'number' ? 'ready' : 'watch',
        opportunity.supplyOverhang
          || evidence?.lockupDate?.note
          || '优先确认 retained stake / lockup / greenshoe.',
      ),
      checklistItem(
        '首份独立验证',
        opportunity.ipoProfile?.firstIndependentEarningsAt ? 'ready' : 'missing',
        opportunity.ipoProfile?.firstIndependentEarningsAt
          ? `首份独立财报 ${opportunity.ipoProfile.firstIndependentEarningsAt}`
          : evidence?.firstIndependentEarningsAt?.note || 'Not found in repo.',
      ),
      checklistItem(
        '分析链路',
        opportunity.latestMission ? 'ready' : 'watch',
        opportunity.latestMission
          ? `已关联 mission ${opportunity.latestMission.id}`
          : '建议至少跑一次 explore/analyze，避免只看 filing 不看执行结果。',
      ),
    ],
    nextStep: stance === 'act'
      ? '围绕交易窗口、供给变化和首份独立验证，补一轮 deep analyze。'
      : '先把交易日期、供给日历和首份独立验证补成高置信字段。',
  };
}

function buildRelayPlaybook(opportunity: OpportunitySummaryRecord): OpportunityPlaybook {
  const heat = opportunity.heatProfile;
  const stance = opportunity.heatInflection?.kind === 'breakdown' || opportunity.status === 'degraded'
    ? 'review'
    : heat?.validationStatus === 'confirmed' || opportunity.status === 'ready'
      ? 'act'
      : 'prepare';
  const whyNow = opportunity.heatInflection?.summary
    || opportunity.summary
    || heat?.validationSummary
    || '热量链已经形成，值得继续验证传导是否能走到二三层。';

  return {
    title: 'Heat Transfer Playbook',
    stance,
    objective: '确认龙头温度能否稳定传到瓶颈与二三层洼地。',
    whyNow,
    checklist: [
      checklistItem(
        'Leader 温度计',
        opportunity.leaderTicker || opportunity.primaryTicker ? 'ready' : 'missing',
        opportunity.heatProfile?.leaderHealth || '先明确谁在提供温度计。',
      ),
      checklistItem(
        '瓶颈层',
        (heat?.bottleneckTickers.length || 0) > 0 ? 'ready' : 'missing',
        (heat?.bottleneckTickers.length || 0) > 0
          ? `已识别 ${heat?.bottleneckTickers.slice(0, 3).join(', ')}`
          : '先补硬瓶颈，不要直接跳到边缘垃圾扩散。',
      ),
      checklistItem(
        '洼地层',
        (heat?.laggardTickers.length || 0) > 0 ? 'ready' : 'watch',
        (heat?.laggardTickers.length || 0) > 0
          ? `先盯 ${heat?.laggardTickers.slice(0, 3).join(', ')}`
          : '二三层洼地还不够明确。',
      ),
      checklistItem(
        '传导确认',
        heat?.validationStatus === 'confirmed' ? 'ready' : heat?.validationStatus === 'forming' ? 'watch' : 'missing',
        heat?.validationSummary || '优先观察 breadth、edge 和 validation 状态变化。',
      ),
      checklistItem(
        '执行验证',
        opportunity.latestMission ? 'ready' : 'watch',
        opportunity.latestMission
          ? `最近 mission 状态 ${opportunity.latestMission.status}`
          : '建议补一轮 analyze，验证龙头/瓶颈/洼地在任务结果里是否一致。',
      ),
    ],
    nextStep: stance === 'review'
      ? '先复核 leader、breadth 和 validation 破坏点，再决定是否降级 thesis。'
      : stance === 'act'
        ? '围绕 leader -> bottleneck -> laggard 做一次 focused analyze，确认当前最该表达的层级。'
        : '先补 leader health、瓶颈因果和 laggard 候选，再等下一次 validation 拐点。',
  };
}

function buildProxyPlaybook(opportunity: OpportunitySummaryRecord): OpportunityPlaybook {
  const proxy = opportunity.proxyProfile;
  const ignited = opportunity.latestEventType === 'proxy_ignited'
    || (
      opportunity.scores.purityScore >= 75
      && opportunity.scores.scarcityScore >= 70
      && (proxy?.legitimacyScore || 0) >= 70
    );
  const stance = opportunity.status === 'degraded' ? 'review' : ignited ? 'act' : 'prepare';
  const whyNow = opportunity.summary
    || proxy?.ruleStatus
    || opportunity.thesis
    || '市场正在寻找更纯、更稀缺、更容易讲清楚的公共符号。';

  return {
    title: 'Proxy Desk Playbook',
    stance,
    objective: '确认这个符号是否足够纯、稀缺、被规则正名，而且市场真的会买。',
    whyNow,
    checklist: [
      checklistItem(
        'Purity / Scarcity',
        opportunity.scores.purityScore >= 75 && opportunity.scores.scarcityScore >= 70 ? 'ready' : 'watch',
        `Purity ${opportunity.scores.purityScore} / Scarcity ${opportunity.scores.scarcityScore}`,
      ),
      checklistItem(
        '规则正名',
        (proxy?.legitimacyScore || 0) >= 70 ? 'ready' : 'watch',
        proxy?.ruleStatus || '规则状态还不够明确。',
      ),
      checklistItem(
        '可讲性',
        (proxy?.legibilityScore || 0) >= 70 ? 'ready' : 'watch',
        proxy?.mappingTarget || proxy?.identityNote || '先把“一句话故事”讲清楚。',
      ),
      checklistItem(
        '执行验证',
        opportunity.latestMission ? 'ready' : 'watch',
        opportunity.latestMission
          ? `最近 mission 状态 ${opportunity.latestMission.status}`
          : '建议至少跑一轮 analyze，避免只凭题材标签入场。',
      ),
    ],
    nextStep: stance === 'act'
      ? '把题材代理的规则状态、成交扩散和 mission 结果并排确认，再决定是否提高仓位。'
      : stance === 'review'
        ? '先确认规则状态或流动性是否恶化，再决定要不要降级为观察仓。'
        : '先补规则状态和一句话叙事，再观察市场是否真的把它当公共符号来买。',
  };
}

function buildFallbackPlaybook(opportunity: OpportunitySummaryRecord): OpportunityPlaybook {
  return {
    title: 'Opportunity Playbook',
    stance: opportunity.status === 'degraded' ? 'review' : 'prepare',
    objective: '先把交易对象结构化，再决定是继续跟踪还是进入执行。',
    whyNow: opportunity.summary || opportunity.thesis || opportunity.title,
    checklist: [
      checklistItem('核心 thesis', opportunity.thesis ? 'ready' : 'missing', opportunity.thesis || '先补一句话 thesis。'),
      checklistItem('核心代码', opportunity.primaryTicker || opportunity.leaderTicker || opportunity.proxyTicker ? 'ready' : 'watch'),
      checklistItem('执行验证', opportunity.latestMission ? 'ready' : 'watch'),
    ],
    nextStep: '先把机会对象补完整，再发起一次 analyze 形成底层证据。',
  };
}

export function buildOpportunityPlaybook(opportunity: OpportunitySummaryRecord): OpportunityPlaybook {
  switch (opportunity.type) {
    case 'ipo_spinout':
      return buildIpoPlaybook(opportunity);
    case 'relay_chain':
      return buildRelayPlaybook(opportunity);
    case 'proxy_narrative':
      return buildProxyPlaybook(opportunity);
    default:
      return buildFallbackPlaybook(opportunity);
  }
}

export function buildWhyNowSummary(opportunity: OpportunitySummaryRecord): string {
  return buildOpportunityPlaybook(opportunity).whyNow;
}
