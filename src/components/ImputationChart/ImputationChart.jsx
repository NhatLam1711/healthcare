import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts';
import './ImputationChart.css';

const COLORS = {
    observed: '#2563eb',    // blue-600 — giá trị thật, quan sát được
    imputed: '#7e22ce',     // purple-700 — median model dự đoán (đồng nhất accent "dự đoán" với Forecasting)
    groundTruth: '#1f2937', // gray-800 — giá trị thật tại điểm bị che (chỉ có khi type=imputed)
    band90: 'rgba(126, 34, 206, 0.12)',
    band50: 'rgba(126, 34, 206, 0.28)',
};

const LEGEND_NAMES = ['Observed', 'Imputed (median)', 'Ground Truth (masked)', 'Confidence 50%', 'Confidence 90%'];

const rangeOf = (upper, lower) => upper.map((u, i) => (u === null || lower[i] === null) ? null : u - lower[i]);

const buildOption = (replay) => {
    const { labels, observed, imputedMedian, groundTruth, lower90, upper90, lower50, upper50 } = replay;

    const series = [
        // Dải 90% (vẽ trước, nằm dưới) — base ẩn + phần hiển thị chồng lên trên base theo stack
        { name: '__band90_base', type: 'line', stack: 'band90', symbol: 'none', lineStyle: { opacity: 0 }, data: lower90, silent: true },
        { name: 'Confidence 90%', type: 'line', stack: 'band90', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: COLORS.band90 }, data: rangeOf(upper90, lower90), silent: true },
        // Dải 50% (vẽ sau, nằm trên, đậm hơn, nằm trong dải 90%)
        { name: '__band50_base', type: 'line', stack: 'band50', symbol: 'none', lineStyle: { opacity: 0 }, data: lower50, silent: true },
        { name: 'Confidence 50%', type: 'line', stack: 'band50', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: COLORS.band50 }, data: rangeOf(upper50, lower50), silent: true },
        {
            name: 'Ground Truth (masked)', type: 'line', symbol: 'circle', symbolSize: 5,
            lineStyle: { width: 0 }, itemStyle: { color: COLORS.groundTruth }, data: groundTruth,
        },
        {
            name: 'Imputed (median)', type: 'line', symbol: 'none',
            lineStyle: { width: 1.5, type: 'dashed', color: COLORS.imputed },
            itemStyle: { color: COLORS.imputed }, data: imputedMedian,
        },
        {
            name: 'Observed', type: 'line', symbol: 'none',
            lineStyle: { width: 1.5, color: COLORS.observed },
            itemStyle: { color: COLORS.observed }, data: observed,
        },
    ];

    return { xAxis: { data: labels }, series };
};

const ImputationChart = forwardRef(({ replay, forceUpdate }, ref) => {
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
                formatter: (params) => {
                    const visible = params.filter((p) => !p.seriesName.startsWith('__') && p.value !== null && p.value !== undefined);
                    if (!visible.length) return '';
                    let html = `<div style="font-size:12px;color:#666;margin-bottom:4px;">t = <b>${params[0].axisValue}</b></div>`;
                    visible.forEach((p) => {
                        const val = typeof p.value === 'number' ? p.value.toFixed(4) : p.value;
                        html += `<div style="display:flex;justify-content:space-between;gap:16px;font-size:12px;">
                            <span>${p.marker}${p.seriesName}</span><span style="font-family:monospace">${val}</span>
                        </div>`;
                    });
                    return html;
                },
            },
            legend: { show: true, bottom: 0, data: LEGEND_NAMES, textStyle: { fontSize: 11 } },
            grid: { left: '3%', right: '2%', bottom: '50px', top: '10px', containLabel: true },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, filterMode: 'none' },
            ],
            xAxis: { type: 'category', name: 't', nameLocation: 'middle', nameGap: 30, boundaryGap: false, data: [] },
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
            if (chartInstance.current && replay && replay.phase === 'streaming') {
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

    return <div ref={chartRef} className="imputation-chart"></div>;
});

export default ImputationChart;
