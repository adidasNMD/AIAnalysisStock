import type { OpportunityCatalystItem, OpportunitySummary } from '../../api';
import { isRecoverableMissionStatus } from './recovery';

export type PreTradeChecklistStatus = 'pass' | 'warn' | 'block';
export type PreTradeReadiness = 'ready' | 'watch' | 'blocked';

export type PreTradeChecklistItem = {
  id: string;
  label: string;
  status: PreTradeChecklistStatus;
  detail: string;
  action?: string;
};

export type PreTradeChecklist = {
  readiness: PreTradeReadiness;
  label: string;
  score: number;
  blockers: number;
  warnings: number;
  items: PreTradeChecklistItem[];
  nextAction: string;
};

function statusRank(status: PreTradeChecklistStatus) {
  if (status === 'pass') return 2;
  if (status === 'warn') return 1;
  return 0;
}

function hasUpcomingCatalyst(opportunity: OpportunitySummary): OpportunityCatalystItem | undefined {
  return opportunity.catalystCalendar.find((item) => item.status === 'upcoming' || item.status === 'active');
}

function daysUntil(value?: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((timestamp - Date.now()) / dayMs);
}

function missionEvidenceItem(opportunity: OpportunitySummary): PreTradeChecklistItem {
  const status = opportunity.latestMission?.status;
  if (!status) {
    return {
      id: 'mission_evidence',
      label: 'Mission evidence',
      status: 'block',
      detail: '还没有关联 Mission，交易前缺少底层分析证据。',
      action: '先发起 analyze / review mission。',
    };
  }

  if (isRecoverableMissionStatus(status)) {
    return {
      id: 'mission_evidence',
      label: 'Mission evidence',
      status: 'block',
      detail: `最近 Mission 是 ${status}，需要恢复或复核后再进入执行。`,
      action: '使用恢复入口重跑或复核。',
    };
  }

  if (status === 'fully_enriched') {
    return {
      id: 'mission_evidence',
      label: 'Mission evidence',
      status: 'pass',
      detail: 'Mission 已完整跑通，具备执行前证据底座。',
    };
  }

  if (status === 'main_only') {
    return {
      id: 'mission_evidence',
      label: 'Mission evidence',
      status: 'warn',
      detail: 'Mission 只有主链路结果，缺少完整 enriched 验证。',
      action: '补一轮 deep analyze 或先降低仓位假设。',
    };
  }

  return {
    id: 'mission_evidence',
    label: 'Mission evidence',
    status: 'warn',
    detail: `Mission 当前是 ${status}，还不是可执行终态。`,
    action: '等待完成或打开任务确认进度。',
  };
}

function thesisItem(opportunity: OpportunitySummary): PreTradeChecklistItem {
  if (opportunity.status === 'degraded' || opportunity.playbook?.stance === 'review') {
    return {
      id: 'thesis_integrity',
      label: 'Thesis integrity',
      status: 'block',
      detail: opportunity.latestEventMessage || '机会处于 degraded/review 状态，thesis 需要先复核。',
      action: '先处理降级原因。',
    };
  }

  if (opportunity.latestOpportunityDiff?.changed) {
    return {
      id: 'thesis_integrity',
      label: 'Thesis integrity',
      status: 'warn',
      detail: opportunity.latestOpportunityDiff.summary,
      action: '对照最近 thesis diff 后再执行。',
    };
  }

  if (!opportunity.thesis && !opportunity.summary) {
    return {
      id: 'thesis_integrity',
      label: 'Thesis integrity',
      status: 'warn',
      detail: '机会缺少一句话 thesis 或 summary。',
      action: '先在详情里补齐 thesis。',
    };
  }

  return {
    id: 'thesis_integrity',
    label: 'Thesis integrity',
    status: 'pass',
    detail: 'Thesis 当前没有明显降级或未处理变化。',
  };
}

function catalystItem(opportunity: OpportunitySummary): PreTradeChecklistItem {
  const catalyst = hasUpcomingCatalyst(opportunity);
  const days = daysUntil(catalyst?.dueAt || opportunity.nextCatalystAt);

  if (!catalyst && !opportunity.nextCatalystAt) {
    return {
      id: 'catalyst_window',
      label: 'Catalyst window',
      status: 'warn',
      detail: '还没有明确 next catalyst，执行时间窗口偏模糊。',
      action: '补全催化日期或触发条件。',
    };
  }

  if (days !== null && days < 0) {
    return {
      id: 'catalyst_window',
      label: 'Catalyst window',
      status: 'block',
      detail: '最近 catalyst 已经过期，需要确认是否错过窗口。',
      action: '更新催化日历。',
    };
  }

  if (days !== null && days <= 14) {
    return {
      id: 'catalyst_window',
      label: 'Catalyst window',
      status: 'pass',
      detail: `${catalyst?.label || 'Next catalyst'} 在 ${days} 天内，窗口清晰。`,
    };
  }

  return {
    id: 'catalyst_window',
    label: 'Catalyst window',
    status: 'warn',
    detail: catalyst?.dueAt
      ? `${catalyst.label} 还不近，当前更适合准备而不是执行。`
      : `${catalyst?.label || opportunity.nextCatalystAt} 缺少可解析日期。`,
    action: '等待窗口接近或补齐日期。',
  };
}

function tradeabilityItem(opportunity: OpportunitySummary): PreTradeChecklistItem {
  const score = opportunity.scores.tradeabilityScore;
  if (score >= 70) {
    return {
      id: 'tradeability',
      label: 'Tradeability',
      status: 'pass',
      detail: `Tradeability ${score}，流动性/可交易性通过基础门槛。`,
    };
  }

  if (score >= 55) {
    return {
      id: 'tradeability',
      label: 'Tradeability',
      status: 'warn',
      detail: `Tradeability ${score}，可以继续看，但不适合默认提高仓位。`,
      action: '降低仓位假设或补成交验证。',
    };
  }

  return {
    id: 'tradeability',
    label: 'Tradeability',
    status: 'block',
    detail: `Tradeability ${score}，交易前门槛不足。`,
    action: '先确认流动性和执行滑点。',
  };
}

function structureRiskItem(opportunity: OpportunitySummary): PreTradeChecklistItem {
  if (opportunity.type === 'relay_chain') {
    const validation = opportunity.heatProfile?.validationStatus;
    if (validation === 'confirmed') {
      return {
        id: 'structure_risk',
        label: 'Structure risk',
        status: 'pass',
        detail: 'Relay validation 已确认，结构风险可控。',
      };
    }
    if (validation === 'broken') {
      return {
        id: 'structure_risk',
        label: 'Structure risk',
        status: 'block',
        detail: opportunity.heatProfile?.validationSummary || 'Relay validation broken。',
        action: '先复核 leader / breadth / bottleneck。',
      };
    }
    return {
      id: 'structure_risk',
      label: 'Structure risk',
      status: 'warn',
      detail: opportunity.heatProfile?.validationSummary || 'Relay 结构还没完全确认。',
      action: '等待 validation 或 breadth 改善。',
    };
  }

  if (opportunity.type === 'ipo_spinout') {
    if (opportunity.ipoProfile?.retainedStakePercent || opportunity.ipoProfile?.lockupDate) {
      return {
        id: 'structure_risk',
        label: 'Structure risk',
        status: 'pass',
        detail: '供给 overhang 字段已有记录。',
      };
    }
    return {
      id: 'structure_risk',
      label: 'Structure risk',
      status: 'warn',
      detail: opportunity.supplyOverhang || '供给 overhang 还不完整。',
      action: '补 retained stake / lockup / greenshoe。',
    };
  }

  if (opportunity.type === 'proxy_narrative') {
    const legitimacy = opportunity.proxyProfile?.legitimacyScore || 0;
    if (legitimacy >= 70) {
      return {
        id: 'structure_risk',
        label: 'Structure risk',
        status: 'pass',
        detail: `Legitimacy ${legitimacy}，规则/身份风险可控。`,
      };
    }
    return {
      id: 'structure_risk',
      label: 'Structure risk',
      status: 'warn',
      detail: `Legitimacy ${legitimacy}，代理变量身份还需要确认。`,
      action: '补规则正名或身份映射。',
    };
  }

  return {
    id: 'structure_risk',
    label: 'Structure risk',
    status: 'warn',
    detail: '机会类型较泛，结构风险需要人工确认。',
  };
}

export function buildPreTradeChecklist(opportunity: OpportunitySummary): PreTradeChecklist {
  const playbookMissingItems = opportunity.playbook?.checklist
    .filter((item) => item.status === 'missing')
    .map((item): PreTradeChecklistItem => ({
      id: `playbook_${item.label}`,
      label: item.label,
      status: 'block',
      detail: item.note || 'Playbook checklist 仍缺关键项。',
      action: '先补齐 playbook 缺口。',
    })) || [];

  const items = [
    missionEvidenceItem(opportunity),
    thesisItem(opportunity),
    catalystItem(opportunity),
    tradeabilityItem(opportunity),
    structureRiskItem(opportunity),
    ...playbookMissingItems.slice(0, 2),
  ];
  const blockers = items.filter((item) => item.status === 'block').length;
  const warnings = items.filter((item) => item.status === 'warn').length;
  const score = Math.round((items.reduce((sum, item) => sum + statusRank(item.status), 0) / (items.length * 2)) * 100);
  const readiness: PreTradeReadiness = blockers > 0 ? 'blocked' : warnings > 0 ? 'watch' : 'ready';

  return {
    readiness,
    label: readiness === 'ready' ? 'READY' : readiness === 'watch' ? 'WATCH' : 'BLOCKED',
    score,
    blockers,
    warnings,
    items,
    nextAction: blockers > 0
      ? items.find((item) => item.status === 'block')?.action || '先处理 BLOCK 项。'
      : warnings > 0
        ? items.find((item) => item.status === 'warn')?.action || '先复核 WARN 项。'
        : opportunity.playbook?.nextStep || '可以进入交易前最后确认。',
  };
}
