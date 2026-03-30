import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getDefaultThresholds } from '../utils/metrics';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

function loadActiveSport() {
  try { return localStorage.getItem('metricarena_active_sport') || 'all'; } catch { return 'all'; }
}
function saveActiveSport(s) {
  try { localStorage.setItem('metricarena_active_sport', s); } catch { /* ignore */ }
}

const DEFAULT_PROFILE = {
  weight: 75,
  height: 178,
  age: 25,
  maxHR: 195,
  sex: 'male',
  mySports: [],
  sport: 'general',
  vo2max: 0,
  positionsBySport: {},
  province: '',
  country: '',
  is_public: true,
};

// localStorage cache for fast initial render / offline fallback
function loadCachedProfile() {
  try {
    const s = localStorage.getItem('metricarena_profile');
    if (s) return { ...DEFAULT_PROFILE, ...JSON.parse(s) };
  } catch { /* ignore */ }
  return DEFAULT_PROFILE;
}

function saveCachedProfile(p) {
  try { localStorage.setItem('metricarena_profile', JSON.stringify(p)); } catch { /* ignore */ }
}

const SessionContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function SessionProvider({ children }) {
  const { user, profile: authProfile } = useAuth();

  const [processedData, setProcessedData] = useState(null);
  const [profile, setProfileState] = useState(loadCachedProfile);
  const [thresholds, setThresholds] = useState(() => {
    // Use cached defaults until DB loads
    const cached = loadCachedProfile();
    return cached._defaultThresholds || getDefaultThresholds();
  });
  const [loadedSplits, setLoadedSplits] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [activeSport, setActiveSportState] = useState(loadActiveSport);

  const setActiveSport = useCallback((sport) => {
    setActiveSportState(sport);
    saveActiveSport(sport);
  }, []);

  // Sync from DB whenever the auth profile loads or changes
  useEffect(() => {
    if (!authProfile) return;
    if (authProfile.athlete_profile) {
      const p = { ...DEFAULT_PROFILE, ...authProfile.athlete_profile };
      setProfileState(p);
      saveCachedProfile(p);
    }
    if (authProfile.default_thresholds) {
      setThresholds(authProfile.default_thresholds);
    }
  }, [authProfile]);

  /** Persist athlete profile to DB and update local state. */
  const setProfile = useCallback(async (newProfile) => {
    setProfileState(newProfile);
    saveCachedProfile(newProfile);
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase
      .from('profiles')
      .update({ athlete_profile: newProfile, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    return error ? { error: error.message } : { ok: true };
  }, [user]);

  /** Persist default thresholds to DB and update context thresholds. */
  const saveDefaultThresholds = useCallback(async (newThresholds) => {
    setThresholds(newThresholds);
    if (!user) return { error: 'Not signed in' };
    const { error } = await supabase
      .from('profiles')
      .update({ default_thresholds: newThresholds, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    return error ? { error: error.message } : { ok: true };
  }, [user]);

  const clearSession = useCallback(() => {
    setProcessedData(null);
    setLoadedSplits([]);
    setCurrentSessionId(null);
  }, []);

  /** Called when opening a session from history — overrides thresholds with the session's own saved values. */
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
      saveDefaultThresholds,
      clearSession,
      loadedSplits, setLoadedSplits,
      currentSessionId, setCurrentSessionId,
      loadSessionFromHistory,
      activeSport, setActiveSport,
    }}>
      {children}
    </SessionContext.Provider>
  );
}
