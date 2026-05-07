import { useEffect } from 'react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], action: 'Run code' },
  { keys: ['Ctrl', 'L'],     action: 'Clear terminal' },
  { keys: ['Escape'],         action: 'Close panels' },
  { keys: ['1\u20135'],            action: 'Select language (in palette)' },
  { keys: ['?'],              action: 'This help' },
];

export default function HelpOverlay({ onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="help-container" onClick={e => e.stopPropagation()}>
        <div className="palette-header">
          <span>Keyboard Shortcuts</span>
          <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#e6edf3' }}>ESC</kbd>
        </div>
        {SHORTCUTS.map(({ keys, action }) => (
          <div key={action} className="help-row">
            <div className="help-keys">
              {Array.isArray(keys) ? keys.map(k => <kbd key={k} className="help-key">{k}</kbd>) : <kbd className="help-key">{keys}</kbd>}
            </div>
            <span className="help-action">{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
