import { DEFAULT_VISIBLE_FEATURE_COUNT } from '../config.js';

// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------------
// The original single-file version stored streaming data (labels/values/
// accuracies) in a ref, but still called `setTick(t => t + 1)` on the *App*
// component every ~15 points to make the UI aware new data existed. That
// re-rendered the entire component tree (sidebar, header, dropdowns, both
// charts) dozens of times per second for a 70k-point dataset.
//
// Here, streaming data lives in this module (plain JS objects, not React
// state) and components subscribe to only the slice they care about via
// useSyncExternalStore. High-frequency writes (appendPoint) never touch
// React at all; they just mark the dataset "dirty" and a single shared
// requestAnimationFrame loop flushes listeners at most once per frame.
// ---------------------------------------------------------------------------

const datasets = new Map(); // name -> { visibleFeatures, version, stream, evaluate }
const listenersByName = new Map(); // name -> Set<fn>
const eventSources = new Map(); // `${name}:${type}` -> EventSource

function createEmptyChartState() {
  return {
    labels: [],
    values: [],
    // Accuracy "bands" (used to paint the markArea overlay) are maintained
    // incrementally as points arrive (see appendPoint) instead of being
    // recomputed by scanning the full history on every redraw. That full-scan
    // was O(n) per redraw and, run every ~100ms against a 70k-point MSL
    // stream, is the main reason the old chart froze/crashed on that dataset.
    bands: [], // finished segments: [startIdx, endIdx, accuracyValue]
    openBand: { start: 0, acc: null }, // in-progress segment, closed lazily
    isStreaming: false,
    points: 0,
    status: 'Waiting to start...',
  };
}

function ensureDataset(name, dimension = 0) {
  if (datasets.has(name)) return datasets.get(name);
  const limit = dimension > 0 ? Math.min(DEFAULT_VISIBLE_FEATURE_COUNT, dimension) : DEFAULT_VISIBLE_FEATURE_COUNT;
  const visibleFeatures = new Set();
  for (let i = 0; i < limit; i++) visibleFeatures.add(i);

  const entry = {
    visibleFeatures,
    version: 0, // bumped only on STRUCTURAL changes (see module docstring below)
    stream: createEmptyChartState(),
    evaluate: createEmptyChartState(),
  };
  datasets.set(name, entry);
  return entry;
}

function getEntry(name) {
  return datasets.get(name) || null;
}

export function getChartState(name, type) {
  const entry = getEntry(name);
  return entry ? entry[type] : null;
}

export function getVisibleFeatures(name) {
  const entry = getEntry(name);
  return entry ? entry.visibleFeatures : null;
}

export function getVersion(name) {
  const entry = getEntry(name);
  return entry ? entry.version : -1;
}

// ---------------------------------------------------------------------------
// Notification scheduler: coalesce many synchronous mutations into one
// listener flush per animation frame, per dataset.
// ---------------------------------------------------------------------------
const dirtyNames = new Set();
let rafHandle = null;

function tick() {
  rafHandle = null;
  const names = Array.from(dirtyNames);
  dirtyNames.clear();
  for (const name of names) {
    const fns = listenersByName.get(name);
    if (fns) fns.forEach((fn) => fn());
  }
}

function markDirty(name) {
  dirtyNames.add(name);
  if (rafHandle == null) {
    rafHandle = requestAnimationFrame(tick);
  }
}

export function subscribe(name, listener) {
  if (!listenersByName.has(name)) listenersByName.set(name, new Set());
  listenersByName.get(name).add(listener);
  return () => listenersByName.get(name)?.delete(listener);
}

// ---------------------------------------------------------------------------
// Structural mutations (rare, user-triggered: pick dataset, toggle a
// feature checkbox, clear data). These bump `version` so the chart component
// knows it must fully rebuild its series set (replaceMerge) instead of just
// patching data into existing series.
// ---------------------------------------------------------------------------
export function selectDataset(name, dimension) {
  ensureDataset(name, dimension);
  markDirty(name);
}

export function setVisibleFeatures(name, updater) {
  const entry = getEntry(name);
  if (!entry) return;
  entry.visibleFeatures = typeof updater === 'function' ? updater(entry.visibleFeatures) : updater;
  entry.version += 1;
  markDirty(name);
}

export function applyDefaultVisibleFeatures(name, dimension) {
  const entry = getEntry(name);
  if (!entry) return;
  const onlyEmptySoFar = entry.stream.values.length === 0 && entry.evaluate.values.length === 0;
  if (!onlyEmptySoFar) return;
  const limit = Math.min(DEFAULT_VISIBLE_FEATURE_COUNT, dimension || 0);
  const next = new Set();
  for (let i = 0; i < limit; i++) next.add(i);
  entry.visibleFeatures = next;
  entry.version += 1;
  markDirty(name);
}

export function clearChartState(name, type) {
  const entry = getEntry(name);
  if (!entry) return;
  entry[type] = createEmptyChartState();
  entry[type].status = 'Cleared';
  entry.version += 1;
  markDirty(name);
}

// ---------------------------------------------------------------------------
// Streaming lifecycle (low frequency: one call per start/stop/complete/error)
// ---------------------------------------------------------------------------
export function beginStream(name, type, statusText) {
  const state = getChartState(name, type);
  if (!state) return;
  state.isStreaming = true;
  state.status = statusText;
  markDirty(name);
}

export function endStream(name, type, statusText) {
  const state = getChartState(name, type);
  if (!state) return;
  state.isStreaming = false;
  state.status = statusText;
  markDirty(name);
}

export function setEventSource(name, type, source) {
  eventSources.set(`${name}:${type}`, source);
}

export function getEventSource(name, type) {
  return eventSources.get(`${name}:${type}`) || null;
}

export function closeEventSource(name, type) {
  const key = `${name}:${type}`;
  const source = eventSources.get(key);
  if (source) {
    source.close();
    eventSources.delete(key);
  }
}

// ---------------------------------------------------------------------------
// High-frequency mutation: one call per SSE "point" event. Must stay O(1).
// ---------------------------------------------------------------------------
export function appendPoint(name, type, point) {
  const state = getChartState(name, type);
  if (!state) return;

  const idx = state.labels.length;
  state.labels.push(`${point.index}_${state.points}`);

  while (state.values.length < point.values.length) state.values.push([]);
  for (let i = 0; i < point.values.length; i++) {
    state.values[i].push(point.values[i]);
  }

  const acc = point.accuracy ?? null;
  if (acc !== state.openBand.acc) {
    if (state.openBand.acc !== null) {
      state.bands.push([state.openBand.start, idx - 1, state.openBand.acc]);
    }
    state.openBand = { start: idx, acc };
  }

  state.points += 1;
  markDirty(name); // cheap: just flags the name, the actual flush is rAF-batched
}
