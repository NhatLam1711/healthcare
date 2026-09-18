import { useState } from 'react';
import { API_BASE_URL, AVAILABLE_MODELS } from './config.js';
import { applyDefaultVisibleFeatures, selectDataset as selectDatasetInStore } from './store/datasetStore.js';
import { useDatasetActions } from './hooks/useDatasetStream.js';
import Sidebar from './components/Sidebar.jsx';
import DatasetHeader from './components/DatasetHeader.jsx';
import MetadataPanel from './components/MetadataPanel.jsx';
import ChartPanel from './components/ChartPanel.jsx';

export default function App() {
  const [activeDataset, setActiveDataset] = useState('');
  const [infos, setInfos] = useState({});
  const [errors, setErrors] = useState({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0]);

  const { startBoth, stopBoth, clearBoth } = useDatasetActions(activeDataset, selectedModel);

  const fetchInfo = async (name) => {
    setErrors((prev) => ({ ...prev, [name]: null }));
    try {
      const response = await fetch(`${API_BASE_URL}/${name}/info`);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const data = await response.json();
      setInfos((prev) => ({ ...prev, [name]: data }));
      applyDefaultVisibleFeatures(name, data.dimension);
    } catch (err) {
      setErrors((prev) => ({ ...prev, [name]: `Failed to connect to backend: ${err.message}` }));
    }
  };

  const handleSelectDataset = (name) => {
    selectDatasetInStore(name, infos[name]?.dimension || 0);
    setActiveDataset(name);
    setIsFilterOpen(false);
    if (!infos[name]) fetchInfo(name);
  };

  const currentInfo = infos[activeDataset];
  const currentError = errors[activeDataset];

  return (
    <div className="flex w-full h-full">
      <Sidebar activeDataset={activeDataset} onSelect={handleSelectDataset} />

      <main className="flex-1 overflow-hidden bg-gray-50 p-2 lg:p-3 flex flex-col relative z-10">
        {!activeDataset ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <svg className="w-24 h-24 text-blue-200 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              ></path>
            </svg>
            <h2 className="text-3xl font-bold text-gray-700 mb-2">Welcome to TSAD Monitor</h2>
            <p className="text-gray-500">Select a dataset from the sidebar to start streaming.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
            <div className="bg-white p-2 px-4 rounded-xl shadow-sm border border-gray-200 shrink-0">
              <DatasetHeader
                activeDataset={activeDataset}
                dimension={currentInfo?.dimension || 0}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                isFilterOpen={isFilterOpen}
                onToggleFilter={() => setIsFilterOpen((v) => !v)}
                onCloseFilter={() => setIsFilterOpen(false)}
                onStartBoth={startBoth}
                onStopBoth={stopBoth}
                onClearBoth={clearBoth}
                onRefresh={() => fetchInfo(activeDataset)}
              />
              <MetadataPanel info={currentInfo} error={currentError} />
            </div>

            <div className="flex-1 grid grid-rows-2 gap-2 min-h-0">
              <ChartPanel datasetName={activeDataset} type="evaluate" title="Anomaly Detection (API 3)" />
              <ChartPanel datasetName={activeDataset} type="stream" title="Live Telemetry (API 2)" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
