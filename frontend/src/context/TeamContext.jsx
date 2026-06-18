import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const TeamContext = createContext(null);

export function TeamProvider({ children }) {
  const [myTeam, setMyTeam] = useState(null);

  const refreshTeam = useCallback(async () => {
    try {
      const res = await api.getMyTeam();
      setMyTeam(res.team);
    } catch (_) {}
  }, []);

  useEffect(() => { refreshTeam(); }, [refreshTeam]);

  return (
    <TeamContext.Provider value={{ myTeam, refreshTeam }}>
      {children}
    </TeamContext.Provider>
  );
}

export const useTeam = () => useContext(TeamContext);
