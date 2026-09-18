import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { echarts, BASE_OPTION, buildSeries } from './echartsSetup.js';
import { getChartState, getVersion, getVisibleFeatures, subscribe } from '../store/datasetStore.js';
import { throttleTrailing } from '../utils/throttle.js';
import { MAX_REDRAW_FPS } from '../config.js';

/**
 * Renders one chart (used for both the "Live Telemetry" and "Anomaly
 * Detection" panels). This component deliberately never stores streaming
 * data in React state or props -- it reads straight from the store and
 * calls chart.setOption() imperatively. That keeps the (expensive) work of
 * painting a growing time series entirely off React's reconciliation path,
 * which only needs to run when the *dataset switches*, not on every point.
 *
 * Update strategy:
 * - Series identity (which feature lines + the accuracy-bands series exist)
 *   only changes on structural events: switching dataset, toggling the
 *   feature filter, or clearing data. Those use `replaceMerge: ['series']`.
 * - Routine "a new point arrived" updates reuse the SAME series ids and rely
 *   on ECharts' default merge to patch `data` in place, which is far cheaper
 *   than tearing down and rebuilding series components on every tick.
 */
const EChart = forwardRef(function EChart({ datasetName, type }, ref) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const lastVersionRef = useRef(-1);

  useEffect(() => {
    const chart = echarts.init(containerRef.current);
    chart.setOption(BASE_OPTION);
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!datasetName) return undefined;
    lastVersionRef.current = -1; // force one structural rebuild for the newly selected dataset

    const redraw = throttleTrailing(() => {
      const chart = chartRef.current;
      const state = getChartState(datasetName, type);
      if (!chart || !state) return;

      const visibleFeatures = getVisibleFeatures(datasetName);
      const version = getVersion(datasetName);
      const isStructural = version !== lastVersionRef.current;
      lastVersionRef.current = version;

      chart.setOption(
        { xAxis: { data: state.labels }, series: buildSeries(state, visibleFeatures) },
        { replaceMerge: isStructural ? ['series'] : [] }
      );
    }, 1000 / MAX_REDRAW_FPS);

    redraw(); // paint immediately for the newly active dataset, don't wait for the next data point
    return subscribe(datasetName, redraw);
  }, [datasetName, type]);

  useImperativeHandle(ref, () => ({
    resetZoom() {
      chartRef.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    },
  }));

  return <div ref={containerRef} className="w-full h-full" />;
});

export default EChart;
