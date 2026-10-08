import './MetadataGrid.css';

const MetadataGrid = ({ error, loading, items }) => {
    if (error) {
        return <div className="metadata-error">{error}</div>;
    }

    if (loading || !items) {
        return <p className="metadata-loading animate-pulse">Loading metadata...</p>;
    }

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
