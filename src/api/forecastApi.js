import { parseErrorDetail } from './apiErrors';

export const FORECAST_API_BASE_URL = import.meta.env.VITE_FORECAST_API_BASE_URL || 'http://localhost:8000/api/v1';

const buildQueryString = (params) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query.set(key, value);
        }
    });
    const qs = query.toString();
    return qs ? `?${qs}` : '';
};

const requestJson = async (path, params = {}) => {
    const response = await fetch(`${FORECAST_API_BASE_URL}${path}${buildQueryString(params)}`);
    if (!response.ok) {
        throw new Error(await parseErrorDetail(response));
    }
    return response.json();
};

export const fetchForecastDatasets = async () => {
    const data = await requestJson('/datasets');
    return data.datasets;
};

export const fetchForecastMetadata = (dataset, target) => requestJson('/metadata', { dataset, target });

export const createHistoricalStream = (dataset, target) => {
    const url = `${FORECAST_API_BASE_URL}/stream/historical${buildQueryString({ dataset, target })}`;
    return new EventSource(url);
};

export const createForecastComparisonStream = (dataset, target) => {
    const url = `${FORECAST_API_BASE_URL}/stream/forecast-comparison${buildQueryString({ dataset, target })}`;
    return new EventSource(url);
};
