import ForecastChart from '../ForecastChart/ForecastChart';
import '../ChartPanel/ChartPanel.css';

const ForecastChartPanel = ({ chartRef, replay, forceUpdate }) => {
    const phase = replay?.phase || 'idle';
    const isStreaming = phase === 'historical' || phase === 'forecast';
    const statusClass = isStreaming
        ? 'chart-panel__status--streaming animate-pulse'
        : replay?.status?.includes('Error')
            ? 'chart-panel__status--error'
            : 'chart-panel__status--idle';

    const totalPoints = (replay?.historical.points || 0) + (replay?.forecast.points || 0);

    return (
        <div className="chart-panel">
            <div className="chart-panel__header">
                <div className="chart-panel__title-group">
                    <h3 className="chart-panel__title">Historical &amp; Forecast</h3>
                    <span className={`chart-panel__status ${statusClass}`}>{replay?.status}</span>
                </div>

                <div className="chart-panel__meta">
                    <span className="chart-panel__points">Pts: {totalPoints}/192</span>
                    <button onClick={() => chartRef.current?.resetZoom()} className="chart-panel__reset-btn">
                        Reset Zoom
                    </button>
                </div>
            </div>

            <div className="chart-panel__chart-wrap">
                <ForecastChart ref={chartRef} replay={replay} forceUpdate={forceUpdate} />
            </div>
        </div>
    );
};

export default ForecastChartPanel;
