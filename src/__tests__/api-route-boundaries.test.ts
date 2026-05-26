import { describe, expect, it } from 'vitest';
import { app } from '../server/app';
import { artifactsRouter } from '../server/routes/artifacts';
import { healthRouter } from '../server/routes/health';
import { missionDiagnosticsRouter } from '../server/routes/mission-diagnostics';
import { missionsRouter } from '../server/routes/missions';
import { opportunitiesRouter } from '../server/routes/opportunities';
import { queueRouter } from '../server/routes/queue';
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
    expectRoute(systemRouter as unknown as RouterLike, 'GET', '/stream');
  });

  it('groups health routes outside system routes', () => {
    expectRoute(healthRouter as unknown as RouterLike, 'GET', '/health');
    expectRoute(healthRouter as unknown as RouterLike, 'GET', '/health/services');
  });

  it('groups mission diagnostics routes outside system routes', () => {
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'GET', '/diagnostics/db-migrations');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'GET', '/diagnostics/missions');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'GET', '/diagnostics/opportunity-field-evidence');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'GET', '/diagnostics/opportunity-field-evidence/repair-plan');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'GET', '/diagnostics/mission-artifacts');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'GET', '/diagnostics/mission-artifacts/repair-plan');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'POST', '/diagnostics/mission-artifacts/backfill');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'POST', '/diagnostics/mission-artifacts/repair');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'POST', '/diagnostics/missions/backfill');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'POST', '/diagnostics/opportunity-field-evidence/backfill');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'POST', '/diagnostics/opportunity-field-evidence/repair');
    expectRoute(missionDiagnosticsRouter as unknown as RouterLike, 'POST', '/diagnostics/mission-artifacts/refresh-integrity');
  });

  it('groups queue lifecycle routes outside system routes', () => {
    expectRoute(queueRouter as unknown as RouterLike, 'GET', '/queue');
    expectRoute(queueRouter as unknown as RouterLike, 'POST', '/queue/recover-stale');
    expectRoute(queueRouter as unknown as RouterLike, 'POST', '/queue/:id/recover');
    expectRoute(queueRouter as unknown as RouterLike, 'POST', '/trigger');
    expectRoute(queueRouter as unknown as RouterLike, 'DELETE', '/queue/:id');
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
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/:id/artifacts');
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/:id/runs');
    expectRoute(missionsRouter as unknown as RouterLike, 'GET', '/:id/runs/:runId/evidence');
    expectRoute(missionsRouter as unknown as RouterLike, 'POST', '/:id/retry');
    expectRoute(missionsRouter as unknown as RouterLike, 'POST', '/');
  });

  it('groups opportunity routes outside app.ts', () => {
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunities');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunities/stream');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-events');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-field-evidence');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-pretrade-audit');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-review-playback');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-catalyst-reminders');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-catalyst-reminders.ics');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunities/price-history/diagnostics');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunities/price-history/refresh');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunity-field-evidence/bulk-status');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-field-registry');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-field-registry/history');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-field-registry/report');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunity-field-registry/export');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunity-field-registry/import');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'PUT', '/opportunity-field-registry/:field');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'DELETE', '/opportunity-field-registry/:field');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'GET', '/opportunities/:id/events');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunities');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunities/:id/pretrade-confirmations');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunities/:id/field-evidence');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunities/:id/field-evidence/batch');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunities/:id/field-evidence/:evidenceId/invalidate');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'POST', '/opportunities/:id/field-evidence/:evidenceId/restore');
    expectRoute(opportunitiesRouter as unknown as RouterLike, 'PATCH', '/opportunities/:id');
  });

  it('groups TrendRadar routes outside app.ts', () => {
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/dates');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/reports');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/reports/:date/:filename');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/latest');
    expectRoute(trendRadarRouter as unknown as RouterLike, 'GET', '/raw');
  });
});
