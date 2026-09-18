export const API_BASE_URL = 'http://localhost:8080/api/v1/dataset';

export const availableModels = ['isolation-forest-v1', 'autoencoder', 'lstm'];

export const fetchDatasetInfo = async (name) => {
    const response = await fetch(`${API_BASE_URL}/${name}/info`);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return response.json();
};

export const createStreamEventSource = (name) => {
    const url = `${API_BASE_URL}/${name}/stream`;
    return new EventSource(url);
};

export const createEvaluateEventSource = (name, model) => {
    const url = `${API_BASE_URL}/${name}/evaluate?model=${encodeURIComponent(model)}`;
    return new EventSource(url);
};
