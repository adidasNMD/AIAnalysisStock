import { describe, expect, it } from 'vitest';
import { HEAT_GRAPH_INTERVAL_MS } from '../../dashboard/src/queries/heat-graph-queries';

describe('heat graph query hooks', () => {
  it('keeps Heat Transfer Graph polling cadence explicit', () => {
    expect(HEAT_GRAPH_INTERVAL_MS).toBe(10000);
  });
});
