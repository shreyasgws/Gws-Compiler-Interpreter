import { useEffect, useRef } from 'react';

export default function CommandPalette({ languages, currentLang, onSelect, onClose }) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);

  // Pull focus out of Monaco and onto the overlay the moment the palette mounts.
  // tabIndex={-1} makes the overlay div focusable without entering the tab order.
  // We use a small timeout to ensure the DOM is ready and Monaco yields focus.
  useEffect(() => {
    const timer = setTimeout(() => {
      overlayRef.current?.focus();
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  // Number-key shortcut: 1–5 selects a language.
  // Stays on window because it only needs to fire when the palette is open
  // and at that point the overlay is focused, so window receives events fine.
  useEffect(() => {
    const handleKey = (e) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= languages.length) {
        onSelect(languages[num - 1].id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [languages, onSelect]);

  // Outside-click closes the palette.
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Bulletproof ESC handler using capture phase
  // Monaco aggressively intercepts key events. Even if focus stealing fails,
  // the capture phase on the window guarantees we receive the ESC key first.
  useEffect(() => {
    const handleEscapeCapture = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscapeCapture, true);
    return () => window.removeEventListener('keydown', handleEscapeCapture, true);
  }, [onClose]);

  // ESC handler on the overlay element directly — not on window.
  // Element-level onKeyDown fires reliably even when Monaco holds iframe focus,
  // because we explicitly moved focus onto this element on mount.
  // stopPropagation prevents the event reaching Monaco's own key interceptors.
  const handleOverlayKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      ref={overlayRef}
      className="palette-overlay"
      tabIndex={-1}
      onKeyDown={handleOverlayKeyDown}
      style={{ outline: 'none' }}
    >
      <div className="palette-container" ref={containerRef}>
        <div className="palette-header">
          <span>Select Language</span>
          <kbd style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            padding: '2px 8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: '#e6edf3'
          }}>ESC</kbd>
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
            {currentLang === lang.id && <span className="palette-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
