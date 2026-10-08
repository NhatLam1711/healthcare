import { useRef } from 'react';
import ForecastToolbar from '../ForecastToolbar/ForecastToolbar';
import ForecastChartPanel from '../ForecastChartPanel/ForecastChartPanel';

const buildMetadataItems = (metadata) => {
    if (!metadata) return null;
    const { model_info, sequence_config, performance_metrics, server_timestamp } = metadata;
    return [
        { label: 'Model', value: model_info.model_architecture },
        { label: 'Positional Encoding', value: model_info.positional_encoding },
        { label: 'Target Feature', value: model_info.target_feature },
        { label: 'Device', value: model_info.device_used },
        { label: 'History Window', value: `${sequence_config.historical_input_window} pts (${sequence_config.time_granularity})` },
        { label: 'Prediction Horizon', value: `${sequence_config.prediction_horizon} pts` },
        { label: 'Inference Time', value: `${performance_metrics.inference_duration_ms.toFixed(2)} ms` },
        { label: 'MAE', value: performance_metrics.eval_mae.toFixed(4) },
        { label: 'MSE', value: performance_metrics.eval_mse.toFixed(4) },
        { label: 'Server Time', value: server_timestamp },
    ];
};

const ForecastingView = ({ forecast }) => {
    const chartRef = useRef(null);

    const datasetDescriptor = (forecast.datasets || []).find((d) => d.dataset === forecast.activeDataset);
    const targets = datasetDescriptor?.available_targets || [];
    const metadataItems = buildMetadataItems(forecast.metadata);

    return (
        <div className="dataset-view">
            <ForecastToolbar
                datasetLabel={datasetDescriptor?.display_name || forecast.activeDataset}
                targets={targets}
                selectedTarget={forecast.activeTarget}
                onSelectTarget={forecast.selectTarget}
                isStreaming={forecast.isStreaming}
                onStart={forecast.startReplay}
                onStop={forecast.stopReplay}
                onClear={forecast.clearReplay}
                onRefreshMetadata={() => forecast.loadMetadata(forecast.activeDataset, forecast.activeTarget)}
                metadataError={forecast.metadataError}
                metadataLoading={forecast.metadataStatus === 'loading'}
                metadataItems={metadataItems}
            />

            <div className="charts-grid charts-grid--single">
                <ForecastChartPanel chartRef={chartRef} replay={forecast.currentReplay} forceUpdate={forecast.tick} />
            </div>
        </div>
    );
};

export default ForecastingView;
