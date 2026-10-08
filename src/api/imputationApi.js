import { parseErrorDetail } from './apiErrors';

export const IMPUTATION_API_BASE_URL = import.meta.env.VITE_IMPUTATION_API_BASE_URL || 'http://127.0.0.1:8800/api';

// Backend không có endpoint liệt kê dataset (khác Forecasting's GET /datasets) -
// chỉ có GET /api/{dataset}/meta (cần biết tên trước). Bắt buộc hardcode theo
// FE_INTEGRATION_GUIDE.md mục 2. `label` chỉ để hiển thị UI, không gửi lên server.
export const IMPUTATION_DATASETS = [
    { key: 'pm25', label: 'PM2.5 — Air Quality (36 stations)' },
    { key: 'physio', label: 'PhysioNet — ICU Vitals (35 indicators)' },
    { key: 'electricity', label: 'Electricity — Client Load (370 clients)' },
];

const DEFAULT_INTERVAL_MS = 50;

export const fetchImputationMeta = async (dataset) => {
    const response = await fetch(`${IMPUTATION_API_BASE_URL}/${dataset}/meta`);
    if (!response.ok) throw new Error(await parseErrorDetail(response));
    return response.json();
};

export const createFullStream = (dataset, sampleId, featureId, intervalMs = DEFAULT_INTERVAL_MS) => {
    const url = `${IMPUTATION_API_BASE_URL}/${dataset}/series/${sampleId}/${featureId}/full?interval_ms=${intervalMs}`;
    return new EventSource(url);
};
