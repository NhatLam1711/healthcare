import { getFeatureColor } from '../../utils/colors';
import './FeatureFilterDropdown.css';

const FeatureFilterDropdown = ({
    isOpen,
    onToggleOpen,
    onClose,
    visibleFeatures,
    numFeatures,
    onSelectAll,
    onSelectNone,
    onToggleFeature,
}) => {
    return (
        <div className="feature-filter">
            <button onClick={onToggleOpen} className="feature-filter__button">
                <svg className="feature-filter__button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                Filter ({visibleFeatures?.size || 0})
            </button>
            {isOpen && (
                <>
                    <div className="feature-filter__overlay" onClick={onClose}></div>
                    <div className="feature-filter__panel">
                        <div className="feature-filter__panel-header">
                            <span className="feature-filter__panel-title">Show Features</span>
                            <div className="feature-filter__panel-actions">
                                <button onClick={onSelectAll} className="feature-filter__link-button">All</button>
                                <button onClick={onSelectNone} className="feature-filter__link-button">None</button>
                            </div>
                        </div>
                        <div className="feature-filter__list">
                            {numFeatures === 0 ? (
                                <div className="feature-filter__empty">No features available</div>
                            ) : (
                                Array.from({ length: numFeatures }).map((_, i) => (
                                    <label key={i} className="feature-filter__item">
                                        <input
                                            type="checkbox"
                                            className="feature-filter__checkbox"
                                            checked={visibleFeatures?.has(i) || false}
                                            onChange={(e) => onToggleFeature(i, e.target.checked)}
                                        />
                                        <span className="feature-filter__item-label">
                                            <span className="feature-filter__color-dot" style={{ backgroundColor: getFeatureColor(i) }}></span>
                                            Feature {i + 1}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FeatureFilterDropdown;
