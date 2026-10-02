import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getFeatureColor } from '../../utils/colors';
import './EChart.css';

/**
 * ForecastEChart – dùng cho chế độ Forecasting & Imputation.
 *
 * Dữ liệu nhận từ state:
 *   state.labels       – array of x-axis labels
 *   state.values       – array of feature series (raw/original signal)
 *   state.predicted    – array of predicted series (model output), same shape as values
 *   state.regionStart  – index where the forecast/imputation region begins
 *   state.accuracies   – (unused for coloring here, but kept for compat)
 *
 * Nếu predicted chưa có thì chỉ vẽ đường gốc.
 * Khi có predicted:
 *   • Vùng trước regionStart: chỉ vẽ đường gốc (solid)
 *   • Vùng từ regionStart trở đi:
 *       – đường gốc (ground truth) – màu đậm, nét đứt
 *       – đường predicted – màu nhạt / khác, nét liền
 *   • Vùng forecast được tô nền nhẹ (markArea với nét đứt)
 */
const ForecastEChart = ({ activeDataset, type, datasetsStateRef, forceUpdate, taskMode }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    // Chỉ để quyết định có hiện placeholder "chưa có dữ liệu dự đoán" hay
    // không -- không dùng để vẽ (việc vẽ vẫn hoàn toàn bằng echarts imperative
    // như cũ, tránh re-render tốn kém lúc đang stream).
    const [hasPrediction, setHasPrediction] = useState(false);

    useEffect(() => {
        chartInstance.current = echarts.init(chartRef.current);

        const option = {
            animation: false,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                confine: true,
                enterable: true,
                extraCssText: 'max-height: 250px; overflow-y: auto; pointer-events: auto;',
                formatter: function (params) {
                    if (!params || !params.length) return '';
                    const sortedParams = [...params].sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0));
                    let html = `<div style="font-size:12px;color:#666;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee;">Index: <b style="color:#333">${String(params[0].axisValue).split('_')[0]}</b></div>`;
                    sortedParams.forEach(p => {
                        if (p.value === null || p.value === undefined) return;
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
            legend: {
                show: true,
                bottom: 30,
                left: 'center',
                textStyle: { fontSize: 11 },
                itemWidth: 20,
                itemHeight: 10,
            },
            grid: {
                left: '3%', right: '2%', bottom: '55px', top: '14px',
                containLabel: true
            },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 16, bottom: 30 }
            ],
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: []
            },
            yAxis: [
                { type: 'value', name: 'Value' },
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

    const getForecastOptions = (state, visibleFeatures) => {
        const series = [];
        const hasData = state.labels && state.labels.length > 0;
        const hasPredicted = hasData && state.predicted && state.predicted.length > 0;

        // CHƯA có dữ liệu "model đoán" thật (vì chưa gắn backend thật cho
        // Forecasting/Imputation) -- trước đây chỗ này âm thầm rơi xuống vẽ
        // đường dữ liệu gốc như bình thường, trông giống y hệt 1 chart đã
        // hoạt động hoàn chỉnh dù thực ra chưa có gì thật cả (đây là lỗi 1
        // bạn báo). Giờ trả về rỗng hẳn -- không vẽ đường nào -- để component
        // hiện rõ placeholder thay vì một biểu đồ gây hiểu lầm.
        if (!hasPredicted) {
            return { xAxis: { data: [] }, series: [], hasPredicted: false };
        }

        const regionStart = state.regionStart ?? Math.floor(state.labels.length * 0.7);

        const zoneLabel = taskMode === 'forecasting' ? 'Forecast Zone' : 'Imputation Zone';
        const zoneColor = taskMode === 'forecasting' ? 'rgba(59, 130, 246, 0.07)' : 'rgba(139, 92, 246, 0.07)';
        const zoneBorderColor = taskMode === 'forecasting' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(139, 92, 246, 0.5)';

        for (let i = 0; i < state.values.length; i++) {
            if (!visibleFeatures || !visibleFeatures.has(i)) continue;

            const baseColor = getFeatureColor(i);

            // Đến đây chắc chắn hasPredicted=true (nếu không đã return rỗng ở
            // trên rồi) nên không cần nhánh "else vẽ đường gốc bình thường"
            // nữa -- nhánh đó từng là nguồn gây lỗi 1 (tự vẽ ra như thật).

            // Đường ground truth: toàn bộ (solid trước vùng, dashed trong vùng)
            // Chia thành 2 đoạn để tạo hiệu ứng dashed rõ hơn
            const beforeRegionValues = state.values[i].map((v, idx) => idx < regionStart ? v : null);
            const afterRegionValues = state.values[i].map((v, idx) => idx >= regionStart - 1 ? v : null);

            // Đoạn ground truth trước vùng (solid)
            series.push({
                name: `Feature ${i + 1} (Ground Truth)`,
                type: 'line',
                symbol: 'none',
                lineStyle: { width: 1.5, color: baseColor, type: 'solid' },
                itemStyle: { color: baseColor },
                data: beforeRegionValues,
                connectNulls: false,
                legendHoverLink: false,
            });

            // Đoạn ground truth trong vùng (dashed)
            series.push({
                name: `Feature ${i + 1} (Ground Truth)`,
                type: 'line',
                symbol: 'none',
                lineStyle: { width: 1.5, color: baseColor, type: 'dashed', opacity: 0.8 },
                itemStyle: { color: baseColor },
                data: afterRegionValues,
                connectNulls: false,
                showInLegend: false,
            });

            // Đường predicted (solid, màu nhạt hơn / màu khác)
            const predictedColor = shiftHue(baseColor, 40);
            series.push({
                name: `Feature ${i + 1} (Predicted)`,
                type: 'line',
                symbol: 'none',
                lineStyle: { width: 2, color: predictedColor, type: 'solid' },
                itemStyle: { color: predictedColor },
                data: state.predicted[i] || [],
                connectNulls: true,
            });
        }

        // Vùng forecast/imputation (markArea nét đứt)
        if (regionStart !== null && state.labels[regionStart]) {
            series.push({
                name: zoneLabel,
                type: 'line',
                data: [],
                markArea: {
                    silent: true,
                    itemStyle: {
                        color: zoneColor,
                        borderColor: zoneBorderColor,
                        borderWidth: 1,
                        borderType: 'dashed',
                    },
                    label: {
                        show: true,
                        position: 'insideTopLeft',
                        color: zoneBorderColor,
                        fontSize: 10,
                        fontWeight: 600,
                        formatter: zoneLabel,
                    },
                    data: [[
                        { xAxis: state.labels[regionStart] },
                        { xAxis: state.labels[state.labels.length - 1] }
                    ]]
                },
            });
        }

        return {
            xAxis: {
                data: state.labels,
                axisLabel: {
                    formatter: (value) => value ? String(value).split('_')[0] : ''
                },
                axisPointer: {
                    label: {
                        formatter: (params) => params.value ? String(params.value).split('_')[0] : ''
                    }
                }
            },
            series,
            hasPredicted: true,
        };
    };

    const applyOptions = (state, visibleFeatures) => {
        const options = getForecastOptions(state, visibleFeatures);
        chartInstance.current.setOption(
            { xAxis: options.xAxis, series: options.series },
            { replaceMerge: ['series'] }
        );
        // Giá trị boolean nên React tự bỏ qua re-render nếu không đổi --
        // gọi vô tư mỗi lần vẽ lại mà không sợ tốn kém.
        setHasPrediction(options.hasPredicted);
    };

    useEffect(() => {
        if (!chartInstance.current || !activeDataset) return;
        const dsState = datasetsStateRef.current[activeDataset];
        if (!dsState) return;
        const state = dsState[type];
        const visibleFeatures = dsState.visibleFeatures;
        if (!state) return;
        applyOptions(state, visibleFeatures);
    }, [activeDataset, forceUpdate, type, taskMode]);

    useEffect(() => {
        let animationFrameId;
        const updateChart = () => {
            if (!chartInstance.current || !activeDataset) return;
            const dsState = datasetsStateRef.current[activeDataset];
            if (dsState) {
                const state = dsState[type];
                const visibleFeatures = dsState.visibleFeatures;
                if (state && state.isStreaming) {
                    applyOptions(state, visibleFeatures);
                }
            }
            setTimeout(() => {
                animationFrameId = requestAnimationFrame(updateChart);
            }, 120);
        };
        animationFrameId = requestAnimationFrame(updateChart);
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [activeDataset, type, taskMode]);

    window[`resetEChartZoom_forecast_${type}`] = () => {
        if (chartInstance.current) {
            chartInstance.current.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
        }
    };

    return (
        <div className="forecast-echart-wrap">
            <div ref={chartRef} className="echart"></div>
            {!hasPrediction && (
                <div className="forecast-echart__placeholder">
                    <p>Chưa có dữ liệu dự đoán.</p>
                    <p className="forecast-echart__placeholder-sub">
                        Tính năng {taskMode === 'forecasting' ? 'Forecasting' : 'Imputation'} chưa được gắn backend thật --
                        biểu đồ sẽ hiện khi model gửi về dữ liệu "predicted".
                    </p>
                </div>
            )}
        </div>
    );
};

/**
 * Dịch chuyển hue của màu hex để tạo màu khác biệt cho predicted series.
 * Đơn giản hóa: trả về màu có opacity nhẹ hơn + hue shift.
 */
function shiftHue(hexColor, degrees) {
    // Parse hex
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // RGB -> HSL
    const rN = r / 255, gN = g / 255, bN = b / 255;
    const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rN: h = ((gN - bN) / d + (gN < bN ? 6 : 0)) / 6; break;
            case gN: h = ((bN - rN) / d + 2) / 6; break;
            default: h = ((rN - gN) / d + 4) / 6; break;
        }
    }

    h = ((h * 360 + degrees) % 360) / 360;

    // HSL -> RGB
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p2 = 2 * l - q2;
    const rOut = Math.round(hue2rgb(p2, q2, h + 1 / 3) * 255);
    const gOut = Math.round(hue2rgb(p2, q2, h) * 255);
    const bOut = Math.round(hue2rgb(p2, q2, h - 1 / 3) * 255);

    return `rgb(${rOut},${gOut},${bOut})`;
}

export default ForecastEChart;
