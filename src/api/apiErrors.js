export const parseErrorDetail = async (response) => {
    try {
        const body = await response.json();
        return body?.detail || `HTTP Error: ${response.status}`;
    } catch {
        return `HTTP Error: ${response.status}`;
    }
};
