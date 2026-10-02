import './Sidebar.css';

const DATASETS = ['2Dgesture', 'MSL'];

const Sidebar = ({ activeDataset, datasetsStateRef, onSelectDataset }) => {
    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <h1 className="sidebar__title">TSAD Monitor</h1>
                <p className="sidebar__subtitle">Anomaly Detection</p>
            </div>
            <div className="sidebar__body">
                <h2 className="sidebar__section-title">Select Dataset</h2>
                <div className="sidebar__list">
                    {DATASETS.map(m => {
                        const isStreaming = datasetsStateRef.current[m]?.stream.isStreaming || datasetsStateRef.current[m]?.evaluate.isStreaming;
                        const isActive = activeDataset === m;
                        return (
                            <button
                                key={m}
                                onClick={() => onSelectDataset(m)}
                                className={`dataset-button ${isActive ? 'dataset-button--active' : ''}`}
                            >
                                <div className="dataset-button__left">
                                    {isStreaming && (
                                        <span className="streaming-dot">
                                            <span className="streaming-dot__ping animate-ping"></span>
                                            <span className="streaming-dot__core"></span>
                                        </span>
                                    )}
                                    <span className={`dataset-button__label ${isActive ? 'dataset-button__label--active' : ''}`}>{m}</span>
                                </div>
                                {isActive && (
                                    <svg className="dataset-button__check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
