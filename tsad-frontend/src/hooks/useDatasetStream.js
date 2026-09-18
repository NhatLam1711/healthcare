import { useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config.js';
import {
  appendPoint,
  beginStream,
  clearChartState,
  closeEventSource,
  endStream,
  getEventSource,
  setEventSource,
} from '../store/datasetStore.js';

// Both channels (stream / evaluate) speak the same SSE point/complete/error
// protocol, so one function drives both instead of duplicating the wiring
// (the original file had two ~40-line copies of this that only differed by
// URL and status text -- a classic copy-paste drift risk).
function startChannel(name, type, url, statusText) {
  const existingState = getEventSource(name, type);
  if (existingState) existingState.close();

  beginStream(name, type, statusText);

  const source = new EventSource(url);
  setEventSource(name, type, source);

  source.addEventListener('point', (e) => {
    const data = JSON.parse(e.data);
    appendPoint(name, type, data);
  });

  source.addEventListener('complete', () => {
    closeEventSource(name, type);
    endStream(name, type, `${type === 'stream' ? 'Stream' : 'Evaluation'} Complete.`);
  });

  source.onerror = () => {
    closeEventSource(name, type);
    endStream(name, type, 'Connection Error or Stream Closed');
  };
}

function stopChannel(name, type) {
  closeEventSource(name, type);
  endStream(name, type, 'Stopped manually');
}

export function useDatasetActions(activeDataset, selectedModel) {
  const startStream = useCallback(() => {
    if (!activeDataset) return;
    startChannel(activeDataset, 'stream', `${API_BASE_URL}/${activeDataset}/stream`, 'Streaming...');
  }, [activeDataset]);

  const startEvaluate = useCallback(() => {
    if (!activeDataset) return;
    const url = `${API_BASE_URL}/${activeDataset}/evaluate?model=${encodeURIComponent(selectedModel)}`;
    startChannel(activeDataset, 'evaluate', url, `Evaluating with ${selectedModel}...`);
  }, [activeDataset, selectedModel]);

  const clearBoth = useCallback(() => {
    if (!activeDataset) return;
    stopChannel(activeDataset, 'stream');
    stopChannel(activeDataset, 'evaluate');
    clearChartState(activeDataset, 'stream');
    clearChartState(activeDataset, 'evaluate');
  }, [activeDataset]);

  const startBoth = useCallback(() => {
    clearBoth();
    startStream();
    startEvaluate();
  }, [clearBoth, startStream, startEvaluate]);

  const stopBoth = useCallback(() => {
    if (!activeDataset) return;
    stopChannel(activeDataset, 'stream');
    stopChannel(activeDataset, 'evaluate');
  }, [activeDataset]);

  // Safety net: if the component unmounts (e.g. navigating away) while a
  // stream is open, close the connections instead of leaking them. The
  // original never did this -- switching datasets mid-stream without
  // pressing Stop first left the old EventSource connected in the background.
  useEffect(() => {
    return () => {
      if (!activeDataset) return;
      closeEventSource(activeDataset, 'stream');
      closeEventSource(activeDataset, 'evaluate');
    };
  }, [activeDataset]);

  return { startBoth, stopBoth, clearBoth };
}
