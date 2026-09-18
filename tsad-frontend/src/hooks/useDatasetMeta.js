import { useRef, useSyncExternalStore } from 'react';
import { subscribe, getChartState, getVisibleFeatures } from '../store/datasetStore.js';

const EMPTY_META = { status: '', points: 0, isStreaming: false };
const emptySubscribe = () => () => {};

/**
 * Subscribes to {status, points, isStreaming} for one dataset+type ('stream'
 * or 'evaluate'). Returns a cached object reference when nothing in the slice
 * actually changed, which is what lets useSyncExternalStore skip a re-render
 * instead of firing on every store notification regardless of relevance.
 */
export function useStreamMeta(name, type) {
  const cache = useRef(EMPTY_META);

  return useSyncExternalStore(
    name ? (cb) => subscribe(name, cb) : emptySubscribe,
    () => {
      const state = name ? getChartState(name, type) : null;
      if (!state) return EMPTY_META;
      const prev = cache.current;
      if (prev.status === state.status && prev.points === state.points && prev.isStreaming === state.isStreaming) {
        return prev;
      }
      const next = { status: state.status, points: state.points, isStreaming: state.isStreaming };
      cache.current = next;
      return next;
    }
  );
}

/** True if EITHER the stream or evaluate channel is currently running. Used by the sidebar's live-indicator dot. */
export function useDatasetActivity(name) {
  return useSyncExternalStore(
    name ? (cb) => subscribe(name, cb) : emptySubscribe,
    () => {
      const stream = name ? getChartState(name, 'stream') : null;
      const evaluate = name ? getChartState(name, 'evaluate') : null;
      return Boolean(stream?.isStreaming || evaluate?.isStreaming);
    }
  );
}

/** The live Set of visible feature indices for a dataset (identity changes only on real updates). */
export function useVisibleFeatures(name) {
  return useSyncExternalStore(
    name ? (cb) => subscribe(name, cb) : emptySubscribe,
    () => (name ? getVisibleFeatures(name) : null)
  );
}
