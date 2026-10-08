import TaskSwitcher from '../TaskSwitcher/TaskSwitcher';
import './Sidebar.css';

const DATASETS = ['2Dgesture', 'MSL'];

const renderDatasetButton = ({ key, label, title, isActive, isStreaming, onClick }) => (
    <button key={key} onClick={onClick} className={`dataset-button ${isActive ? 'dataset-button--active' : ''}`} title={title}>
        <div className="dataset-button__left">
            {isStreaming && (
                <span className="streaming-dot">
                    <span className="streaming-dot__ping animate-ping"></span>
                    <span className="streaming-dot__core"></span>
                </span>
            )}
            <span className={`dataset-button__label ${isActive ? 'dataset-button__label--active' : ''}`}>{label}</span>
        </div>
        {isActive && (
            <svg className="dataset-button__check" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        )}
    </button>
);

const Sidebar = ({ activeDataset, datasetsStateRef, onSelectDataset, tasks, activeTaskId, onSelectTask, forecast, imputation }) => {
    const activeTask = tasks.find(t => t.id === activeTaskId) || tasks[0];

    const renderDatasetSection = () => {
        if (!activeTask.available) {
            return (
                <p className="sidebar__placeholder">
                    {activeTask.label} datasets will appear here once the backend API is ready.
                </p>
            );
        }

        if (activeTaskId === 'forecasting') {
            if (forecast.datasetsStatus === 'loading' || forecast.datasetsStatus === 'idle') {
                return <p className="sidebar__loading animate-pulse">Loading datasets...</p>;
            }
            if (forecast.datasetsStatus === 'error') {
                return <p className="sidebar__placeholder sidebar__placeholder--error">{forecast.datasetsError}</p>;
            }
            return (
                <div className="sidebar__list">
                    {(forecast.datasets || []).map((ds) => renderDatasetButton({
                        key: ds.dataset,
                        label: ds.display_name,
                        title: ds.display_name,
                        isActive: forecast.activeDataset === ds.dataset,
                        isStreaming: forecast.isDatasetStreaming(ds.dataset),
                        onClick: () => forecast.selectDataset(ds.dataset),
                    }))}
                </div>
            );
        }

        if (activeTaskId === 'imputation') {
            return (
                <div className="sidebar__list">
                    {imputation.datasets.map((ds) => renderDatasetButton({
                        key: ds.key,
                        label: ds.label,
                        title: ds.label,
                        isActive: imputation.activeDataset === ds.key,
                        isStreaming: imputation.isDatasetStreaming(ds.key),
                        onClick: () => imputation.selectDataset(ds.key),
                    }))}
                </div>
            );
        }

        return (
            <div className="sidebar__list">
                {DATASETS.map((m) => renderDatasetButton({
                    key: m,
                    label: m,
                    isActive: activeDataset === m,
                    isStreaming: datasetsStateRef.current[m]?.stream.isStreaming || datasetsStateRef.current[m]?.evaluate.isStreaming,
                    onClick: () => onSelectDataset(m),
                }))}
            </div>
        );
    };

    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <h1 className="sidebar__title">TSAD Monitor</h1>
                <p className="sidebar__subtitle">Time-Series Toolkit</p>
            </div>
            <div className="sidebar__body">
                <h2 className="sidebar__section-title">Task</h2>
                <TaskSwitcher tasks={tasks} activeTaskId={activeTaskId} onSelectTask={onSelectTask} />

                <h2 className="sidebar__section-title sidebar__section-title--spaced">Select Dataset</h2>
                {renderDatasetSection()}
            </div>
        </aside>
    );
};

export default Sidebar;
