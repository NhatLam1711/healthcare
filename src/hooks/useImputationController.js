import { useCallback, useRef, useState } from 'react';
import { fetchImputationMeta, createFullStream, IMPUTATION_DATASETS } from '../api/imputationApi';

const POINTS_PER_UI_TICK = 5;

const makeReplayKey = (dataset, sampleId, featureId) => `${dataset}::${sampleId}::${featureId}`;

const createEmptyReplayState = () => ({
    phase: 'idle', // idle | streaming | done
    status: 'Waiting to start...',
    points: 0,
    labels: [],
    observed: [],
    imputedMedian: [],
    groundTruth: [],
    lower90: [],
    upper90: [],
    lower50: [],
    upper50: [],
    eventSource: null,
});

export const useImputationController = () => {
    const [activeDataset, setActiveDataset] = useState('');
    const [activeSampleId, setActiveSampleId] = useState(null);
    const [activeFeatureId, setActiveFeatureId] = useState(null);

    const [meta, setMeta] = useState(null);
    const [metaStatus, setMetaStatus] = useState('idle');
    const [metaError, setMetaError] = useState(null);

    const [tick, setTick] = useState(0);
    const bumpTick = () => setTick((t) => t + 1);

    const replayStateRef = useRef({});

    const ensureReplayState = (key) => {
        if (!replayStateRef.current[key]) {
            replayStateRef.current[key] = createEmptyReplayState();
        }
        return replayStateRef.current[key];
    };

    const loadMeta = useCallback(async (dataset) => {
        if (!dataset) return;
        setMetaStatus('loading');
        setMetaError(null);
        try {
            const data = await fetchImputationMeta(dataset);
            setMeta(data);
            setMetaStatus('ready');
        } catch (err) {
            setMetaError(err.message);
            setMetaStatus('error');
        }
    }, []);

    const selectDataset = useCallback((dataset) => {
        setActiveDataset(dataset);
        setActiveSampleId(0);
        setActiveFeatureId(0);
        ensureReplayState(makeReplayKey(dataset, 0, 0));
        bumpTick();
        loadMeta(dataset);
    }, [loadMeta]);

    const selectSample = useCallback((sampleId) => {
        setActiveSampleId(sampleId);
        ensureReplayState(makeReplayKey(activeDataset, sampleId, activeFeatureId));
        bumpTick();
    }, [activeDataset, activeFeatureId]);

    const selectFeature = useCallback((featureId) => {
        setActiveFeatureId(featureId);
        ensureReplayState(makeReplayKey(activeDataset, activeSampleId, featureId));
        bumpTick();
    }, [activeDataset, activeSampleId]);

    const stopReplay = useCallback(() => {
        const key = makeReplayKey(activeDataset, activeSampleId, activeFeatureId);
        const state = replayStateRef.current[key];
        if (!state) return;
        if (state.eventSource) {
            state.eventSource.close();
            state.eventSource = null;
        }
        if (state.phase === 'streaming') {
            state.phase = 'done';
            state.status = 'Stopped manually';
        }
        bumpTick();
    }, [activeDataset, activeSampleId, activeFeatureId]);

    const clearReplay = useCallback(() => {
        stopReplay();
        const key = makeReplayKey(activeDataset, activeSampleId, activeFeatureId);
        replayStateRef.current[key] = createEmptyReplayState();
        bumpTick();
    }, [activeDataset, activeSampleId, activeFeatureId, stopReplay]);

    const startReplay = useCallback(() => {
        if (!activeDataset || activeSampleId === null || activeFeatureId === null) return;
        const key = makeReplayKey(activeDataset, activeSampleId, activeFeatureId);
        const existing = replayStateRef.current[key];
        if (existing && existing.phase === 'streaming') return;

        const state = createEmptyReplayState();
        replayStateRef.current[key] = state;
        state.phase = 'streaming';
        state.status = 'Streaming...';

        const source = createFullStream(activeDataset, activeSampleId, activeFeatureId);
        state.eventSource = source;
        let localCounter = 0;

        source.addEventListener('point', (e) => {
            const point = JSON.parse(e.data);
            state.labels.push(String(point.t));

            if (point.type === 'observed') {
                state.observed.push(point.value);
                state.imputedMedian.push(null);
                state.groundTruth.push(null);
                state.lower90.push(null);
                state.upper90.push(null);
                state.lower50.push(null);
                state.upper50.push(null);
            } else if (point.type === 'imputed') {
                state.observed.push(null);
                state.imputedMedian.push(point.value);
                state.groundTruth.push(point.ground_truth ?? null);
                state.lower90.push(point.confidence?.lower_90 ?? null);
                state.upper90.push(point.confidence?.upper_90 ?? null);
                state.lower50.push(point.confidence?.lower_50 ?? null);
                state.upper50.push(point.confidence?.upper_50 ?? null);
            } else {
                // missing — không có gì để vẽ, giữ null ở mọi series để chart ngắt đoạn
                state.observed.push(null);
                state.imputedMedian.push(null);
                state.groundTruth.push(null);
                state.lower90.push(null);
                state.upper90.push(null);
                state.lower50.push(null);
                state.upper50.push(null);
            }

            state.points++;
            localCounter++;
            if (localCounter % POINTS_PER_UI_TICK === 0) bumpTick();
        });

        source.addEventListener('done', () => {
            source.close();
            state.eventSource = null;
            state.phase = 'done';
            state.status = 'Replay complete';
            bumpTick();
        });

        source.onerror = () => {
            source.close();
            state.eventSource = null;
            state.phase = 'done';
            state.status = 'Connection Error or Stream Closed';
            bumpTick();
        };

        bumpTick();
    }, [activeDataset, activeSampleId, activeFeatureId]);

    const isDatasetStreaming = useCallback((datasetKey) => {
        const prefix = `${datasetKey}::`;
        return Object.keys(replayStateRef.current).some((key) => {
            if (!key.startsWith(prefix)) return false;
            return replayStateRef.current[key].phase === 'streaming';
        });
    }, []);

    const replayKey = makeReplayKey(activeDataset, activeSampleId, activeFeatureId);
    const currentReplay = replayStateRef.current[replayKey] || createEmptyReplayState();
    const isStreaming = currentReplay.phase === 'streaming';

    return {
        datasets: IMPUTATION_DATASETS,
        activeDataset,
        activeSampleId,
        activeFeatureId,
        selectDataset,
        selectSample,
        selectFeature,
        meta,
        metaStatus,
        metaError,
        loadMeta,
        currentReplay,
        isStreaming,
        isDatasetStreaming,
        tick,
        startReplay,
        stopReplay,
        clearReplay,
    };
};
