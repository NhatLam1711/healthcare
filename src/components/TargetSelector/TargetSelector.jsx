import { useMemo, useState } from 'react';
import './TargetSelector.css';

const SEARCH_THRESHOLD = 12;

const TargetSelector = ({ targets, selectedTarget, onSelectTarget, disabled, label = 'Target:' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');

    const filteredTargets = useMemo(() => {
        if (!query) return targets;
        const q = query.toLowerCase();
        return targets.filter((t) => t.toLowerCase().includes(q));
    }, [targets, query]);

    const handleToggle = () => {
        if (disabled) return;
        setIsOpen((o) => !o);
        setQuery('');
    };

    const handleSelect = (target) => {
        onSelectTarget(target);
        setIsOpen(false);
        setQuery('');
    };

    return (
        <div className="target-selector">
            <button type="button" className="target-selector__button" onClick={handleToggle} disabled={disabled}>
                <span className="target-selector__label">{label}</span>
                <span className="target-selector__value" title={selectedTarget}>{selectedTarget || '—'}</span>
            </button>

            {isOpen && (
                <>
                    <div className="target-selector__overlay" onClick={() => setIsOpen(false)}></div>
                    <div className="target-selector__panel">
                        {targets.length > SEARCH_THRESHOLD && (
                            <input
                                type="text"
                                autoFocus
                                className="target-selector__search"
                                placeholder={`Search ${targets.length} columns...`}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        )}
                        <div className="target-selector__list">
                            {filteredTargets.length === 0 ? (
                                <div className="target-selector__empty">No matching column</div>
                            ) : (
                                filteredTargets.map((t) => (
                                    <button
                                        type="button"
                                        key={t}
                                        className={`target-selector__item ${t === selectedTarget ? 'target-selector__item--active' : ''}`}
                                        onClick={() => handleSelect(t)}
                                    >
                                        {t}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default TargetSelector;
