import FeatureFilterDropdown from '../FeatureFilterDropdown/FeatureFilterDropdown';
import MetadataGrid from '../MetadataGrid/MetadataGrid';
import './DatasetToolbar.css';

const DatasetToolbar = ({
    activeDataset,
    selectedModel,
    availableModels,
    onModelChange,
    isEvaluateStreaming,
    isAnyStreaming,
    onStartBoth,
    onStopBoth,
    onClearBoth,
    isFilterOpen,
    onToggleFilter,
    onCloseFilter,
    visibleFeatures,
    numFeatures,
    onSelectAllFeatures,
    onSelectNoneFeatures,
    onToggleFeature,
    onRefresh,
    error,
    info,
}) => {
    return (
        <div className="dataset-toolbar">
            <div className="dataset-toolbar__row">
                <h2 className="dataset-toolbar__title">Dataset: {activeDataset}</h2>

                <div className="dataset-toolbar__actions">
                    <div className="model-select">
                        <span className="model-select__label">API 3 Model:</span>
                        <select
                            className="model-select__input"
                            value={selectedModel}
                            onChange={(e) => onModelChange(e.target.value)}
                            disabled={isEvaluateStreaming}
                        >
                            {availableModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {!isAnyStreaming ? (
                        <button onClick={onStartBoth} className="btn btn--primary">
                            Start Streaming
                        </button>
                    ) : (
                        <button onClick={onStopBoth} className="btn btn--danger">
                            Stop Streaming
                        </button>
                    )}

                    <button onClick={onClearBoth} className="btn btn--muted" title="Clear Data">
                        Clear Data
                    </button>

                    <FeatureFilterDropdown
                        isOpen={isFilterOpen}
                        onToggleOpen={onToggleFilter}
                        onClose={onCloseFilter}
                        visibleFeatures={visibleFeatures}
                        numFeatures={numFeatures}
                        onSelectAll={onSelectAllFeatures}
                        onSelectNone={onSelectNoneFeatures}
                        onToggleFeature={onToggleFeature}
                    />

                    <button onClick={onRefresh} className="btn btn--link">
                        <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        Refresh Metadata
                    </button>
                </div>
            </div>

            <MetadataGrid error={error} info={info} />
        </div>
    );
};

export default DatasetToolbar;
