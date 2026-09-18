import { AVAILABLE_MODELS } from '../config.js';
import { useStreamMeta, useVisibleFeatures } from '../hooks/useDatasetMeta.js';
import FeatureFilterMenu from './FeatureFilterMenu.jsx';

export default function DatasetHeader({
  activeDataset,
  dimension,
  selectedModel,
  onModelChange,
  isFilterOpen,
  onToggleFilter,
  onCloseFilter,
  onStartBoth,
  onStopBoth,
  onClearBoth,
  onRefresh,
}) {
  const streamMeta = useStreamMeta(activeDataset, 'stream');
  const evaluateMeta = useStreamMeta(activeDataset, 'evaluate');
  const visibleFeatures = useVisibleFeatures(activeDataset);
  const isAnyStreaming = streamMeta.isStreaming || evaluateMeta.isStreaming;

  return (
    <div className="flex flex-wrap gap-4 justify-between items-center mb-2">
      <h2 className="text-xl font-bold text-gray-800">Dataset: {activeDataset}</h2>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
          <span className="text-xs font-semibold text-gray-500">API 3 Model:</span>
          <select
            className="border-none bg-transparent text-sm font-medium text-blue-700 focus:ring-0 outline-none cursor-pointer"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={evaluateMeta.isStreaming}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {!isAnyStreaming ? (
          <button onClick={onStartBoth} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition">
            Start Streaming
          </button>
        ) : (
          <button onClick={onStopBoth} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition">
            Stop Streaming
          </button>
        )}

        <button onClick={onClearBoth} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition" title="Clear Data">
          Clear Data
        </button>

        <div className="relative">
          <button
            onClick={onToggleFilter}
            className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
            </svg>
            Filter ({visibleFeatures?.size || 0})
          </button>
          <FeatureFilterMenu datasetName={activeDataset} dimension={dimension} isOpen={isFilterOpen} onClose={onCloseFilter} />
        </div>

        <button
          onClick={onRefresh}
          className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            ></path>
          </svg>
          Refresh Metadata
        </button>
      </div>
    </div>
  );
}
