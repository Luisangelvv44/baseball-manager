import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '../context/TeamContext.jsx';
import { TYPE_CONFIG, DEFAULT_CONFIG, ALERT_ROUTE } from '../utils/newsTypes.js';

export default function AlertsBell() {
  const { alerts, alertUnread, markAlertsSeen } = useTeam();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && alertUnread > 0) markAlertsSeen();
  };

  const openAlert = (item) => {
    setOpen(false);
    const to = ALERT_ROUTE[item.type] ?? '/news';
    navigate(to);
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        title="Alertas"
        aria-label="Alertas"
        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
          open ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a6 6 0 0 0-6 6v3.6l-1.7 3.1A1 1 0 0 0 5.2 16h13.6a1 1 0 0 0 .9-1.3L18 11.6V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 22Z" />
        </svg>
        {alertUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
            {alertUnread > 9 ? '9+' : alertUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white text-gray-800 rounded-lg shadow-xl z-50 max-h-[70vh] overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-200 font-semibold text-sm">Alertas</div>
          {alerts.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">Sin novedades importantes</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {alerts.map((item) => {
                const cfg = TYPE_CONFIG[item.type] ?? DEFAULT_CONFIG;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openAlert(item)}
                      className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50"
                    >
                      <span className={`${cfg.bg} w-2 h-2 rounded-full shrink-0 mt-1.5`} />
                      <span className="flex-1 text-sm">{item.headline}</span>
                      <span className="text-gray-400 text-xs shrink-0 mt-0.5">Día {item.season_day}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
