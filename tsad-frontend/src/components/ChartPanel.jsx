import { useRef } from 'react';
import EChart from './EChart.jsx';
import { useStreamMeta } from '../hooks/useDatasetMeta.js';

export default function ChartPanel({ datasetName, type, title }) {
  const meta = useStreamMeta(datasetName, type);
  const chartRef = useRef(null);

  const statusClass = meta.isStreaming
    ? 'text-green-600 animate-pulse'
    : meta.status?.includes('Error')
    ? 'text-red-600'
    : 'text-gray-500';

  return (
    <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex flex-col relative min-h-0">
      <div className="flex flex-wrap justify-between items-center mb-1 gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          <span className={`text-xs font-medium ${statusClass}`}>{meta.status}</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-mono">Pts: {meta.points}</span>
          <button
            onClick={() => chartRef.current?.resetZoom()}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-md font-medium transition"
          >
            Reset Zoom
          </button>
        </div>
      </div>

      <div className="flex-1 w-full relative min-h-0">
        <EChart ref={chartRef} datasetName={datasetName} type={type} />
      </div>
    </div>
  );
}
