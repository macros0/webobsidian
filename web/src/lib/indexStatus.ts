import { useSyncExternalStore } from 'react';
import { api, type IndexStatus } from './api';

let state: { status: IndexStatus | null; refresh: number } = { status: null, refresh: 0 };
let epoch = 0;
const listeners = new Set<() => void>();
function publish(next: typeof state) {
  state = next;
  for (const listener of listeners) listener();
}
export const getIndexState = () => state;
export function applyIndexStatus(status: IndexStatus) {
  if (state.status?.generation === status.generation && state.status.revision > status.revision) return;
  publish({ ...state, status });
}
export function resetIndexStatus() {
  epoch++;
  publish({ status: null, refresh: state.refresh + 1 });
}
export async function refreshIndexStatus() {
  const at = epoch;
  const before = state.status;
  const status = await api.indexStatus();
  if (at !== epoch) return;
  // WebSocket publication received after the request started is newer evidence.
  if (state.status === before) applyIndexStatus(status);
  publish({ ...state, refresh: state.refresh + 1 });
}
export function useIndexStatus() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, getIndexState, getIndexState);
}
export function indexStatusMessage(status: IndexStatus | null): string {
  if (!status) return '';
  if (status.phase === 'degraded') return 'Index updates are delayed. Results may be outdated.';
  if (!status.initialScanComplete) return status.available ? 'Checking changes. Cached results are preliminary.' : 'Indexing notes…';
  if (status.phase === 'rebuilding') return 'Rebuilding index. Showing the previous results.';
  if (status.phase === 'reconciling') return 'Checking changes…';
  if (status.persistenceError) return 'Index is current, but its cache could not be saved.';
  return '';
}
