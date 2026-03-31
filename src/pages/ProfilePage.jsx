import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSession } from '../contexts/SessionContext';
import { supabase } from '../lib/supabase';
import { SPORTS, COUNTRIES, POSITIONS_BY_SPORT } from '../utils/constants';
import ThresholdsPanel from '../components/ThresholdsPanel';
import ImageCropModal from '../components/ImageCropModal';

export default function ProfilePage() {
  const { user, profile: authProfile, signOut, refreshProfile } = useAuth();
  const { profile: athleteProfile, setProfile: saveAthleteProfile, thresholds, saveDefaultThresholds } = useSession();

  const [displayName, setDisplayName] = useState(authProfile?.display_name || '');
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);

  // Local form state for athlete profile — only sent to DB on Save
  const [athleteForm, setAthleteForm] = useState({ ...athleteProfile });
  const [positionSport, setPositionSport] = useState('');
  const [athleteSaving, setAthleteSaving] = useState(false);
  const [athleteSaved, setAthleteSaved] = useState(false);
  const [athleteError, setAthleteError] = useState(null);

  // Threshold saving state
  const [threshSaving, setThreshSaving] = useState(false);
  const [threshSaved, setThreshSaved] = useState(false);
  const pendingThresholdsRef = useRef(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const fileInputRef = useRef(null);

  const avatarUrl = authProfile?.avatar_url || null;

  const handleSaveDisplayName = useCallback(async () => {
    if (!user) return;
    setAccountSaving(true);
    await supabase
      .from('profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    await refreshProfile();
    setAccountSaving(false);
    setAccountSaved(true);
    setTimeout(() => setAccountSaved(false), 2000);
  }, [user, displayName, refreshProfile]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropFile(file);
  }, []);

  const handleCropConfirm = useCallback(async (blob) => {
    setCropFile(null);
    if (!user) return;
    setAvatarUploading(true);
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: blob.type });
    if (uploadError) { console.error('Avatar upload error:', uploadError.message); setAvatarUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from('profiles').update({ avatar_url: url, updated_at: new Date().toISOString() }).eq('id', user.id);
    await refreshProfile();
    setAvatarUploading(false);
  }, [user, refreshProfile]);

  const handleAthleteFormChange = (field, value) => {
    setAthleteForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveAthleteProfile = async () => {
    setAthleteSaving(true);
    setAthleteError(null);
    const result = await saveAthleteProfile(athleteForm);
    setAthleteSaving(false);
    if (result?.error) {
      setAthleteError(result.error);
    } else {
      setAthleteSaved(true);
      setTimeout(() => setAthleteSaved(false), 2000);
    }
  };

  const handleThreshApply = async () => {
    const t = pendingThresholdsRef.current;
    if (!t) return;
    setThreshSaving(true);
    await saveDefaultThresholds(t);
    setThreshSaving(false);
    setThreshSaved(true);
    setTimeout(() => setThreshSaved(false), 2000);
  };

  return (
    <div className="profile-page">
      <h2 className="profile-page-title">
        My Profile
        {authProfile?.is_verified && (
          <span className="verified-badge verified-badge--lg" title="Verified player"><svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#1d9bf0"/><path d="M4.8 8.2l2 2.1L11.2 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
        )}
      </h2>

      {/* Account Section */}
      <div className="profile-section">
        <h3 className="profile-section-title">Account</h3>
        <div className="profile-account-row">
          <div className="profile-avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-placeholder">
                {(displayName || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="profile-avatar-overlay">
              {avatarUploading ? 'Uploading…' : 'Change'}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
          </div>
          <div className="profile-account-fields">
            <label className="auth-label">
              Display Name
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label className="auth-label">
              Email
              <input type="email" value={user?.email || ''} disabled />
            </label>
            <div className="profile-account-actions">
              <button className="btn btn-accent" onClick={handleSaveDisplayName} disabled={accountSaving}>
                {accountSaving ? 'Saving…' : accountSaved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Athlete Profile Section */}
      <div className="profile-section">
        <h3 className="profile-section-title">Athlete Profile</h3>
        <p className="profile-section-hint">Used for calorie, power, force, and metabolic estimates during session analysis.</p>
        <div className="profile-grid">
          <div className="field">
            <label>Weight (kg)</label>
            <input type="number" value={athleteForm.weight} min="30" max="200" step="0.5"
              onChange={e => handleAthleteFormChange('weight', parseFloat(e.target.value) || 75)} />
          </div>
          <div className="field">
            <label>Height (cm)</label>
            <input type="number" value={athleteForm.height} min="100" max="230" step="1"
              onChange={e => handleAthleteFormChange('height', parseFloat(e.target.value) || 178)} />
          </div>
          <div className="field">
            <label>Age</label>
            <input type="number" value={athleteForm.age} min="10" max="80" step="1"
              onChange={e => handleAthleteFormChange('age', parseInt(e.target.value) || 25)} />
          </div>
          <div className="field">
            <label>Max Heart Rate (bpm)</label>
            <input type="number" value={athleteForm.maxHR} min="120" max="230" step="1"
              onChange={e => handleAthleteFormChange('maxHR', parseInt(e.target.value) || 195)} />
          </div>
          <div className="field">
            <label>Gender</label>
            <select value={athleteForm.sex} onChange={e => handleAthleteFormChange('sex', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="field wide">
            <label>VO₂ Max (ml/kg/min) — optional</label>
            <input type="number" value={athleteForm.vo2max || ''} placeholder="e.g. 50" min="20" max="90" step="0.5"
              onChange={e => handleAthleteFormChange('vo2max', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="field wide">
            <label>Sports I Compete In</label>
            <div className="position-multi-select">
              {SPORTS.filter(s => s.value !== 'general').map(s => {
                const selected = (athleteForm.mySports || []).includes(s.value);
                return (
                  <button key={s.value} type="button"
                    className={`position-chip${selected ? ' selected' : ''}`}
                    onClick={() => {
                      const current = athleteForm.mySports || [];
                      const next = selected ? current.filter(v => v !== s.value) : [...current, s.value];
                      handleAthleteFormChange('mySports', next);
                      // If default sport was removed, reset it
                      if (selected && athleteForm.sport === s.value) {
                        handleAthleteFormChange('sport', next[0] || 'general');
                      }
                    }}
                  >{s.label}</button>
                );
              })}
            </div>
          </div>
          {(athleteForm.mySports || []).length > 0 && (
            <div className="field wide">
              <label>Default Sport</label>
              <p className="profile-section-hint" style={{ margin: '0 0 4px' }}>Sets the navbar sport filter when you log in.</p>
              <select value={athleteForm.sport} onChange={e => handleAthleteFormChange('sport', e.target.value)}>
                {(athleteForm.mySports || []).map(sv => {
                  const s = SPORTS.find(sp => sp.value === sv);
                  return s ? <option key={s.value} value={s.value}>{s.label}</option> : null;
                })}
              </select>
            </div>
          )}
        </div>

        {/* Positions — per-sport multi-select */}
        {(() => {
          const sportsWithPositions = (athleteForm.mySports || []).filter(sv => (POSITIONS_BY_SPORT[sv] || []).length > 0);
          if (sportsWithPositions.length === 0) return null;
          const activeSportKey = sportsWithPositions.includes(positionSport) ? positionSport : sportsWithPositions[0];
          const positions = POSITIONS_BY_SPORT[activeSportKey] || [];
          const pbs = athleteForm.positionsBySport || {};
          const selected = pbs[activeSportKey] || [];
          return (
            <div className="profile-positions-section">
              <div className="profile-positions-header">
                <label>Position(s)</label>
                {sportsWithPositions.length > 1 && (
                  <select className="filter-select" value={activeSportKey} onChange={e => setPositionSport(e.target.value)}>
                    {sportsWithPositions.map(sv => {
                      const s = SPORTS.find(sp => sp.value === sv);
                      return <option key={sv} value={sv}>{s?.label || sv}</option>;
                    })}
                  </select>
                )}
              </div>
              <div className="position-multi-select">
                {positions.map(pos => {
                  const isSelected = selected.includes(pos);
                  return (
                    <button key={pos} type="button"
                      className={`position-chip${isSelected ? ' selected' : ''}`}
                      onClick={() => {
                        const next = isSelected ? selected.filter(p => p !== pos) : [...selected, pos];
                        handleAthleteFormChange('positionsBySport', { ...pbs, [activeSportKey]: next });
                      }}
                    >{pos}</button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="profile-grid" style={{ marginTop: '12px' }}>
          <div className="field">
            <label>Country</label>
            <select value={athleteForm.country || ''} onChange={e => { handleAthleteFormChange('country', e.target.value); handleAthleteFormChange('province', ''); }}>
              <option value="">Not set</option>
              {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Province / State</label>
            {(() => {
              const cDef = COUNTRIES.find(c => c.value === athleteForm.country);
              return cDef?.provinces?.length > 0 ? (
                <select value={athleteForm.province || ''} onChange={e => handleAthleteFormChange('province', e.target.value)}>
                  <option value="">Not set</option>
                  {cDef.provinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input type="text" value={athleteForm.province || ''} placeholder="Province / State"
                  onChange={e => handleAthleteFormChange('province', e.target.value)} />
              );
            })()}
          </div>
        </div>

        <div className="profile-grid" style={{ marginTop: '12px' }}>
          <div className="field wide">
            <label>Leaderboard Visibility</label>
            <p className="profile-section-hint" style={{ margin: '0 0 8px' }}>
              When set to Private, your profile will not appear on public leaderboards or comparisons.
            </p>
            <button
              type="button"
              className={`toggle-btn${athleteForm.is_public !== false ? ' active' : ''}`}
              onClick={() => handleAthleteFormChange('is_public', !(athleteForm.is_public !== false))}
            >
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-label">{athleteForm.is_public !== false ? 'Public' : 'Private'}</span>
            </button>
          </div>
        </div>

        {athleteError && <div className="profile-hint" style={{ color: 'var(--error)' }}>{athleteError}</div>}
        <div className="profile-account-actions" style={{ marginTop: '12px' }}>
          <button className="btn btn-accent" onClick={handleSaveAthleteProfile} disabled={athleteSaving}>
            {athleteSaving ? 'Saving…' : athleteSaved ? 'Saved!' : 'Save Athlete Profile'}
          </button>
        </div>
      </div>

      {/* Default Thresholds Section */}
      <div className="profile-section">
        <h3 className="profile-section-title">Default Thresholds &amp; Zones</h3>
        <p className="profile-section-hint">These values pre-populate the Thresholds panel for every new session.</p>
        <ThresholdsPanel
          thresholds={authProfile?.default_thresholds || thresholds}
          onChange={(t) => { pendingThresholdsRef.current = t; }}
          onApply={handleThreshApply}
          applyLabel={threshSaving ? 'Saving…' : threshSaved ? 'Saved!' : 'Save'}
        />
      </div>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropFile(null)}
        />
      )}

      {/* Danger Zone */}
      <div className="profile-section profile-danger-zone">
        <h3 className="profile-section-title">Account Actions</h3>
        <button className="btn btn-outline" onClick={signOut}>Sign Out</button>
      </div>
    </div>
  );
}
