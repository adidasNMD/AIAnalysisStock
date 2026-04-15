import type { EdgarFiling } from '../tools/edgar-monitor';
import type {
  NewCodeRadarCandidate,
  NewCodeRadarStatus,
  OpportunityCatalystItem,
  OpportunityFieldEvidence,
  OpportunityIpoEvidence,
  OpportunityIpoProfile,
  OpportunityRecord,
} from './types';

function normalizeCompanyKey(name: string): string {
  return name.trim().toLowerCase();
}

function safeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toObservedCatalyst(
  label: string,
  dueAt: string | undefined,
  note?: string,
  source?: string,
): OpportunityCatalystItem {
  return {
    label,
    status: 'observed',
    ...(dueAt ? { dueAt } : {}),
    ...(note ? { note } : {}),
    ...(source ? { source } : {}),
    confidence: 'confirmed',
  };
}

function stageRank(status: NewCodeRadarStatus): number {
  switch (status) {
    case 'trading_soon':
      return 3;
    case 'pricing':
      return 2;
    default:
      return 1;
  }
}

function createFieldEvidence(
  source: string,
  confidence: OpportunityFieldEvidence['confidence'],
  note?: string,
  observedAt?: string,
): OpportunityFieldEvidence {
  return {
    source,
    confidence,
    ...(note ? { note } : {}),
    ...(observedAt ? { observedAt } : {}),
  };
}

export function sortFilingsByDate(filings: EdgarFiling[]): EdgarFiling[] {
  return [...filings].sort((a, b) => (b.filedAt || '').localeCompare(a.filedAt || ''));
}

export function deriveNewCodeRadarStatus(filings: EdgarFiling[]): NewCodeRadarStatus {
  if (filings.some((filing) => ['424B4', '424B1'].includes(filing.formType))) {
    return 'trading_soon';
  }
  if (filings.some((filing) => filing.formType === 'S-1/A')) {
    return 'pricing';
  }
  return 'filing';
}

export function deriveIpoProfileFromFilings(
  filings: EdgarFiling[],
  previous?: OpportunityIpoProfile,
): OpportunityIpoProfile | undefined {
  const sorted = sortFilingsByDate(filings);
  const latest = sorted[0];
  const latestProspectus = sorted.find((filing) => ['424B4', '424B1'].includes(filing.formType));
  const latestAmendment = sorted.find((filing) => filing.formType === 'S-1/A');

  const next: OpportunityIpoProfile = {
    ...(previous || {}),
  };
  const evidence: OpportunityIpoEvidence = {
    ...(previous?.evidence || {}),
  };

  if (latestProspectus && !next.greenshoeStatus) {
    next.greenshoeStatus = 'Final prospectus filed; stabilization / greenshoe window likely active';
    evidence.greenshoeStatus = createFieldEvidence(
      `EDGAR ${latestProspectus.formType}`,
      'inferred',
      'Derived from final prospectus filing and expected stabilization window.',
      latestProspectus.filedAt,
    );
  } else if (!next.greenshoeStatus && latestAmendment) {
    next.greenshoeStatus = 'S-1 amendment active; watch for pricing and final prospectus';
    evidence.greenshoeStatus = createFieldEvidence(
      `EDGAR ${latestAmendment.formType}`,
      'inferred',
      'Derived from amendment stage; pricing window still pending.',
      latestAmendment.filedAt,
    );
  }

  if (!next.firstCoverageAt && latestProspectus?.filedAt) {
    next.firstCoverageAt = latestProspectus.filedAt;
    evidence.firstCoverageAt = createFieldEvidence(
      `EDGAR ${latestProspectus.formType}`,
      'inferred',
      'Using final prospectus date as earliest practical sell-side initiation watchpoint.',
      latestProspectus.filedAt,
    );
  }

  if (!next.officialTradingDate && !evidence.officialTradingDate && latest?.formType && ['424B4', '424B1'].includes(latest.formType)) {
    // Keep precision honest: no exact trading date is inferred here.
    // The upcoming catalyst item communicates the trading window without asserting a hard date.
    evidence.officialTradingDate = createFieldEvidence(
      `EDGAR ${latest.formType}`,
      'inferred',
      'Final prospectus exists, but exact first trading date still needs exchange or company confirmation.',
      latest.filedAt,
    );
  }

  if (!next.lockupDate && !evidence.lockupDate && latestProspectus) {
    evidence.lockupDate = createFieldEvidence(
      `EDGAR ${latestProspectus.formType}`,
      'placeholder',
      'Typical IPO lockup likely exists, but exact unlock date was not found in repo evidence.',
      latestProspectus.filedAt,
    );
  }

  if (!next.firstIndependentEarningsAt && !evidence.firstIndependentEarningsAt) {
    evidence.firstIndependentEarningsAt = createFieldEvidence(
      'Not found in repo',
      'placeholder',
      'First independent earnings date still needs explicit company or exchange confirmation.',
    );
  }

  if (Object.keys(evidence).length > 0) {
    next.evidence = evidence;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildNewCodeRadarCalendar(
  filings: EdgarFiling[],
  status: NewCodeRadarStatus,
  ipoProfile?: OpportunityIpoProfile,
): OpportunityCatalystItem[] {
  const sorted = sortFilingsByDate(filings);
  const observed = sorted.slice(0, 5).map((filing) => {
    const label = filing.formType === 'S-1'
      ? 'Initial S-1 filed'
      : filing.formType === 'S-1/A'
        ? 'S-1 amendment filed'
        : filing.formType === '424B4' || filing.formType === '424B1'
          ? 'Final prospectus / pricing filed'
          : `${filing.formType} filed`;
    return toObservedCatalyst(label, safeDate(filing.filedAt), filing.description, `EDGAR ${filing.formType}`);
  });

  const inferred: OpportunityCatalystItem[] = [];

  if (status === 'trading_soon') {
    inferred.push({
      label: '正式交易窗口确认',
      status: 'upcoming',
      note: 'Final prospectus exists; confirm actual first trading date from exchange or company release.',
      source: 'EDGAR 424B4/424B1',
      confidence: 'inferred',
    });
  } else if (status === 'pricing') {
    inferred.push({
      label: '等待 424B / pricing filing',
      status: 'upcoming',
      note: 'Amendment already filed; next milestone is usually pricing or final prospectus.',
      source: 'EDGAR S-1/A',
      confidence: 'inferred',
    });
  } else {
    inferred.push({
      label: '等待 amendment / roadshow 进展',
      status: 'upcoming',
      note: 'Still in initial filing phase; prioritize amendment and marketing progression.',
      source: 'EDGAR S-1',
      confidence: 'inferred',
    });
  }

  if (ipoProfile?.lockupDate) {
    inferred.push({
      label: 'Lockup / 解禁窗口',
      status: 'upcoming',
      dueAt: ipoProfile.lockupDate,
      source: 'Opportunity profile',
      confidence: 'confirmed',
    });
  } else if (status === 'trading_soon') {
    inferred.push({
      label: 'Lockup / 解禁窗口待确认',
      status: 'upcoming',
      note: 'Typical lockup may exist, but exact date was not found in repo evidence yet.',
      source: 'Not found in repo',
      confidence: 'placeholder',
    });
  }

  if (ipoProfile?.firstIndependentEarningsAt) {
    inferred.push({
      label: '首份独立财报',
      status: 'upcoming',
      dueAt: ipoProfile.firstIndependentEarningsAt,
      source: 'Opportunity profile',
      confidence: 'confirmed',
    });
  } else {
    inferred.push({
      label: '首份独立财报待确认',
      status: 'upcoming',
      note: 'Not found in repo evidence yet.',
      source: 'Not found in repo',
      confidence: 'placeholder',
    });
  }

  if (ipoProfile?.firstCoverageAt) {
    inferred.push({
      label: '首次覆盖 / initiation',
      status: 'upcoming',
      dueAt: ipoProfile.firstCoverageAt,
      source: 'Opportunity profile',
      confidence: 'confirmed',
    });
  }

  return [...inferred, ...observed];
}

export function summarizeNewCodeRadar(
  companyName: string,
  status: NewCodeRadarStatus,
  filings: EdgarFiling[],
): string {
  const latest = sortFilingsByDate(filings)[0];
  if (!latest) {
    return `${companyName} 已进入新代码雷达，但仓库里还没有足够 filing 用于自动排序。`;
  }

  switch (status) {
    case 'trading_soon':
      return `${companyName} 已出现 ${latest.formType}，现在重点从 filing 阅读转到正式交易确认、首周价格发现和供给日历。`;
    case 'pricing':
      return `${companyName} 已进入 amendment 阶段，离定价更近，下一步重点确认 424B / pricing filing 和交易窗口。`;
    default:
      return `${companyName} 还处在初始 filing 阶段，当前更像早知道雷达，先盯 amendment、roadshow 和后续规则文件。`;
  }
}

export function buildNewCodeRadarCandidates(
  filings: EdgarFiling[],
  linkedOpportunities: OpportunityRecord[] = [],
): NewCodeRadarCandidate[] {
  const grouped = new Map<string, EdgarFiling[]>();
  filings.forEach((filing) => {
    const key = normalizeCompanyKey(filing.companyName);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(filing);
  });

  return [...grouped.entries()]
    .map(([key, companyFilings]) => {
      const sorted = sortFilingsByDate(companyFilings);
      const latest = sorted[0];
      const linked = linkedOpportunities.find((opportunity) =>
        opportunity.type === 'ipo_spinout'
        && opportunity.query.trim().toLowerCase() === latest.companyName.trim().toLowerCase(),
      );
      const status = deriveNewCodeRadarStatus(sorted);
      const ipoProfile = deriveIpoProfileFromFilings(sorted, linked?.ipoProfile);

      return {
        key,
        companyName: latest.companyName,
        title: `${latest.companyName} New Code Radar`,
        query: latest.companyName,
        status,
        summary: summarizeNewCodeRadar(latest.companyName, status, sorted),
        ...(latest.formType ? { latestFilingType: latest.formType } : {}),
        ...(safeDate(latest.filedAt) ? { latestFiledAt: safeDate(latest.filedAt) } : {}),
        filingCount: sorted.length,
        ...(ipoProfile ? { ipoProfile } : {}),
        catalystCalendar: buildNewCodeRadarCalendar(sorted, status, ipoProfile),
        ...(linked ? { linkedOpportunityId: linked.id } : {}),
      };
    })
    .sort((a, b) => {
      const stageDelta = stageRank(b.status) - stageRank(a.status);
      if (stageDelta !== 0) return stageDelta;
      return (b.latestFiledAt || '').localeCompare(a.latestFiledAt || '');
    });
}
