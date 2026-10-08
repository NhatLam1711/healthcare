import TargetSelector from '../TargetSelector/TargetSelector';
import MetadataGrid from '../MetadataGrid/MetadataGrid';
import '../DatasetToolbar/DatasetToolbar.css';

const ForecastToolbar = ({
    datasetLabel,
    targets,
    selectedTarget,
    onSelectTarget,
    isStreaming,
    onStart,
    onStop,
    onClear,
    onRefreshMetadata,
    metadataError,
    metadataLoading,
    metadataItems,
}) => {
    return (
        <div className="dataset-toolbar">
            <div className="dataset-toolbar__row">
                <h2 className="dataset-toolbar__title">Dataset: {datasetLabel}</h2>

                <div className="dataset-toolbar__actions">
                    <TargetSelector
                        targets={targets}
                        selectedTarget={selectedTarget}
                        onSelectTarget={onSelectTarget}
                        disabled={isStreaming}
                    />

                    {!isStreaming ? (
                        <button onClick={onStart} className="btn btn--primary">
                            Start Streaming
                        </button>
                    ) : (
                        <button onClick={onStop} className="btn btn--danger">
                            Stop Streaming
                        </button>
                    )}

                    <button onClick={onClear} className="btn btn--muted" title="Clear Data">
                        Clear Data
                    </button>

                    <button onClick={onRefreshMetadata} className="btn btn--link">
                        <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        Refresh Metadata
                    </button>
                </div>
            </div>

            <MetadataGrid error={metadataError} loading={metadataLoading} items={metadataItems} />
        </div>
    );
};

export default ForecastToolbar;
