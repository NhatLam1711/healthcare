export const API_BASE_URL = 'http://localhost:8080/api/v1/dataset';

export const DATASETS = ['2Dgesture', 'MSL'];

export const AVAILABLE_MODELS = ['isolation-forest-v1', 'autoencoder', 'lstm'];

export const DEFAULT_VISIBLE_FEATURE_COUNT = 5;

// UI redraw cadence, decoupled from SSE ingestion rate. Data arrays are always
// updated immediately (cheap, synchronous pushes); React/ECharts repaints are
// coalesced to at most once per animation frame, and further capped here so a
// very fast stream (thousands of points/sec) can't force more paints than the
// screen -- or the demo laptop's GPU -- can actually keep up with.
export const MAX_REDRAW_FPS = 30;
