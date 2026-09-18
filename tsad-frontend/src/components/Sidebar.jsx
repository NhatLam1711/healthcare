import { DATASETS } from '../config.js';
import { useDatasetActivity } from '../hooks/useDatasetMeta.js';

function DatasetRow({ name, isActive, onSelect }) {
  // Isolated in its own component so the live-streaming dot re-renders on
  // its own -- it does not force the whole sidebar (or App) to re-render.
  const isStreaming = useDatasetActivity(name);

  return (
    <button
      onClick={() => onSelect(name)}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center justify-between ${
        isActive ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:border-blue-300'
      }`}
    >
      <div className="flex items-center gap-2">
        {isStreaming && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
        )}
        <span className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>{name}</span>
      </div>
      {isActive && (
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
      )}
    </button>
  );
}

export default function Sidebar({ activeDataset, onSelect }) {
  return (
    <aside className="w-64 bg-white shadow-lg h-full flex flex-col z-20 flex-shrink-0">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold text-blue-600 tracking-tight">TSAD Monitor</h1>
        <p className="text-sm text-gray-500 mt-1">Anomaly Detection</p>
      </div>
      <div className="p-4 flex-1">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Select Dataset</h2>
        <div className="space-y-3">
          {DATASETS.map((name) => (
            <DatasetRow key={name} name={name} isActive={activeDataset === name} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </aside>
  );
}
