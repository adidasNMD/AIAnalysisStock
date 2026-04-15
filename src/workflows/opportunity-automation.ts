import type { EdgarFiling } from '../tools/edgar-monitor';
import type { DynamicTicker } from '../utils/dynamic-watchlist';
import type { OpportunityRecord } from './types';
import {
  appendOpportunityEvent,
  createOpportunity,
  emitOpportunityDerivedEvents,
  findMatchingOpportunity,
  listOpportunities,
  updateOpportunity,
} from './opportunities';
import { buildHeatTransferGraphs } from './heat-transfer-graph';
import { buildNewCodeRadarCandidates } from './opportunity-calendars';

export async function syncNewCodeRadarOpportunities(filings: EdgarFiling[]) {
  if (filings.length === 0) return [];
  const opportunities = await listOpportunities(500);
  const candidates = buildNewCodeRadarCandidates(filings, opportunities);
  const synced: OpportunityRecord[] = [];

  for (const candidate of candidates) {
    const previous = await findMatchingOpportunity({
      type: 'ipo_spinout',
      title: candidate.title,
      query: candidate.query,
    });

    const stage = candidate.status === 'trading_soon'
      ? 'ready'
      : candidate.status === 'pricing'
        ? 'tracking'
        : 'radar';
    const status = candidate.status === 'trading_soon' ? 'ready' : 'watching';
    const scores = candidate.status === 'trading_soon'
      ? { catalystScore: 90, tradeabilityScore: 72 }
      : candidate.status === 'pricing'
        ? { catalystScore: 82, tradeabilityScore: 66 }
        : { catalystScore: 74, tradeabilityScore: 60 };

    const payload = {
      title: candidate.title,
      query: candidate.query,
      summary: candidate.summary,
      stage,
      status,
      policyStatus: candidate.latestFilingType
        ? `Latest EDGAR filing: ${candidate.latestFilingType}${candidate.latestFiledAt ? ` (${candidate.latestFiledAt})` : ''}`
        : undefined,
      scores,
      ...(candidate.ipoProfile ? { ipoProfile: candidate.ipoProfile } : {}),
      catalystCalendar: candidate.catalystCalendar,
    } as const;

    if (!previous) {
      synced.push(await createOpportunity({
        type: 'ipo_spinout',
        ...payload,
      }));
      continue;
    }

    const updated = await updateOpportunity(previous.id, payload);
    if (updated) {
      await appendOpportunityEvent(updated.id, {
        type: 'updated',
        message: `New Code Radar auto-updated from EDGAR for ${candidate.companyName}`,
        meta: {
          latestFilingType: candidate.latestFilingType,
          latestFiledAt: candidate.latestFiledAt,
          filingCount: candidate.filingCount,
        },
      });
      await emitOpportunityDerivedEvents(previous, updated);
      synced.push(updated);
    }
  }

  return synced;
}

export async function syncHeatTransferGraphOpportunities(tickers: DynamicTicker[]) {
  if (tickers.length === 0) return [];
  const opportunities = await listOpportunities(500);
  const graphs = buildHeatTransferGraphs(tickers, opportunities);
  const synced: OpportunityRecord[] = [];

  for (const graph of graphs) {
    if (!graph.leaderTicker && graph.bottleneckTickers.length === 0 && graph.laggardTickers.length === 0) continue;

    const previous = await findMatchingOpportunity({
      type: 'relay_chain',
      title: `${graph.theme} 热量传导链`,
      query: graph.theme,
      leaderTicker: graph.leaderTicker,
    });

    const stage = graph.temperature === 'hot'
      ? 'ready'
      : graph.temperature === 'warming'
        ? 'tracking'
        : graph.temperature === 'broken'
          ? 'cooldown'
          : 'tracking';
    const status = graph.temperature === 'hot'
      ? 'ready'
      : graph.temperature === 'broken'
        ? 'degraded'
        : 'watching';

    const payload = {
      title: `${graph.theme} 热量传导链`,
      query: graph.theme,
      thesis: graph.validationSummary,
      summary: graph.transmissionSummary,
      ...(graph.leaderTicker ? { leaderTicker: graph.leaderTicker } : {}),
      relatedTickers: graph.bottleneckTickers,
      relayTickers: graph.laggardTickers,
      stage,
      status,
      scores: {
        relayScore: graph.relayScore,
        tradeabilityScore: Math.min(88, 48 + graph.breadthScore * 0.28 + graph.edgeCount * 2),
      },
      heatProfile: {
        temperature: graph.temperature,
        bottleneckTickers: graph.bottleneckTickers,
        laggardTickers: graph.laggardTickers,
        junkTickers: graph.junkTickers,
        breadthScore: graph.breadthScore,
        validationStatus: graph.validationStatus,
        validationSummary: graph.validationSummary,
        edgeCount: graph.edgeCount,
        edges: graph.edges,
        ...(graph.leaderTicker ? { leaderHealth: graph.validationSummary } : {}),
        transmissionNote: graph.transmissionSummary,
      },
    } as const;

    if (!previous) {
      synced.push(await createOpportunity({
        type: 'relay_chain',
        ...payload,
      }));
      continue;
    }

    const updated = await updateOpportunity(previous.id, payload);
    if (updated) {
      await appendOpportunityEvent(updated.id, {
        type: 'updated',
        message: `Heat Transfer Graph auto-synced for ${graph.theme}`,
        meta: {
          leaderTicker: graph.leaderTicker,
          relayScore: graph.relayScore,
          temperature: graph.temperature,
          breadthScore: graph.breadthScore,
          validationStatus: graph.validationStatus,
          edgeCount: graph.edgeCount,
        },
      });
      await emitOpportunityDerivedEvents(previous, updated);
      synced.push(updated);
    }
  }

  return synced;
}
