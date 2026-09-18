import { useRef, useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import WelcomeScreen from './components/WelcomeScreen/WelcomeScreen';
import DatasetToolbar from './components/DatasetToolbar/DatasetToolbar';
import ChartPanel from './components/ChartPanel/ChartPanel';
import { availableModels, fetchDatasetInfo, createStreamEventSource, createEvaluateEventSource } from './api/datasetApi';
import './App.css';

const App = () => {
    const [activeDataset, setActiveDataset] = useState('');
    const [infos, setInfos] = useState({});
    const [errors, setErrors] = useState({});
    const [tick, setTick] = useState(0);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const [selectedModel, setSelectedModel] = useState('isolation-forest-v1');

    const datasetsStateRef = useRef({});

    const initDatasetState = (name, dimension = 0) => {
        if (!datasetsStateRef.current[name]) {
            const initialFeatures = new Set();
            const limit = dimension > 0 ? Math.min(5, dimension) : 5;
            for (let i = 0; i < limit; i++) {
                initialFeatures.add(i);
            }

            const createEmptyState = () => ({
                labels: [], values: [], accuracies: [], eventSource: null, isStreaming: false, points: 0,
                status: 'Waiting to start...'
            });

            datasetsStateRef.current[name] = {
                visibleFeatures: initialFeatures,
                stream: createEmptyState(),
                evaluate: createEmptyState()
            };
        }
    };

    const fetchInfo = async (name) => {
        setErrors(prev => ({ ...prev, [name]: null }));
        try {
            const data = await fetchDatasetInfo(name);

            setInfos(prev => ({ ...prev, [name]: data }));

            const dsState = datasetsStateRef.current[name];
            if (dsState && dsState.stream.values.length === 0 && dsState.evaluate.values.length === 0) {
                const newSet = new Set();
                const limit = Math.min(5, data.dimension);
                for (let i = 0; i < limit; i++) newSet.add(i);
                dsState.visibleFeatures = newSet;
                setTick(t => t + 1);
            }
        } catch (err) {
            setErrors(prev => ({ ...prev, [name]: `Failed to connect to backend: ${err.message}` }));
        }
    };

    const selectDataset = (name) => {
        initDatasetState(name, infos[name] ? infos[name].dimension : 0);
        setActiveDataset(name);
        setIsFilterOpen(false);
        if (!infos[name]) fetchInfo(name);
        setTick(t => t + 1);
    };

    const startStream = () => {
        if (!activeDataset) return;
        const state = datasetsStateRef.current[activeDataset].stream;
        if (state.isStreaming) return;

        if (state.eventSource) state.eventSource.close();

        state.isStreaming = true;
        state.status = 'Streaming...';

        const source = createStreamEventSource(activeDataset);
        state.eventSource = source;

        let localCounter = 0;

        source.addEventListener('point', (e) => {
            const data = JSON.parse(e.data);
            state.labels.push(data.index + '_' + state.points);

            while (state.values.length < data.values.length) {
                state.values.push([]);
            }
            for (let i = 0; i < data.values.length; i++) {
                state.values[i].push(data.values[i]);
            }

            if (data.accuracy !== undefined && data.accuracy !== null) {
                state.accuracies.push(data.accuracy);
            } else {
                state.accuracies.push(null);
            }

            localCounter++;
            state.points++;
            if (localCounter % 15 === 0) setTick(t => t + 1);
        });

        source.addEventListener('complete', () => {
            stopStreamType(activeDataset, 'stream');
            datasetsStateRef.current[activeDataset].stream.status = 'Stream Complete.';
            setTick(t => t + 1);
        });

        source.onerror = (err) => {
            console.error('SSE Error', err);
            stopStreamType(activeDataset, 'stream');
            datasetsStateRef.current[activeDataset].stream.status = 'Connection Error or Stream Closed';
            setTick(t => t + 1);
        };

        setTick(t => t + 1);
    };

    const startEvaluate = () => {
        if (!activeDataset) return;

        const state = datasetsStateRef.current[activeDataset].evaluate;
        if (state.isStreaming) return;
        if (state.eventSource) state.eventSource.close();

        state.isStreaming = true;
        state.status = `Evaluating with ${selectedModel}...`;

        const source = createEvaluateEventSource(activeDataset, selectedModel);
        state.eventSource = source;

        let localCounter = 0;

        source.addEventListener('point', (e) => {
            const data = JSON.parse(e.data);
            state.labels.push(data.index + '_' + state.points);

            while (state.values.length < data.values.length) {
                state.values.push([]);
            }
            for (let i = 0; i < data.values.length; i++) {
                state.values[i].push(data.values[i]);
            }

            if (data.accuracy !== undefined && data.accuracy !== null) {
                state.accuracies.push(data.accuracy);
            } else {
                state.accuracies.push(null);
            }

            localCounter++;
            state.points++;
            if (localCounter % 15 === 0) setTick(t => t + 1);
        });

        source.addEventListener('complete', () => {
            stopStreamType(activeDataset, 'evaluate');
            datasetsStateRef.current[activeDataset].evaluate.status = 'Evaluation Complete.';
            setTick(t => t + 1);
        });

        source.onerror = (err) => {
            console.error('SSE Error during evaluate', err);
            stopStreamType(activeDataset, 'evaluate');
            datasetsStateRef.current[activeDataset].evaluate.status = 'Connection Error or Stream Closed';
            setTick(t => t + 1);
        };

        setTick(t => t + 1);
    };

    const stopStreamType = (name, type) => {
        const state = datasetsStateRef.current[name]?.[type];
        if (state && state.eventSource) {
            state.eventSource.close();
            state.eventSource = null;
        }
        if (state) {
            state.isStreaming = false;
            if (state.status.includes('...')) state.status = 'Stopped manually';
        }
    };

    const clearData = (type) => {
        if (!activeDataset) return;
        stopStreamType(activeDataset, type);
        const state = datasetsStateRef.current[activeDataset][type];
        state.labels = []; state.values = []; state.accuracies = []; state.points = 0; state.status = 'Cleared';
        setTick(t => t + 1);
    };

    const startBoth = () => {
        clearBoth();
        startStream();
        startEvaluate();
    };

    const stopBoth = () => {
        stopStreamType(activeDataset, 'stream');
        stopStreamType(activeDataset, 'evaluate');
        setTick(t => t + 1);
    };

    const clearBoth = () => {
        clearData('stream');
        clearData('evaluate');
    };

    const currentState = datasetsStateRef.current[activeDataset] || {};
    const currentInfo = infos[activeDataset];
    const currentError = errors[activeDataset];

    return (
        <div className="app">
            <Sidebar
                activeDataset={activeDataset}
                datasetsStateRef={datasetsStateRef}
                onSelectDataset={selectDataset}
            />

            <main className="main-content">
                {!activeDataset ? (
                    <WelcomeScreen />
                ) : (
                    <div className="dataset-view">
                        <DatasetToolbar
                            activeDataset={activeDataset}
                            selectedModel={selectedModel}
                            availableModels={availableModels}
                            onModelChange={setSelectedModel}
                            isEvaluateStreaming={currentState.evaluate?.isStreaming}
                            isAnyStreaming={!!(currentState.stream?.isStreaming || currentState.evaluate?.isStreaming)}
                            onStartBoth={startBoth}
                            onStopBoth={stopBoth}
                            onClearBoth={clearBoth}
                            isFilterOpen={isFilterOpen}
                            onToggleFilter={() => setIsFilterOpen(!isFilterOpen)}
                            onCloseFilter={() => setIsFilterOpen(false)}
                            visibleFeatures={currentState.visibleFeatures}
                            numFeatures={currentInfo?.dimension || 0}
                            onSelectAllFeatures={() => {
                                const st = datasetsStateRef.current[activeDataset];
                                const count = currentInfo?.dimension || 0;
                                st.visibleFeatures = new Set(Array.from({ length: count }, (_, i) => i));
                                setTick(t => t + 1);
                            }}
                            onSelectNoneFeatures={() => {
                                datasetsStateRef.current[activeDataset].visibleFeatures = new Set();
                                setTick(t => t + 1);
                            }}
                            onToggleFeature={(i, checked) => {
                                const st = datasetsStateRef.current[activeDataset];
                                const newSet = new Set(st.visibleFeatures);
                                if (checked) newSet.add(i);
                                else newSet.delete(i);
                                st.visibleFeatures = newSet;
                                setTick(t => t + 1);
                            }}
                            onRefresh={() => fetchInfo(activeDataset)}
                            error={currentError}
                            info={currentInfo}
                        />

                        <div className="charts-grid">
                            <ChartPanel
                                title="Anomaly Detection (API 3)"
                                activeDataset={activeDataset}
                                type="evaluate"
                                datasetsStateRef={datasetsStateRef}
                                forceUpdate={tick}
                                status={currentState.evaluate?.status}
                                isStreaming={currentState.evaluate?.isStreaming}
                                points={currentState.evaluate?.points}
                            />

                            <ChartPanel
                                title="Live Telemetry (API 2)"
                                activeDataset={activeDataset}
                                type="stream"
                                datasetsStateRef={datasetsStateRef}
                                forceUpdate={tick}
                                status={currentState.stream?.status}
                                isStreaming={currentState.stream?.isStreaming}
                                points={currentState.stream?.points}
                            />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;
