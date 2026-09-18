import './MetadataGrid.css';

const MetadataGrid = ({ error, info }) => {
    if (error) {
        return <div className="metadata-error">{error}</div>;
    }

    if (!info) {
        return <p className="metadata-loading animate-pulse">Loading metadata...</p>;
    }

    const items = [
        { label: 'Datapath', value: info.datapath },
        { label: 'Shape', value: `[${info.shape.join(', ')}]` },
        { label: 'DType', value: info.dtype },
        { label: 'Length', value: info.length },
        { label: 'Dimension', value: info.dimension },
        {
            label: 'Anomaly %',
            value: info.anomalyPercent !== null
                ? <span className="metadata-grid__anomaly">{parseFloat(info.anomalyPercent).toFixed(2)}%</span>
                : <span className="metadata-grid__na">N/A</span>
        },
    ];

    return (
        <div className="metadata-grid">
            {items.map((item, idx) => (
                <div key={idx} className="metadata-grid__item">
                    <p className="metadata-grid__label">{item.label}</p>
                    <p className="metadata-grid__value" title={String(item.value)}>{item.value}</p>
                </div>
            ))}
        </div>
    );
};

export default MetadataGrid;
