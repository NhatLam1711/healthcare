import './ComingSoonScreen.css';

const ComingSoonScreen = ({ task }) => {
    return (
        <div className="coming-soon-screen">
            <svg className="coming-soon-screen__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span className="coming-soon-screen__badge">Coming soon</span>
            <h2 className="coming-soon-screen__title">{task.label}</h2>
            <p className="coming-soon-screen__text">{task.description}</p>
            <p className="coming-soon-screen__hint">This module will be enabled once its backend API is available.</p>
        </div>
    );
};

export default ComingSoonScreen;
