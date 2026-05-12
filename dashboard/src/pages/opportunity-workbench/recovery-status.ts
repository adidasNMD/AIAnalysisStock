export function isRecoverableMissionStatus(status?: string | null): boolean {
  return status === 'failed' || status === 'canceled';
}
