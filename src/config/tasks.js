export const TASKS = [
    {
        id: 'anomaly-detection',
        label: 'Anomaly Detection',
        shortLabel: 'Anomaly',
        description: 'Detect abnormal points in time-series signals in real time.',
        available: true,
    },
    {
        id: 'forecasting',
        label: 'Forecasting',
        shortLabel: 'Forecast',
        description: 'Predict future values of a time-series ahead of time.',
        available: true,
    },
    {
        id: 'imputation',
        label: 'Imputation',
        shortLabel: 'Imputation',
        description: 'Reconstruct missing values inside a time-series.',
        available: true,
    },
];

export const DEFAULT_TASK_ID = TASKS[0].id;
