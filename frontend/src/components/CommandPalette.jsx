import { useEffect, useRef } from 'react';

export default function CommandPalette({ languages, currentLang, onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      const num = parseInt(e.key);
      if (num >= 1 && num <= languages.length) {
        onSelect(languages[num - 1].id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [languages, onSelect, onClose]);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div className="palette-overlay">
      <div className="palette-container" ref={ref}>
        <div className="palette-header">
          <span>Select Language</span>
          <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#e6edf3' }}>ESC</kbd>
        </div>
        {languages.map((lang, i) => (
          <button
            key={lang.id}
            className={`palette-item ${currentLang === lang.id ? 'palette-item-active' : ''}`}
            onClick={() => onSelect(lang.id)}
          >
            <span className="palette-num">{i + 1}</span>
            <span className="palette-icon" style={{ fontSize: 16 }}>
              {lang.icon === 'JS' ? (
                <span style={{ fontWeight: 'bold', fontSize: 12, color: lang.color }}>JS</span>
              ) : (
                <span>{lang.icon}</span>
              )}
            </span>
            <span className="palette-name">{lang.name}</span>
            <span className="palette-type">{lang.compiler}</span>
            {currentLang === lang.id && <span className="palette-check">\u2713</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
