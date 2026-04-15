import type { DynamicTicker } from '../utils/dynamic-watchlist';
import type {
  HeatTransferEdge,
  HeatTransferGraph,
  HeatTransferValidationStatus,
  OpportunityRecord,
  OpportunityTemperature,
} from './types';

function averageScore(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function statusBonus(ticker: DynamicTicker): number {
  switch (ticker.status) {
    case 'focused':
      return 10;
    case 'watching':
      return 4;
    case 'discovered':
      return 1;
    default:
      return -2;
  }
}

function scoreNode(ticker: DynamicTicker): number {
  return ticker.multibaggerScore + statusBonus(ticker);
}

function createEdge(
  from: string,
  to: string,
  weight: number,
  kind: HeatTransferEdge['kind'],
  reason: string,
): HeatTransferEdge {
  return {
    id: `${kind}:${from}:${to}`,
    from,
    to,
    weight,
    kind,
    reason,
  };
}

function resolveTemperature(relayScore: number, validationStatus: HeatTransferValidationStatus): OpportunityTemperature {
  if (validationStatus === 'broken') return 'broken';
  if (relayScore >= 88) return 'hot';
  if (relayScore >= 72) return 'warming';
  if (relayScore >= 58) return 'cold';
  return 'broken';
}

function resolveValidationStatus(payload: {
  leader?: DynamicTicker;
  bottlenecks: DynamicTicker[];
  laggards: DynamicTicker[];
  breadthScore: number;
  relayScore: number;
}): HeatTransferValidationStatus {
  if (!payload.leader) return 'broken';
  if (payload.breadthScore >= 70 && payload.relayScore >= 82 && payload.bottlenecks.length > 0 && payload.laggards.length > 0) {
    return 'confirmed';
  }
  if (payload.relayScore >= 62 && payload.bottlenecks.length > 0) {
    return 'forming';
  }
  if (payload.leader && payload.breadthScore >= 42) {
    return 'fragile';
  }
  return 'broken';
}

function buildValidationSummary(payload: {
  theme: string;
  leader?: DynamicTicker;
  bottlenecks: DynamicTicker[];
  laggards: DynamicTicker[];
  validationStatus: HeatTransferValidationStatus;
  breadthScore: number;
}): string {
  const leaderPart = payload.leader
    ? `${payload.leader.symbol} 提供当前温度计`
    : '还没有明确龙头';

  switch (payload.validationStatus) {
    case 'confirmed':
      return `${payload.theme} 传导已确认: ${leaderPart}，瓶颈 ${payload.bottlenecks.length} 个，洼地 ${payload.laggards.length} 个，breadth ${payload.breadthScore}。`;
    case 'forming':
      return `${payload.theme} 传导正在形成: ${leaderPart}，二层瓶颈已出现，但三层扩散仍需验证。`;
    case 'fragile':
      return `${payload.theme} 传导偏脆弱: ${leaderPart}，链路存在但 breadth 不够稳。`;
    default:
      return `${payload.theme} 传导尚未成立: 龙头或中继层不足，暂时更适合观察而不是重仓表达。`;
  }
}

function buildTransmissionSummary(theme: string, leader?: DynamicTicker, bottlenecks: DynamicTicker[] = [], laggards: DynamicTicker[] = []): string {
  const leaderPart = leader
    ? `龙头 ${leader.symbol} 已经提供温度计`
    : '当前还没有明确龙头';
  const bottleneckPart = bottlenecks.length > 0
    ? `瓶颈层优先看 ${bottlenecks.slice(0, 2).map((item) => item.symbol).join(', ')}`
    : '瓶颈层还有待补全';
  const laggardPart = laggards.length > 0
    ? `洼地层先盯 ${laggards.slice(0, 2).map((item) => item.symbol).join(', ')}`
    : '二三层洼地还不够明确';
  return `${theme}: ${leaderPart}，${bottleneckPart}，${laggardPart}。`;
}

function buildEdges(
  leader: DynamicTicker | undefined,
  bottlenecks: DynamicTicker[],
  laggards: DynamicTicker[],
): HeatTransferEdge[] {
  const edges: HeatTransferEdge[] = [];

  if (leader) {
    bottlenecks.forEach((bottleneck) => {
      const weight = Math.min(100, Math.round(scoreNode(leader) * 0.55 + scoreNode(bottleneck) * 0.45));
      edges.push(createEdge(
        leader.symbol,
        bottleneck.symbol,
        weight,
        'leader_to_bottleneck',
        `${leader.symbol} 提供流动性锚，${bottleneck.symbol} 是更直接的瓶颈承接方。`,
      ));
    });

    if (bottlenecks.length === 0) {
      laggards.slice(0, 2).forEach((laggard) => {
        const weight = Math.min(100, Math.round(scoreNode(leader) * 0.65 + scoreNode(laggard) * 0.35));
        edges.push(createEdge(
          leader.symbol,
          laggard.symbol,
          weight,
          'leader_to_laggard',
          `${leader.symbol} 直接把主题热量传给 ${laggard.symbol}，但链路中间层仍偏薄。`,
        ));
      });
    }
  }

  bottlenecks.forEach((bottleneck) => {
    laggards.slice(0, 3).forEach((laggard) => {
      const weight = Math.min(100, Math.round(scoreNode(bottleneck) * 0.55 + scoreNode(laggard) * 0.45));
      edges.push(createEdge(
        bottleneck.symbol,
        laggard.symbol,
        weight,
        'bottleneck_to_laggard',
        `${bottleneck.symbol} 是更可交易的中继层，${laggard.symbol} 是后排高弹性表达。`,
      ));
    });
  });

  return edges.sort((a, b) => b.weight - a.weight);
}

export function buildHeatTransferGraphs(
  tickers: DynamicTicker[],
  linkedOpportunities: OpportunityRecord[] = [],
): HeatTransferGraph[] {
  const groups = new Map<string, DynamicTicker[]>();
  tickers.forEach((ticker) => {
    const key = (ticker.trendName || ticker.discoverySource || 'Unsorted').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ticker);
  });

  return [...groups.entries()]
    .map(([theme, items]) => {
      const sorted = [...items].sort((a, b) => scoreNode(b) - scoreNode(a));
      const leader = sorted.find((item) => item.chainLevel === 'sector_leader') || sorted[0];
      const bottlenecks = sorted.filter((item) => item.chainLevel === 'bottleneck');
      const laggards = sorted.filter((item) => item.chainLevel === 'hidden_gem');
      const junkTickers: string[] = [];
      const breadthScore = Math.min(
        100,
        Math.round(
          30
          + bottlenecks.length * 12
          + laggards.length * 8
          + averageScore(items.map((item) => statusBonus(item) + 5)) * 1.5,
        ),
      );
      const relayScore = Math.min(
        100,
        Math.round(
          (leader ? scoreNode(leader) : 0) * 0.38
          + averageScore(bottlenecks.map(scoreNode)) * 0.3
          + averageScore(laggards.map(scoreNode)) * 0.16
          + breadthScore * 0.16,
        ),
      );
      const validationStatus = resolveValidationStatus({
        leader,
        bottlenecks,
        laggards,
        breadthScore,
        relayScore,
      });
      const edges = buildEdges(leader, bottlenecks, laggards);
      const linked = linkedOpportunities.find((opportunity) =>
        opportunity.type === 'relay_chain'
        && (
          opportunity.query.trim().toLowerCase() === theme.toLowerCase()
          || opportunity.title.trim().toLowerCase() === `${theme} 热量传导链`.toLowerCase()
          || (leader?.symbol ? opportunity.leaderTicker === leader.symbol : false)
        ),
      );

      return {
        id: `graph_${theme.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        theme,
        ...(leader?.symbol ? { leaderTicker: leader.symbol } : {}),
        ...(leader ? { leaderScore: leader.multibaggerScore } : {}),
        bottleneckTickers: bottlenecks.map((item) => item.symbol),
        laggardTickers: laggards.map((item) => item.symbol),
        junkTickers,
        breadthScore,
        relayScore,
        temperature: resolveTemperature(relayScore, validationStatus),
        validationStatus,
        validationSummary: buildValidationSummary({
          theme,
          leader,
          bottlenecks,
          laggards,
          validationStatus,
          breadthScore,
        }),
        edgeCount: edges.length,
        edges,
        transmissionSummary: buildTransmissionSummary(theme, leader, bottlenecks, laggards),
        ...(linked ? { linkedOpportunityId: linked.id } : {}),
      } satisfies HeatTransferGraph;
    })
    .filter((graph) => graph.leaderTicker || graph.bottleneckTickers.length > 0 || graph.laggardTickers.length > 0)
    .sort((a, b) => b.relayScore - a.relayScore);
}
