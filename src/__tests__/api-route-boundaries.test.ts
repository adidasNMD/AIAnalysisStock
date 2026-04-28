import { describe, expect, it } from 'vitest';
import { app } from '../server/app';
import { artifactsRouter } from '../server/routes/artifacts';
import { missionsRouter } from '../server/routes/missions';
import { systemRouter } from '../server/routes/system';
import { trendRadarRouter } from '../server/routes/trendradar';

type RouteMethods = Record<string, boolean>;
type RouteLayer = {
  route?: {
    path: string | string[];
    methods: RouteMethods;
  };
  handle?: {
    stack?: RouteLayer[];
  };
};
type RouterLike = {
  stack?: RouteLayer[];
  router?: {
    stack?: RouteLayer[];
  };
  _router?: {
    stack?: RouteLayer[];
  };
};

function routeEntries(router: RouterLike): Array<{ method: string; path: string }> {
  const stack = router.stack || router.router?.stack || router._router?.stack || [];
  return stack.flatMap((layer) => {
    if (!layer.route) return [];
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    return paths.flatMap((path) => (
      Object.entries(layer.route?.methods || {})
        .filter(([, enabled]) => enabled)
        .map(([method]) => ({ method: method.toUpperCase(), path }))
    ));
  });
}

function expectRoute(router: RouterLike, method: string, path: string) {
  expect(routeEntries(router)).toContainEqual({ method, path });
}

describe('api route boundaries', () => {
  it('keeps direct app routes mounted', () => {
    expectRoute(app as unknown as RouterLike, 'GET', '/api/rss/:source');
    expectRoute(app as unknown as RouterLike, 'GET', '/api/diagnostics');
  });

  it('groups system routes outside app.ts', () => {
    expectRoute(systemRouter as unknown as RouterLike, 'GET', '/health');
    expectRoute(systemRouter as unknown as RouterLike, 'GET', '/health/services');
    expectRoute(systemRouter as unknown as RouterLike, 'GET', '/queue');
    expectRoute(systemRouter as unknown as RouterLike, 'POST', '/queue/recover-stale');
    expectRoute(systemRouter as unknown as RouterLike, 'POST', '/queue/:id/recover');
    expectRoute(systemRouter as unknown as RouterLike, 'POST', '/trigger');
    expectRoute(systemRouter as unknown as RouterLike, 'DELETE', '/queue/:id');
    expectRoute(systemRouter as unknown as RouterLike, 'GET', '/stream');
  });

  it('groups artifact routes outside app.ts', () => {
    expectRoute(artifactsRouter as unknown as RouterLike, 'GET', '/reports');
    expectRoute(artifactsRouter as unknown as RouterLike, 'GET', '/reports/content');
    expectRoute(artifactsRouter as unknown as RouterLike, 'GET', '/traces');
    expectRoute(artifactsRouter as unknown as RouterLike, 'GET', '/traces/content');
    expectRoute(artifactsRouter as unknown as RouterLike, 'GET', '/traces/byMission/:missionId');
    expectRoute(artifactsRouter as unknown as RouterLike, 'GET', '/traces/byMission/:missionId/runs/:runId');
  });

  it('groups mission routes outside app.ts', () => {
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/');
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/stream');
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/:id/recovery');
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/:id/runs');
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/:id/runs/:runId/evidence');
    expectRoute(missionsRouter as unknown as RouterLike, 'POST', '/:id/retry');
    expectRoute(missionsRouter as unknown as RouterLike, 'POST', '/');
  });

  it('groups TrendRadar routes outside app.ts', () => {
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/dates');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/reports');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/reports/:date/:filename');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/latest');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/raw');
  });
});
