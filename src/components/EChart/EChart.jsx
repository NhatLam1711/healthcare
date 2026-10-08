import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { getFeatureColor } from '../../utils/colors';
import './EChart.css';

const EChart = ({ activeDataset, type, datasetsStateRef, forceUpdate }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        chartInstance.current = echarts.init(chartRef.current);

        const option = {
            animation: false,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                confine: true,
                enterable: true,
                className: 'echarts-tooltip',
                extraCssText: 'max-height: 250px; overflow-y: auto; pointer-events: auto;',
                formatter: function (params) {
                    if (!params || !params.length) return '';
                    const sortedParams = [...params].sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0));
                    let html = `<div style="font-size:12px;color:#666;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee;">Index: <b style="color:#333">${String(params[0].axisValue).split('_')[0]}</b></div>`;
                    sortedParams.forEach(p => {
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
                }
            },
            legend: { show: false },
            grid: {
                left: '3%', right: '2%', bottom: '30px', top: '10px',
                containLabel: true
            },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, filterMode: 'none' }
            ],
            xAxis: {
                type: 'category', name: 'Time/Index', nameLocation: 'middle', nameGap: 25, boundaryGap: false,
                data: []
            },
            yAxis: [
                { type: 'value', name: 'Sensor Value' },
                { type: 'value', name: 'Accuracy', show: false, min: -1, max: 4, splitLine: { show: false } }
            ],
            series: []
        };

        chartInstance.current.setOption(option);

        const resizeObserver = new ResizeObserver(() => {
            chartInstance.current?.resize();
        });
        if (chartRef.current) resizeObserver.observe(chartRef.current);

        return () => {
            resizeObserver.disconnect();
            chartInstance.current?.dispose();
        };
    }, []);

    const getChartOptions = (state, visibleFeatures) => {
        const series = [];
        for (let i = 0; i < state.values.length; i++) {
            if (visibleFeatures && visibleFeatures.has(i)) {
                series.push({
                    name: `Feature ${i + 1}`,
                    type: 'line',
                    symbol: 'none',
                    lineStyle: { width: 1.5 },
                    itemStyle: { color: getFeatureColor(i) },
                    data: state.values[i]
                });
            }
        }

        const hasAccuracy = state.accuracies && state.accuracies.some(a => a !== null);
        if (hasAccuracy) {
            const markAreaData = [];
            let startIdx = null;
            let currentAcc = null;

            for (let i = 0; i < state.accuracies.length; i++) {
                const acc = state.accuracies[i];
                if (acc !== currentAcc) {
                    if (currentAcc !== null && startIdx !== null) {
                        let color = 'rgba(0,0,0,0)';
                        if (currentAcc === 0) color = 'rgba(0, 0, 0, 0)';
                        else if (currentAcc === 1) color = 'rgba(59, 130, 246, 0.3)';
                        else if (currentAcc === 2) color = 'rgba(234, 179, 8, 0.3)';
                        else if (currentAcc === 3) color = 'rgba(239, 68, 68, 0.3)';

                        markAreaData.push([
                            { xAxis: state.labels[startIdx], itemStyle: { color: color } },
                            { xAxis: state.labels[i - 1] }
                        ]);
                    }
                    startIdx = acc !== null ? i : null;
                    currentAcc = acc;
                }
            }

            if (currentAcc !== null && startIdx !== null && startIdx < state.accuracies.length) {
                let color = 'rgba(0,0,0,0)';
                if (currentAcc === 0) color = 'rgba(0, 0, 0, 0)';
                else if (currentAcc === 1) color = 'rgba(59, 130, 246, 0.3)';
                else if (currentAcc === 2) color = 'rgba(234, 179, 8, 0.3)';
                else if (currentAcc === 3) color = 'rgba(239, 68, 68, 0.3)';

                markAreaData.push([
                    { xAxis: state.labels[startIdx], itemStyle: { color: color } },
                    { xAxis: state.labels[state.labels.length - 1] }
                ]);
            }

            series.push({
                name: 'Accuracy Bands',
                type: 'line',
                markArea: { silent: true, data: markAreaData },
                data: []
            });
        }

        return {
            xAxis: {
                data: state.labels,
                axisLabel: {
                    formatter: function (value) {
                        return value ? String(value).split('_')[0] : '';
                    }
                },
                axisPointer: {
                    label: {
                        formatter: function (params) {
                            return params.value ? String(params.value).split('_')[0] : '';
                        }
                    }
                }
            },
            yAxis: { type: 'value', name: 'Sensor Value' },
            series: series
        };
    };

    useEffect(() => {
        if (!chartInstance.current || !activeDataset) return;
        const dsState = datasetsStateRef.current[activeDataset];
        if (!dsState) return;
        const state = dsState[type];
        const visibleFeatures = dsState.visibleFeatures;
        if (!state) return;
        chartInstance.current.setOption(getChartOptions(state, visibleFeatures), { replaceMerge: ['series'] });
    }, [activeDataset, forceUpdate, type]);

    useEffect(() => {
        let animationFrameId;
        const updateChart = () => {
            if (!chartInstance.current || !activeDataset) return;
            const dsState = datasetsStateRef.current[activeDataset];
            if (dsState) {
                const state = dsState[type];
                const visibleFeatures = dsState.visibleFeatures;
                if (state && state.isStreaming) {
                    chartInstance.current.setOption(getChartOptions(state, visibleFeatures), { replaceMerge: ['series'] });
                }
            }
            setTimeout(() => {
                animationFrameId = requestAnimationFrame(updateChart);
            }, 100);
        };

        animationFrameId = requestAnimationFrame(updateChart);
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [activeDataset, type]);

    window[`resetEChartZoom_${type}`] = () => {
        if (chartInstance.current) {
            chartInstance.current.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
        }
    };

    return <div ref={chartRef} className="echart"></div>;
};

export default EChart;
