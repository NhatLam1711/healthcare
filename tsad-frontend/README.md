# TSAD Monitor — Frontend (multi-file)

Same UI as the original single-file `index.html` (Tailwind classes, layout, and
copy are untouched), restructured into a real Vite + React project, with the
root causes of the reported lag/freeze fixed rather than papered over.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173, expects backend on :8080 (CORS already set up for this port)
npm run build    # production build -> dist/
```

## Structure

```
src/
  main.jsx                    entry point
  App.jsx                     composition root (only low-frequency UI state lives here)
  config.js                   API base URL, dataset/model lists, tuning constants
  store/datasetStore.js       streaming data lives HERE, not in React state (see below)
  hooks/
    useDatasetStream.js       SSE start/stop/clear lifecycle
    useDatasetMeta.js         fine-grained store subscriptions (status/points/isStreaming/visibleFeatures)
  components/
    Sidebar.jsx                dataset list + live indicator
    DatasetHeader.jsx          title, model picker, start/stop/clear, filter trigger
    FeatureFilterMenu.jsx      feature show/hide dropdown
    MetadataPanel.jsx          shape/dtype/length/dimension/anomaly% grid
    ChartPanel.jsx             chart title/status/points badge + reset-zoom button
    EChart.jsx                 the chart itself (perf-critical, see below)
    echartsSetup.js            modular echarts imports + series builder
  utils/
    colors.js, throttle.js
```

To adopt this in your existing Vite project: copy `src/`, `index.html`,
`vite.config.js`, and the `tailwindcss`/`@tailwindcss/vite` deps from
`package.json` over. Nothing on the backend needs to change.

## What was actually causing the lag (not just "split the file")

Splitting one 700-line HTML file into a dozen `.jsx` files by itself would not
have fixed the freezing on MSL — the slowdown had three concrete causes, all
fixed here:

1. **In-browser Babel + CDN React/ECharts.** The old page shipped
   `@babel/standalone` (a full JS parser+compiler, multiple MB) to
   transpile JSX *in the browser, on every page load*, plus the full
   ECharts UMD bundle and React from three separate CDN round-trips —
   all as render-blocking `<script>` tags. This build compiles JSX ahead
   of time and imports only the ECharts pieces actually used
   (`echarts/core` + `LineChart` + a few components), which alone took the
   production JS from several render-blocking megabytes to one
   **219 KB gzip** bundle (verified with `npm run build`). It also removes
   a live dependency on `unpkg`/`jsdelivr` staying up during your
   presentation.

2. **An O(n²) accuracy-band recompute.** `getChartOptions()` rebuilt the
   anomaly-color `markArea` by rescanning the *entire* `accuracies` array
   from index 0, on every redraw, while streaming. For MSL's 73,729 points
   that scan grows for the whole 30-second stream — this is the direct
   cause of the "MSL still lagging/crashing" and "freezes when API 3
   loads" reports. Fix: `store/datasetStore.js`'s `appendPoint()` now
   maintains the color segments incrementally (O(1) per point) in
   `state.bands`; `buildSeries()` only ever iterates the (small) list of
   finished segments, never the raw point history.

3. **`replaceMerge: ['series']` on every tick.** This option tells ECharts
   to *tear down and recreate* every series component on each call — the
   most expensive update mode ECharts has — and the old code used it for
   every single streamed point, not just for real structural changes.
   Series here now carry stable `id`s (`feature-0`, `accuracy-bands`, …);
   `EChart.jsx` only passes `replaceMerge` when the *set* of series
   actually changes (switching dataset, toggling a feature, clearing
   data) — a `version` counter in the store distinguishes that from a
   routine "new point" update, which just patches `data` in place.

On top of those three, a smaller architectural change removes a fourth,
compounding problem: the old code called `setTick(t => t + 1)` on the
top-level `App` component every 15 points, re-rendering the *entire* tree
(sidebar, header, both charts) dozens of times per second. Streaming data
now lives in `datasetStore.js`, outside React state; components subscribe
via `useSyncExternalStore` only to the small slice they render (a status
badge, a live-indicator dot), and `EChart.jsx` talks to the chart instance
imperatively — no re-render at all is needed to paint a new point.

`config.js`'s `MAX_REDRAW_FPS` (default 30) is the one knob to reach for if
a future dataset is still choppy: it throttles how often the chart repaints
regardless of how fast the SSE stream delivers points; data is never
dropped, only how often the screen is repainted with it.
