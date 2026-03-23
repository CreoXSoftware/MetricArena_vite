import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSession } from '../contexts/SessionContext';
import { supabase } from '../lib/supabase';
import { SPORTS } from '../utils/constants';

export default function ProfilePage() {
  const { user, profile: authProfile, signOut, refreshProfile } = useAuth();
  const { profile: athleteProfile, setProfile: setAthleteProfile } = useSession();

  const [displayName, setDisplayName] = useState(authProfile?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);

  const avatarUrl = authProfile?.avatar_url || null;

  const handleSaveDisplayName = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [user, displayName, refreshProfile]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setAvatarUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;

    // Upload to Supabase Storage (bucket: avatars)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError.message);
      setAvatarUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    // Add cache-buster so browser refreshes the image
    const url = `${publicUrl}?t=${Date.now()}`;

    await supabase
      .from('profiles')
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    await refreshProfile();
    setAvatarUploading(false);
  }, [user, refreshProfile]);

  const handleAthleteChange = (field, value) => {
    setAthleteProfile({ ...athleteProfile, [field]: value });
  };

  return (
    <div className="profile-page">
      <h2 className="profile-page-title">My Profile</h2>

      {/* Account Section */}
      <div className="profile-section">
        <h3 className="profile-section-title">Account</h3>
        <div className="profile-account-row">
          <div className="profile-avatar-wrapper" onClick={handleAvatarClick}>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
          </div>
          <div className="profile-account-fields">
            <label className="auth-label">
              Display Name
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="auth-label">
              Email
              <input type="email" value={user?.email || ''} disabled />
            </label>
            <div className="profile-account-actions">
              <button className="btn btn-accent" onClick={handleSaveDisplayName} disabled={saving}>
                {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
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
            <input type="number" value={athleteProfile.weight} min="30" max="200" step="0.5"
              onChange={e => handleAthleteChange('weight', parseFloat(e.target.value) || 75)} />
          </div>
          <div className="field">
            <label>Height (cm)</label>
            <input type="number" value={athleteProfile.height} min="100" max="230" step="1"
              onChange={e => handleAthleteChange('height', parseFloat(e.target.value) || 178)} />
          </div>
          <div className="field">
            <label>Age</label>
            <input type="number" value={athleteProfile.age} min="10" max="80" step="1"
              onChange={e => handleAthleteChange('age', parseInt(e.target.value) || 25)} />
          </div>
          <div className="field">
            <label>Max Heart Rate (bpm)</label>
            <input type="number" value={athleteProfile.maxHR} min="120" max="230" step="1"
              onChange={e => handleAthleteChange('maxHR', parseInt(e.target.value) || 195)} />
          </div>
          <div className="field">
            <label>Sex</label>
            <select value={athleteProfile.sex} onChange={e => handleAthleteChange('sex', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="field">
            <label>Default Sport</label>
            <select value={athleteProfile.sport} onChange={e => handleAthleteChange('sport', e.target.value)}>
              {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field wide">
            <label>VO₂ Max (ml/kg/min) — optional</label>
            <input type="number" value={athleteProfile.vo2max || ''} placeholder="e.g. 50" min="20" max="90" step="0.5"
              onChange={e => handleAthleteChange('vo2max', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="profile-hint">Changes are saved automatically to your browser. In a future update, these will sync to your account.</div>
      </div>

      {/* Danger Zone */}
      <div className="profile-section profile-danger-zone">
        <h3 className="profile-section-title">Account Actions</h3>
        <button className="btn btn-outline" onClick={signOut}>Sign Out</button>
      </div>
    </div>
  );
}
