import EChart from '../EChart/EChart';
import './ChartPanel.css';

const ChartPanel = ({ title, activeDataset, type, datasetsStateRef, forceUpdate, status, isStreaming, points }) => {
    const statusClass = isStreaming
        ? 'chart-panel__status--streaming animate-pulse'
        : status?.includes('Error')
            ? 'chart-panel__status--error'
            : 'chart-panel__status--idle';

    return (
        <div className="chart-panel">
            <div className="chart-panel__header">
                <div className="chart-panel__title-group">
                    <h3 className="chart-panel__title">{title}</h3>
                    <span className={`chart-panel__status ${statusClass}`}>{status}</span>
                </div>

                <div className="chart-panel__meta">
                    <span className="chart-panel__points">Pts: {points || 0}</span>
                    <button
                        onClick={() => window[`resetEChartZoom_${type}`] && window[`resetEChartZoom_${type}`]()}
                        className="chart-panel__reset-btn"
                    >
                        Reset Zoom
                    </button>
                </div>
            </div>

            <div className="chart-panel__chart-wrap">
                <EChart activeDataset={activeDataset} type={type} datasetsStateRef={datasetsStateRef} forceUpdate={forceUpdate} />
            </div>
        </div>
    );
};

export default ChartPanel;
