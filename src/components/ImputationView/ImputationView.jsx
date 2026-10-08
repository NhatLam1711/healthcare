import { useRef } from 'react';
import ImputationToolbar from '../ImputationToolbar/ImputationToolbar';
import ImputationChartPanel from '../ImputationChartPanel/ImputationChartPanel';

const buildMetaItems = (meta) => {
    if (!meta) return null;
    return [
        { label: 'Samples', value: meta.num_samples },
        { label: 'Timesteps', value: meta.num_timesteps },
        { label: 'Features', value: meta.num_features },
        { label: 'Predictions/point', value: meta.nsample_per_point },
    ];
};

const ImputationView = ({ imputation }) => {
    const chartRef = useRef(null);

    const datasetDescriptor = imputation.datasets.find((d) => d.key === imputation.activeDataset);
    const featureOptions = imputation.meta?.feature_names || [];
    const sampleOptions = imputation.meta
        ? Array.from({ length: imputation.meta.num_samples }, (_, i) => String(i))
        : [];

    const metaItems = buildMetaItems(imputation.meta);

    return (
        <div className="dataset-view">
            <ImputationToolbar
                datasetLabel={datasetDescriptor?.label || imputation.activeDataset}
                sampleOptions={sampleOptions}
                selectedSample={imputation.activeSampleId !== null ? String(imputation.activeSampleId) : ''}
                onSelectSample={(value) => imputation.selectSample(Number(value))}
                featureOptions={featureOptions}
                selectedFeature={featureOptions[imputation.activeFeatureId] || ''}
                onSelectFeature={(name) => imputation.selectFeature(featureOptions.indexOf(name))}
                isStreaming={imputation.isStreaming}
                onStart={imputation.startReplay}
                onStop={imputation.stopReplay}
                onClear={imputation.clearReplay}
                onRefreshMeta={() => imputation.loadMeta(imputation.activeDataset)}
                metaError={imputation.metaError}
                metaLoading={imputation.metaStatus === 'loading'}
                metaItems={metaItems}
            />

            <div className="charts-grid charts-grid--single">
                <ImputationChartPanel
                    chartRef={chartRef}
                    replay={imputation.currentReplay}
                    forceUpdate={imputation.tick}
                    totalPoints={imputation.meta?.num_timesteps}
                />
            </div>
        </div>
    );
};

export default ImputationView;
