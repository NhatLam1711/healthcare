import ImputationChart from '../ImputationChart/ImputationChart';
import '../ChartPanel/ChartPanel.css';

const ImputationChartPanel = ({ chartRef, replay, forceUpdate, totalPoints }) => {
    const isStreaming = replay?.phase === 'streaming';
    const statusClass = isStreaming
        ? 'chart-panel__status--streaming animate-pulse'
        : replay?.status?.includes('Error')
            ? 'chart-panel__status--error'
            : 'chart-panel__status--idle';

    return (
        <div className="chart-panel">
            <div className="chart-panel__header">
                <div className="chart-panel__title-group">
                    <h3 className="chart-panel__title">Series Reconstruction</h3>
                    <span className={`chart-panel__status ${statusClass}`}>{replay?.status}</span>
                </div>

                <div className="chart-panel__meta">
                    <span className="chart-panel__points">Pts: {replay?.points || 0}/{totalPoints ?? '?'}</span>
                    <button onClick={() => chartRef.current?.resetZoom()} className="chart-panel__reset-btn">
                        Reset Zoom
                    </button>
                </div>
            </div>

            <div className="chart-panel__chart-wrap">
                <ImputationChart ref={chartRef} replay={replay} forceUpdate={forceUpdate} />
            </div>
        </div>
    );
};

export default ImputationChartPanel;
