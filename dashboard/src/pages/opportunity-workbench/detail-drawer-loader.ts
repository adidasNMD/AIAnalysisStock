let detailDrawerPromise: Promise<{
  default: typeof import('./OpportunityDetailDrawer').OpportunityDetailDrawer;
}> | null = null;

export function loadOpportunityDetailDrawer() {
  if (!detailDrawerPromise) {
    detailDrawerPromise = import('./OpportunityDetailDrawer').then((module) => ({
      default: module.OpportunityDetailDrawer,
    }));
  }
  return detailDrawerPromise;
}

export function preloadOpportunityDetailDrawer() {
  void loadOpportunityDetailDrawer();
}
