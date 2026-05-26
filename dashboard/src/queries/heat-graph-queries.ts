import {
  fetchHeatTransferGraphs,
  type HeatTransferGraph,
} from '../api';
import { usePollingQuery } from './query-client';

export const HEAT_GRAPH_INTERVAL_MS = 10000;

export function useHeatTransferGraphsQuery(intervalMs = HEAT_GRAPH_INTERVAL_MS) {
  return usePollingQuery<HeatTransferGraph[]>({
    queryKey: `opportunities:heat-graphs:${intervalMs}`,
    fetcher: fetchHeatTransferGraphs,
    intervalMs,
    initialData: [],
  });
}
