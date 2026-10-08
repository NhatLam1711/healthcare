import { useCallback, useRef, useState } from 'react';
import {
    fetchForecastDatasets,
    fetchForecastMetadata,
    createHistoricalStream,
    createForecastComparisonStream,
} from '../api/forecastApi';

const POINTS_PER_UI_TICK = 15;

const makeReplayKey = (dataset, target) => `${dataset}::${target}`;

const createEmptyReplayState = () => ({
    phase: 'idle', // idle | historical | forecast | done
    status: 'Waiting to start...',
    historical: { labels: [], actual: [], points: 0, eventSource: null },
    forecast: { labels: [], actual: [], forecast: [], errorDiff: [], points: 0, eventSource: null },
});

export const useForecastController = () => {
    const [datasets, setDatasets] = useState(null);
    const [datasetsStatus, setDatasetsStatus] = useState('idle'); // idle | loading | ready | error
    const [datasetsError, setDatasetsError] = useState(null);

    const [activeDataset, setActiveDataset] = useState('');
    const [activeTarget, setActiveTarget] = useState('');

    const [metadata, setMetadata] = useState(null);
    const [metadataStatus, setMetadataStatus] = useState('idle');
    const [metadataError, setMetadataError] = useState(null);

    const [tick, setTick] = useState(0);
    const bumpTick = () => setTick((t) => t + 1);

    const replayStateRef = useRef({});

    const ensureReplayState = (key) => {
        if (!replayStateRef.current[key]) {
            replayStateRef.current[key] = createEmptyReplayState();
        }
        return replayStateRef.current[key];
    };

    const loadDatasets = useCallback(async () => {
        setDatasetsStatus('loading');
        setDatasetsError(null);
        try {
            const list = await fetchForecastDatasets();
            setDatasets(list);
            setDatasetsStatus('ready');
        } catch (err) {
            setDatasetsError(err.message);
            setDatasetsStatus('error');
        }
    }, []);

    const loadMetadata = useCallback(async (dataset, target) => {
        if (!dataset || !target) return;
        setMetadataStatus('loading');
        setMetadataError(null);
        try {
            const data = await fetchForecastMetadata(dataset, target);
            setMetadata(data);
            setMetadataStatus('ready');
        } catch (err) {
            setMetadataError(err.message);
            setMetadataStatus('error');
        }
    }, []);

    const selectDataset = useCallback((datasetKey) => {
        const descriptor = (datasets || []).find((d) => d.dataset === datasetKey);
        const defaultTarget = descriptor?.default_target || '';
        setActiveDataset(datasetKey);
        setActiveTarget(defaultTarget);
        ensureReplayState(makeReplayKey(datasetKey, defaultTarget));
        bumpTick();
        loadMetadata(datasetKey, defaultTarget);
    }, [datasets, loadMetadata]);

    const selectTarget = useCallback((target) => {
        setActiveTarget(target);
        ensureReplayState(makeReplayKey(activeDataset, target));
        bumpTick();
        loadMetadata(activeDataset, target);
    }, [activeDataset, loadMetadata]);

    const stopReplay = useCallback(() => {
        const key = makeReplayKey(activeDataset, activeTarget);
        const state = replayStateRef.current[key];
        if (!state) return;
        [state.historical, state.forecast].forEach((s) => {
            if (s.eventSource) {
                s.eventSource.close();
                s.eventSource = null;
            }
        });
        if (state.phase === 'historical' || state.phase === 'forecast') {
            state.phase = 'done';
            state.status = 'Stopped manually';
        }
        bumpTick();
    }, [activeDataset, activeTarget]);

    const clearReplay = useCallback(() => {
        stopReplay();
        const key = makeReplayKey(activeDataset, activeTarget);
        replayStateRef.current[key] = createEmptyReplayState();
        bumpTick();
    }, [activeDataset, activeTarget, stopReplay]);

    const runForecastPhase = (key, dataset, target) => {
        const state = replayStateRef.current[key];
        state.phase = 'forecast';
        state.status = 'Streaming forecast comparison...';

        const source = createForecastComparisonStream(dataset, target);
        state.forecast.eventSource = source;
        let localCounter = 0;

        source.onmessage = (e) => {
            const point = JSON.parse(e.data);
            state.forecast.labels.push(point.timestamp);
            state.forecast.actual.push(point.actual);
            state.forecast.forecast.push(point.forecast);
            state.forecast.errorDiff.push(point.error_diff);
            state.forecast.points++;
            localCounter++;
            if (localCounter % POINTS_PER_UI_TICK === 0) bumpTick();
        };

        source.addEventListener('complete', () => {
            source.close();
            state.forecast.eventSource = null;
            state.phase = 'done';
            state.status = 'Replay complete';
            bumpTick();
        });

        source.onerror = () => {
            source.close();
            state.forecast.eventSource = null;
            state.phase = 'done';
            state.status = 'Connection Error or Stream Closed';
            bumpTick();
        };

        bumpTick();
    };

    const startReplay = useCallback(() => {
        if (!activeDataset || !activeTarget) return;
        const key = makeReplayKey(activeDataset, activeTarget);
        const existing = replayStateRef.current[key];
        if (existing && (existing.phase === 'historical' || existing.phase === 'forecast')) return;

        const state = createEmptyReplayState();
        replayStateRef.current[key] = state;
        state.phase = 'historical';
        state.status = 'Streaming historical data...';

        const source = createHistoricalStream(activeDataset, activeTarget);
        state.historical.eventSource = source;
        let localCounter = 0;

        source.onmessage = (e) => {
            const point = JSON.parse(e.data);
            state.historical.labels.push(point.timestamp);
            state.historical.actual.push(point.actual);
            state.historical.points++;
            localCounter++;
            if (localCounter % POINTS_PER_UI_TICK === 0) bumpTick();
        };

        source.addEventListener('complete', () => {
            source.close();
            state.historical.eventSource = null;
            bumpTick();
            runForecastPhase(key, activeDataset, activeTarget);
        });

        source.onerror = () => {
            source.close();
            state.historical.eventSource = null;
            state.phase = 'done';
            state.status = 'Connection Error or Stream Closed';
            bumpTick();
        };

        bumpTick();
    }, [activeDataset, activeTarget]);

    const isDatasetStreaming = useCallback((datasetKey) => {
        const prefix = `${datasetKey}::`;
        return Object.keys(replayStateRef.current).some((key) => {
            if (!key.startsWith(prefix)) return false;
            const phase = replayStateRef.current[key].phase;
            return phase === 'historical' || phase === 'forecast';
        });
    }, []);

    const replayKey = makeReplayKey(activeDataset, activeTarget);
    const currentReplay = replayStateRef.current[replayKey] || createEmptyReplayState();
    const isStreaming = currentReplay.phase === 'historical' || currentReplay.phase === 'forecast';

    return {
        datasets,
        datasetsStatus,
        datasetsError,
        loadDatasets,
        activeDataset,
        activeTarget,
        selectDataset,
        selectTarget,
        metadata,
        metadataStatus,
        metadataError,
        loadMetadata,
        currentReplay,
        isStreaming,
        isDatasetStreaming,
        tick,
        startReplay,
        stopReplay,
        clearReplay,
    };
};
