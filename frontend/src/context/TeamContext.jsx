import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const TeamContext = createContext(null);

export function TeamProvider({ children }) {
  const [myTeam, setMyTeam] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertUnread, setAlertUnread] = useState(0);

  const refreshTeam = useCallback(async () => {
    try {
      const res = await api.getMyTeam();
      setMyTeam(res.team);
    } catch (_) {}
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      const res = await api.getAlerts();
      setAlerts(res.items ?? []);
      setAlertUnread(res.unreadCount ?? 0);
    } catch (_) {}
  }, []);

  const markAlertsSeen = useCallback(async () => {
    setAlertUnread(0);
    try {
      await api.markAlertsSeen();
    } catch (_) {}
    refreshAlerts();
  }, [refreshAlerts]);

  useEffect(() => { refreshTeam(); }, [refreshTeam]);
  useEffect(() => { refreshAlerts(); }, [refreshAlerts]);

  return (
    <TeamContext.Provider value={{ myTeam, refreshTeam, alerts, alertUnread, refreshAlerts, markAlertsSeen }}>
      {children}
    </TeamContext.Provider>
  );
}

export const useTeam = () => useContext(TeamContext);
