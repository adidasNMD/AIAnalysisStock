export function workbenchActionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function settleWorkbenchRefreshes(refreshes: Promise<unknown>[]) {
  if (refreshes.length === 0) return;
  void Promise.allSettled(refreshes);
}
