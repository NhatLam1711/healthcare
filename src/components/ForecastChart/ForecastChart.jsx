import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts';
import './ForecastChart.css';

const SERIES_COLORS = {
    historical: '#2563eb', // blue-600 — observed past (same accent as Anomaly Detection)
    actual: '#1f2937',     // gray-800 — ground truth during the forecast window
    forecast: '#7e22ce',   // purple-700 — model prediction (Forecasting task accent)
};

const padSeries = (values, totalLength, offset) => {
    const out = new Array(totalLength).fill(null);
    for (let i = 0; i < values.length; i++) out[offset + i] = values[i];
    return out;
};

const buildOption = (replay) => {
    const historicalLabels = replay.historical.labels;
    const forecastLabels = replay.forecast.labels;
    const labels = [...historicalLabels, ...forecastLabels];
    const total = labels.length;
    const series = [];

    if (historicalLabels.length > 0) {
        series.push({
            name: 'Historical (Actual)',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 1.5, color: SERIES_COLORS.historical },
            itemStyle: { color: SERIES_COLORS.historical },
            data: padSeries(replay.historical.actual, total, 0),
        });
    }

    if (forecastLabels.length > 0) {
        series.push({
            name: 'Actual (Comparison)',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 1.5, color: SERIES_COLORS.actual },
            itemStyle: { color: SERIES_COLORS.actual },
            data: padSeries(replay.forecast.actual, total, historicalLabels.length),
        });
        series.push({
            name: 'Forecast',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 1.5, type: 'dashed', color: SERIES_COLORS.forecast },
            itemStyle: { color: SERIES_COLORS.forecast },
            data: padSeries(replay.forecast.forecast, total, historicalLabels.length),
        });
    }

    if (historicalLabels.length > 0 && forecastLabels.length > 0) {
        series[series.length - 1].markLine = {
            symbol: 'none',
            silent: true,
            lineStyle: { color: '#9ca3af', type: 'dashed' },
            label: { formatter: 'Forecast starts', color: '#6b7280', fontSize: 11 },
            data: [{ xAxis: historicalLabels[historicalLabels.length - 1] }],
        };
    }

    return {
        xAxis: { data: labels },
        series,
    };
};

const ForecastChart = forwardRef(({ replay, forceUpdate }, ref) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        chartInstance.current = echarts.init(chartRef.current);

        chartInstance.current.setOption({
            animation: false,
            tooltip: {
                trigger: 'axis',
                confine: true,
                extraCssText: 'max-height: 250px; overflow-y: auto;',
            },
            legend: { show: true, bottom: 0, textStyle: { fontSize: 11 } },
            grid: { left: '3%', right: '2%', bottom: '50px', top: '10px', containLabel: true },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, filterMode: 'none' },
            ],
            xAxis: {
                type: 'category', name: 'Timestamp', nameLocation: 'middle', nameGap: 30, boundaryGap: false,
                data: [],
            },
            yAxis: { type: 'value', name: 'Value' },
            series: [],
        });

        const resizeObserver = new ResizeObserver(() => chartInstance.current?.resize());
        if (chartRef.current) resizeObserver.observe(chartRef.current);

        return () => {
            resizeObserver.disconnect();
            chartInstance.current?.dispose();
        };
    }, []);

    useEffect(() => {
        if (!chartInstance.current || !replay) return;
        chartInstance.current.setOption(buildOption(replay), { replaceMerge: ['series'] });
    }, [replay, forceUpdate]);

    useEffect(() => {
        let animationFrameId;
        const update = () => {
            if (chartInstance.current && replay && (replay.phase === 'historical' || replay.phase === 'forecast')) {
                chartInstance.current.setOption(buildOption(replay), { replaceMerge: ['series'] });
            }
            setTimeout(() => {
                animationFrameId = requestAnimationFrame(update);
            }, 100);
        };
        animationFrameId = requestAnimationFrame(update);
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [replay]);

    useImperativeHandle(ref, () => ({
        resetZoom: () => {
            chartInstance.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
        },
    }));

    return <div ref={chartRef} className="forecast-chart"></div>;
});

export default ForecastChart;
