import './TaskModeTabs.css';

const TASK_MODES = [
    {
        id: 'anomaly',
        label: 'Anomaly Detection',
        icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="task-tab__icon">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
        ),
    },
    {
        id: 'forecasting',
        label: 'Forecasting',
        icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="task-tab__icon">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
        ),
    },
    {
        id: 'imputation',
        label: 'Imputation',
        icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="task-tab__icon">
                <path fillRule="evenodd" d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" clipRule="evenodd" />
            </svg>
        ),
    },
];

const TaskModeTabs = ({ taskMode, onTaskModeChange, disabled }) => {
    return (
        <div className="task-mode-tabs">
            {TASK_MODES.map((mode) => (
                <button
                    key={mode.id}
                    className={`task-tab ${taskMode === mode.id ? 'task-tab--active' : ''}`}
                    onClick={() => onTaskModeChange(mode.id)}
                    disabled={disabled}
                    title={mode.label}
                >
                    {mode.icon}
                    <span className="task-tab__label">{mode.label}</span>
                    {taskMode === mode.id && <span className="task-tab__active-dot" />}
                </button>
            ))}
        </div>
    );
};

export default TaskModeTabs;
