import './TaskSwitcher.css';

const TaskSwitcher = ({ tasks, activeTaskId, onSelectTask }) => {
    return (
        <div className="task-switcher">
            {tasks.map((task) => {
                const isActive = task.id === activeTaskId;
                return (
                    <button
                        key={task.id}
                        type="button"
                        data-task={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className={`task-button ${isActive ? 'task-button--active' : ''}`}
                        title={task.description}
                    >
                        <span className="task-button__label">{task.shortLabel}</span>
                        {!task.available && <span className="task-button__badge">Soon</span>}
                    </button>
                );
            })}
        </div>
    );
};

export default TaskSwitcher;
