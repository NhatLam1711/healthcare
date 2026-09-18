import { getFeatureColor } from '../utils/colors.js';
import { useVisibleFeatures } from '../hooks/useDatasetMeta.js';
import { setVisibleFeatures } from '../store/datasetStore.js';

export default function FeatureFilterMenu({ datasetName, dimension, isOpen, onClose }) {
  const visibleFeatures = useVisibleFeatures(datasetName);

  if (!isOpen) return null;

  const toggleFeature = (i, checked) => {
    setVisibleFeatures(datasetName, (prev) => {
      const next = new Set(prev);
      if (checked) next.add(i);
      else next.delete(i);
      return next;
    });
  };

  const selectAll = () => {
    setVisibleFeatures(datasetName, new Set(Array.from({ length: dimension || 0 }, (_, i) => i)));
  };

  const selectNone = () => {
    setVisibleFeatures(datasetName, new Set());
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose}></div>
      <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 shadow-2xl rounded-lg z-40 flex flex-col">
        <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
          <span className="text-sm font-bold text-gray-700">Show Features</span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">
              All
            </button>
            <button onClick={selectNone} className="text-xs text-blue-600 hover:underline">
              None
            </button>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {!dimension ? (
            <div className="text-xs text-gray-400 p-2">No features available</div>
          ) : (
            Array.from({ length: dimension }).map((_, i) => (
              <label key={i} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  checked={visibleFeatures?.has(i) || false}
                  onChange={(e) => toggleFeature(i, e.target.checked)}
                />
                <span className="text-sm font-medium select-none flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getFeatureColor(i) }}></span>
                  Feature {i + 1}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </>
  );
}
