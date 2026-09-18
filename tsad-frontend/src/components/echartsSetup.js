import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { getFeatureColor } from '../utils/colors.js';

// Registering only what this dashboard uses (line chart, grid/tooltip/dataZoom,
// canvas renderer) instead of importing the full echarts UMD bundle. This is
// the same reason `import { pick } from 'lodash-es'` beats `import _ from 'lodash'`
// -- it keeps the shipped bundle to what's actually used, which on a laptop
// doing live SSE rendering also means less JS for the browser to parse up front.
echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

export { echarts };

const BAND_COLORS = {
  0: 'rgba(0, 0, 0, 0)',
  1: 'rgba(59, 130, 246, 0.3)',
  2: 'rgba(234, 179, 8, 0.3)',
  3: 'rgba(239, 68, 68, 0.3)',
};

export const BASE_OPTION = {
  animation: false,
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross' },
    confine: true,
    enterable: true,
    className: 'echarts-tooltip',
    extraCssText: 'max-height: 250px; overflow-y: auto; pointer-events: auto;',
    formatter(params) {
      if (!params || !params.length) return '';
      const sorted = [...params].sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0));
      let html = `<div style="font-size:12px;color:#666;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee;">Index: <b style="color:#333">${String(params[0].axisValue).split('_')[0]}</b></div>`;
      sorted.forEach((p) => {
        const isZero = p.value === 0;
        const valStyle = isZero ? 'color: #999; font-weight: normal;' : 'color: #111; font-weight: bold;';
        const bgStyle = isZero ? '' : 'background-color: rgba(0,0,0,0.03); border-radius: 4px;';
        html += `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:20px;padding:2px 4px;${bgStyle}">
            <div style="display:flex;align-items:center;gap:6px">
              ${p.marker}
              <span style="font-size:13px;${isZero ? 'color:#777' : 'color:#111;font-weight:500'}">${p.seriesName}</span>
            </div>
            <span style="font-size:13px;font-family:monospace;${valStyle}">${p.value}</span>
          </div>
        `;
      });
      return html;
    },
  },
  legend: { show: false },
  grid: { left: '3%', right: '2%', bottom: '30px', top: '10px', containLabel: true },
  dataZoom: [
    { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
    { type: 'slider', xAxisIndex: 0, filterMode: 'none' },
  ],
  xAxis: {
    type: 'category',
    name: 'Time/Index',
    nameLocation: 'middle',
    nameGap: 25,
    boundaryGap: false,
    data: [],
    axisLabel: { formatter: (value) => (value ? String(value).split('_')[0] : '') },
    axisPointer: { label: { formatter: (params) => (params.value ? String(params.value).split('_')[0] : '') } },
  },
  yAxis: { type: 'value', name: 'Sensor Value' },
  series: [],
};

/**
 * Builds the series array for one redraw. Cost is O(visible features) +
 * O(bands) -- NOT O(total points collected so far) -- because `state.bands`
 * is already maintained incrementally by the store on every appendPoint call.
 * The old version rebuilt this by scanning `state.accuracies` from index 0
 * every single redraw, which is what turned a 70k-point MSL stream into a
 * frozen tab (an O(n) scan, ~10x/sec, growing linearly for the life of the
 * stream -- classic accidental O(n^2)).
 */
export function buildSeries(state, visibleFeatures) {
  const series = [];

  for (let i = 0; i < state.values.length; i++) {
    if (visibleFeatures?.has(i)) {
      series.push({
        id: `feature-${i}`,
        name: `Feature ${i + 1}`,
        type: 'line',
        symbol: 'none',
        sampling: 'lttb', // downsample for display only -- raw data is untouched
        lineStyle: { width: 1.5 },
        itemStyle: { color: getFeatureColor(i) },
        data: state.values[i],
      });
    }
  }

  const hasBands = state.bands.length > 0 || state.openBand.acc !== null;
  if (hasBands) {
    const markAreaData = state.bands.map(([startIdx, endIdx, acc]) => [
      { xAxis: state.labels[startIdx], itemStyle: { color: BAND_COLORS[acc] ?? 'rgba(0,0,0,0)' } },
      { xAxis: state.labels[endIdx] },
    ]);

    // Extend the still-open segment to the latest point so the color shows
    // up live while streaming, without re-deriving the whole band list.
    if (state.openBand.acc !== null && state.labels.length > 0) {
      markAreaData.push([
        { xAxis: state.labels[state.openBand.start], itemStyle: { color: BAND_COLORS[state.openBand.acc] ?? 'rgba(0,0,0,0)' } },
        { xAxis: state.labels[state.labels.length - 1] },
      ]);
    }

    series.push({
      id: 'accuracy-bands',
      name: 'Accuracy Bands',
      type: 'line',
      markArea: { silent: true, data: markAreaData },
      data: [],
    });
  }

  return series;
}
