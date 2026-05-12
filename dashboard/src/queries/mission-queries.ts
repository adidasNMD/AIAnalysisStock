import {
  emptyPage,
  fetchMissionsPage,
  type MissionSummary,
  type PageEnvelope,
  type PageInfo,
} from '../api';
import { type PollingQueryResult, usePollingQuery } from './query-client';

export function useMissionListPageQuery(limit = 30) {
  return usePollingQuery<PageEnvelope<MissionSummary>>({
    queryKey: `missions:list-page:${limit}`,
    fetcher: () => fetchMissionsPage({ limit }),
    intervalMs: 5000,
    initialData: emptyPage<MissionSummary>(limit),
  });
}

export interface MissionListQueryResult extends Omit<PollingQueryResult<PageEnvelope<MissionSummary>>, 'data'> {
  data: MissionSummary[];
  pageInfo: PageInfo | null;
}

export function useMissionListQuery(limit = 30): MissionListQueryResult {
  const query = useMissionListPageQuery(limit);
  return {
    ...query,
    data: query.data?.items ?? [],
    pageInfo: query.data?.pageInfo ?? null,
  };
}
