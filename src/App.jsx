import { useRef, useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import WelcomeScreen from './components/WelcomeScreen/WelcomeScreen';
import DatasetToolbar from './components/DatasetToolbar/DatasetToolbar';
import ChartPanel from './components/ChartPanel/ChartPanel';
import { availableModels, fetchDatasetInfo, createStreamEventSource, createEvaluateEventSource } from './api/datasetApi';
import './App.css';

// Chart panel labels per task mode
const CHART_CONFIG = {
    anomaly: {
        top: { title: 'Anomaly Detection (Evaluate)', chartVariant: 'raw' },
        bottom: { title: 'Live Telemetry (Raw Stream)', chartVariant: 'raw' },
    },
    forecasting: {
        top: { title: 'Forecasting – Model vs Ground Truth', chartVariant: 'forecast' },
        bottom: { title: 'Raw Signal', chartVariant: 'raw' },
    },
    imputation: {
        top: { title: 'Imputation – Model vs Ground Truth', chartVariant: 'forecast' },
        bottom: { title: 'Raw Signal', chartVariant: 'raw' },
    },
};

// Khớp với intervalMs mặc định của backend (xem DatasetController) -- dùng để
// phát lại các điểm đã xếp hàng trong lúc pause đúng nhịp như lúc stream thật.
const STREAM_INTERVAL_MS = 20;

// Tách ra ngoài component để dùng chung được cho cả initDatasetState (dataset
// lần đầu ghé) lẫn selectDataset (reset khi quay lại dataset không đang chạy).
//
// Các trường phục vụ Pause/Resume:
//   isPaused      : đang tạm dừng (kết nối SSE vẫn mở, chưa mất dữ liệu)
//   runningStatus : status hiển thị khi đang chạy, để khôi phục lúc Resume
//   queue         : các điểm server gửi tới trong lúc pause (chưa vẽ)
//   drainTimer    : timer phát lại queue sau khi Resume
//   pendingEnd    : 'complete' | 'error' nếu server đã kết thúc lúc đang pause
const createEmptyChartState = () => ({
    labels: [], values: [], accuracies: [], eventSource: null, isStreaming: false, points: 0,
    status: 'Waiting to start...',
    predicted: [], regionStart: null,
    isPaused: false, runningStatus: '', queue: [], drainTimer: null, pendingEnd: null,
});

const closeSource = (state) => {
    if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
    }
};

const clearDrain = (state) => {
    if (state.drainTimer) {
        clearInterval(state.drainTimer);
        state.drainTimer = null;
    }
};

// Thêm 1 điểm vào state. Index trục hoành (labels) được tạo từ data.index nên
// luôn nối tiếp đúng số của điểm trước đó, dù có pause/resume ở giữa.
const applyPoint = (state, data) => {
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

    // Handle predicted / regionStart for forecast/imputation modes
    if (data.predicted !== undefined && data.predicted !== null) {
        while (state.predicted.length < data.predicted.length) {
            state.predicted.push([]);
        }
        for (let i = 0; i < data.predicted.length; i++) {
            state.predicted[i].push(data.predicted[i]);
        }
    }
    if (data.regionStart !== undefined) {
        state.regionStart = data.regionStart;
    }

    state.points++;
};

const App = () => {
    const [activeDataset, setActiveDataset] = useState('');
    const [infos, setInfos] = useState({});
    const [errors, setErrors] = useState({});
    const [tick, setTick] = useState(0);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [taskMode, setTaskMode] = useState('anomaly');

    const [selectedModel, setSelectedModel] = useState('isolation-forest-v1');

    const datasetsStateRef = useRef({});

    const initDatasetState = (name, dimension = 0) => {
        if (!datasetsStateRef.current[name]) {
            const initialFeatures = new Set();
            const limit = dimension > 0 ? Math.min(5, dimension) : 5;
            for (let i = 0; i < limit; i++) {
                initialFeatures.add(i);
            }

            datasetsStateRef.current[name] = {
                visibleFeatures: initialFeatures,
                stream: createEmptyChartState(),
                evaluate: createEmptyChartState()
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
        if (name === activeDataset) return;

        // Dừng hẳn 2 kênh của dataset đang rời đi -- nếu không, nó tiếp tục
        // chạy ngầm vô thời hạn (vẫn gọi backend, vẫn setTick) dù không ai
        // còn xem, và khi quay lại sẽ thấy nó đã chạy "nhảy cóc" từ lúc nào.
        if (activeDataset) {
            stopStreamType(activeDataset, 'stream');
            stopStreamType(activeDataset, 'evaluate');
        }

        initDatasetState(name, infos[name] ? infos[name].dimension : 0);

        // Nếu dataset sắp chuyển tới không có kênh nào đang chạy dở (tức
        // không phải đang quay lại xem 1 lượt stream còn sống), coi như mở
        // lại từ đầu -- xoá sạch dữ liệu của lượt chạy trước, để không hiện
        // lại biểu đồ cũ ngay khi vừa bấm vào.
        const nextState = datasetsStateRef.current[name];
        if (nextState && !nextState.stream.isStreaming && !nextState.evaluate.isStreaming) {
            nextState.stream = createEmptyChartState();
            nextState.evaluate = createEmptyChartState();
        }

        setActiveDataset(name);
        setIsFilterOpen(false);
        if (!infos[name]) fetchInfo(name);
        setTick(t => t + 1);
    };

    // Kết thúc hẳn 1 kênh (hết dữ liệu hoặc lỗi kết nối).
    const finishChannel = (state, type, end) => {
        closeSource(state);
        clearDrain(state);
        state.isStreaming = false;
        state.isPaused = false;
        state.queue = [];
        state.pendingEnd = null;
        if (end === 'complete') {
            state.status = type === 'stream' ? 'Stream Complete.' : 'Evaluation Complete.';
        } else {
            state.status = 'Connection Error or Stream Closed';
        }
        setTick(t => t + 1);
    };

    // Sau Resume: phát lại các điểm đã xếp hàng đúng nhịp STREAM_INTERVAL_MS
    // (bù nếu timer bị trễ), trong lúc đó điểm mới từ server tiếp tục xếp
    // vào cuối hàng đợi nên thứ tự luôn đúng.
    const startDrain = (state, type) => {
        clearDrain(state);
        let last = performance.now();
        let sinceRender = 0;
        state.drainTimer = setInterval(() => {
            const now = performance.now();
            const due = Math.max(1, Math.round((now - last) / STREAM_INTERVAL_MS));
            last = now;

            for (let k = 0; k < due && state.queue.length > 0; k++) {
                applyPoint(state, state.queue.shift());
                sinceRender++;
            }

            if (state.queue.length === 0) {
                clearDrain(state);
                if (state.pendingEnd) {
                    finishChannel(state, type, state.pendingEnd);
                    return;
                }
                setTick(t => t + 1);
            } else if (sinceRender >= 15) {
                sinceRender = 0;
                setTick(t => t + 1);
            }
        }, STREAM_INTERVAL_MS);
    };

    // Mở 1 kênh SSE (type = 'stream' | 'evaluate'). Logic dùng chung cho cả hai.
    const startChannel = (type) => {
        if (!activeDataset) return;
        const state = datasetsStateRef.current[activeDataset]?.[type];
        if (!state || state.isStreaming || state.isPaused) return;

        closeSource(state);
        clearDrain(state);
        state.queue = [];
        state.pendingEnd = null;

        state.isStreaming = true;
        state.runningStatus = type === 'stream' ? 'Streaming...' : `Evaluating with ${selectedModel}...`;
        state.status = state.runningStatus;

        const source = type === 'stream'
            ? createStreamEventSource(activeDataset)
            : createEvaluateEventSource(activeDataset, selectedModel);
        state.eventSource = source;

        source.addEventListener('point', (e) => {
            const data = JSON.parse(e.data);
            // Đang pause, hoặc còn điểm cũ chưa phát lại -> xếp hàng để giữ đúng thứ tự.
            if (state.isPaused || state.queue.length > 0) {
                state.queue.push(data);
                return;
            }
            applyPoint(state, data);
            if (state.points % 15 === 0) setTick(t => t + 1);
        });

        source.addEventListener('complete', () => {
            if (state.isPaused || state.queue.length > 0) {
                // Server đã gửi xong nhưng người dùng chưa xem hết: giữ lại phần
                // còn lại trong queue, kết thúc sau khi phát lại xong.
                state.pendingEnd = 'complete';
                closeSource(state);
            } else {
                finishChannel(state, type, 'complete');
            }
        });

        source.onerror = (err) => {
            console.error(`SSE Error (${type})`, err);
            if (state.isPaused || state.queue.length > 0) {
                state.pendingEnd = 'error';
                closeSource(state);
            } else {
                finishChannel(state, type, 'error');
            }
        };

        setTick(t => t + 1);
    };

    const startStream = () => startChannel('stream');
    const startEvaluate = () => startChannel('evaluate');

    // Tạm dừng: KHÔNG đóng kết nối, chỉ ngừng vẽ và giữ dữ liệu hiện có.
    const pauseChannel = (state) => {
        if (!state || !state.isStreaming) return;
        clearDrain(state);
        state.isStreaming = false;
        state.isPaused = true;
        state.status = 'Paused';
    };

    // Tiếp tục: chạy tiếp từ điểm đang dừng, trục hoành nối số tiếp theo.
    const resumeChannel = (state, type) => {
        if (!state || !state.isPaused) return;
        state.isPaused = false;
        state.isStreaming = true;
        state.status = state.runningStatus;

        if (state.queue.length > 0) {
            startDrain(state, type);
        } else if (state.pendingEnd) {
            finishChannel(state, type, state.pendingEnd);
        }
    };

    // Dừng HẲN (đóng kết nối, bỏ cả phần đang pause). Dùng khi rời dataset / Clear Data.
    const stopStreamType = (name, type) => {
        const state = datasetsStateRef.current[name]?.[type];
        if (!state) return;
        closeSource(state);
        clearDrain(state);
        const wasActive = state.isStreaming || state.isPaused;
        state.isStreaming = false;
        state.isPaused = false;
        state.queue = [];
        state.pendingEnd = null;
        if (wasActive && (state.status.includes('...') || state.status === 'Paused')) {
            state.status = 'Stopped manually';
        }
    };

    const clearData = (type) => {
        if (!activeDataset) return;
        stopStreamType(activeDataset, type);
        const state = datasetsStateRef.current[activeDataset][type];
        state.labels = []; state.values = []; state.accuracies = [];
        state.predicted = []; state.regionStart = null;
        state.points = 0; state.status = 'Cleared';
        setTick(t => t + 1);
    };

    const startBoth = () => {
        clearBoth();
        startStream();
        // Kênh "evaluate" là backend thật cho Anomaly Detection (mock model).
        // Forecasting/Imputation hiện CHƯA có backend thật tương ứng -- nếu cứ
        // mở kênh này ở 2 tab đó, dữ liệu evaluate (vốn thuộc về Anomaly
        // Detection) sẽ vô tình bị ForecastEChart lấy vẽ ra như thể là thật
        // (đây chính là lỗi 1 bạn báo). Chỉ mở evaluate khi thật sự đang ở
        // tab Anomaly Detection.
        if (taskMode === 'anomaly') {
            startEvaluate();
        }
    };

    // "Stop Streaming" = tạm dừng (pause), không xoá dữ liệu, không đóng kết nối.
    const stopBoth = () => {
        const ds = datasetsStateRef.current[activeDataset];
        if (!ds) return;
        pauseChannel(ds.stream);
        pauseChannel(ds.evaluate);
        setTick(t => t + 1);
    };

    // "Resume Streaming" = chạy tiếp từ điểm đã dừng.
    const resumeBoth = () => {
        const ds = datasetsStateRef.current[activeDataset];
        if (!ds) return;
        resumeChannel(ds.stream, 'stream');
        resumeChannel(ds.evaluate, 'evaluate');
        setTick(t => t + 1);
    };

    const clearBoth = () => {
        clearData('stream');
        clearData('evaluate');
    };

    // Đổi tab (Anomaly Detection / Forecasting / Imputation) coi như bắt đầu
    // lại từ đầu -- xoá sạch dữ liệu của tab cũ trước khi đổi, để không hiện
    // đè chart cũ lên (lỗi 2 bạn báo). Trước đó code chỉ gọi thẳng setTaskMode,
    // không xoá gì cả.
    const handleTaskModeChange = (nextMode) => {
        if (nextMode === taskMode) return;
        clearBoth();
        setTaskMode(nextMode);
    };

    const currentState = datasetsStateRef.current[activeDataset] || {};
    const currentInfo = infos[activeDataset];
    const currentError = errors[activeDataset];

    const chartCfg = CHART_CONFIG[taskMode] || CHART_CONFIG.anomaly;

    // Chart TRÊN đổi nguồn dữ liệu theo tab: Anomaly Detection đọc "evaluate"
    // (kênh so sánh thật với model), Forecasting/Imputation đọc "stream" (vì
    // chưa có backend evaluate riêng cho 2 tác vụ này -- xem ghi chú ở
    // startBoth). Trước đây type bị gán cứng "evaluate" cho mọi tab, khiến
    // Forecasting/Imputation vô tình hiện dữ liệu của Anomaly Detection.
    const topType = taskMode === 'anomaly' ? 'evaluate' : 'stream';
    const topState = currentState[topType];

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
                            isAnyPaused={!!(currentState.stream?.isPaused || currentState.evaluate?.isPaused)}
                            onStartBoth={startBoth}
                            onStopBoth={stopBoth}
                            onResumeBoth={resumeBoth}
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
                            taskMode={taskMode}
                            onTaskModeChange={handleTaskModeChange}
                        />

                        <div className="charts-grid">
                            <ChartPanel
                                title={chartCfg.top.title}
                                activeDataset={activeDataset}
                                type={topType}
                                datasetsStateRef={datasetsStateRef}
                                forceUpdate={tick}
                                status={topState?.status}
                                isStreaming={topState?.isStreaming}
                                points={topState?.points}
                                taskMode={taskMode}
                                chartVariant={chartCfg.top.chartVariant}
                            />

                            <ChartPanel
                                title={chartCfg.bottom.title}
                                activeDataset={activeDataset}
                                type="stream"
                                datasetsStateRef={datasetsStateRef}
                                forceUpdate={tick}
                                status={currentState.stream?.status}
                                isStreaming={currentState.stream?.isStreaming}
                                points={currentState.stream?.points}
                                taskMode={taskMode}
                                chartVariant={chartCfg.bottom.chartVariant}
                            />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;
