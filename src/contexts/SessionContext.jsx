import { createContext, useContext, useState, useCallback } from 'react';
import { getDefaultThresholds } from '../utils/metrics';

const DEFAULT_PROFILE = {
  weight: 75,
  height: 178,
  age: 25,
  maxHR: 195,
  sex: 'male',
  sport: 'general',
  vo2max: 0,
};

function loadProfile() {
  try {
    const saved = localStorage.getItem('metricarena_profile');
    if (saved) return { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_PROFILE;
}

function saveProfileToStorage(profile) {
  try { localStorage.setItem('metricarena_profile', JSON.stringify(profile)); } catch { /* ignore */ }
}

const SessionContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function SessionProvider({ children }) {
  const [processedData, setProcessedData] = useState(null);
  const [thresholds, setThresholds] = useState(getDefaultThresholds);
  const [profile, setProfileState] = useState(loadProfile);
  const [loadedSplits, setLoadedSplits] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const setProfile = useCallback((newProfile) => {
    setProfileState(newProfile);
    saveProfileToStorage(newProfile);
  }, []);

  const clearSession = useCallback(() => {
    setProcessedData(null);
    setLoadedSplits([]);
    setCurrentSessionId(null);
  }, []);

  /** Called when opening a session from history. Overrides thresholds with the
   *  session's saved thresholds so the dashboard matches the original analysis. */
  const loadSessionFromHistory = useCallback((data, sessionThresholds, sessionSplits, sessionId) => {
    setProcessedData(data);
    if (sessionThresholds) setThresholds(sessionThresholds);
    setLoadedSplits(sessionSplits || []);
    setCurrentSessionId(sessionId || null);
  }, []);

  return (
    <SessionContext.Provider value={{
      processedData, setProcessedData,
      thresholds, setThresholds,
      profile, setProfile,
      clearSession,
      loadedSplits, setLoadedSplits,
      currentSessionId, setCurrentSessionId,
      loadSessionFromHistory,
    }}>
      {children}
    </SessionContext.Provider>
  );
}
