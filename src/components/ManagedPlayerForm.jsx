import { useState } from 'react';
import { SPORTS, COUNTRIES, POSITIONS_BY_SPORT } from '../utils/constants';
import { getDefaultThresholds } from '../utils/metrics';
import ThresholdsPanel from './ThresholdsPanel';

// Athlete-profile defaults for a managed player. Mirrors SessionContext's
// DEFAULT_PROFILE but forces is_public:false (managed players are team-only).
const DEFAULT_MANAGED_PROFILE = {
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
  is_public: false,
};

/**
 * Modal form for creating/editing a managed player. Reuses the exact athlete-profile
 * fields + ThresholdsPanel from ProfilePage so metric computation matches real players.
 * Props: { initial?, onSave({display_name, athlete_profile, default_thresholds}), onCancel, saving, error }
 */
export default function ManagedPlayerForm({ initial = null, onSave, onCancel, saving = false, error = null }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.display_name || '');
  const [form, setForm] = useState({ ...DEFAULT_MANAGED_PROFILE, ...(initial?.athlete_profile || {}) });
  const [positionSport, setPositionSport] = useState('');
  const [nameError, setNameError] = useState(false);
  const [thresholds, setThresholds] = useState(initial?.default_thresholds || getDefaultThresholds());

  const change = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!name.trim()) { setNameError(true); return; }
    onSave({
      display_name: name.trim(),
      athlete_profile: { ...form, is_public: false },
      default_thresholds: thresholds,
    });
  };

  const sportsWithPositions = (form.mySports || []).filter(sv => (POSITIONS_BY_SPORT[sv] || []).length > 0);
  const activeSportKey = sportsWithPositions.includes(positionSport) ? positionSport : sportsWithPositions[0];
  const pbs = form.positionsBySport || {};
  const cDef = COUNTRIES.find(c => c.value === form.country);

  return (
    <div className="upload-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}>
      <div className="upload-modal" style={{ maxWidth: 720 }}>
        <button className="upload-modal-close" onClick={onCancel} aria-label="Close" disabled={saving}>&#x2715;</button>

        <div className="profile-section" style={{ margin: 0 }}>
          <h3 className="profile-section-title">{isEdit ? 'Edit Managed Player' : 'Add Managed Player'}</h3>
          <p className="profile-section-hint">
            A managed player has no sign-in account — you control their profile and sessions. You can link them to a real account later.
          </p>

          <div className="profile-grid">
            <div className="field wide">
              <label>Name</label>
              <input
                type="text"
                value={name}
                placeholder="Player name"
                onChange={e => { setName(e.target.value); if (nameError) setNameError(false); }}
                style={nameError ? { borderColor: 'var(--error, #e5484d)' } : undefined}
              />
              {nameError && <span className="profile-section-hint" style={{ color: 'var(--error, #e5484d)' }}>Name is required.</span>}
            </div>
            <div className="field">
              <label>Weight (kg)</label>
              <input type="number" value={form.weight} min="30" max="200" step="0.5"
                onChange={e => change('weight', parseFloat(e.target.value) || 75)} />
            </div>
            <div className="field">
              <label>Height (cm)</label>
              <input type="number" value={form.height} min="100" max="230" step="1"
                onChange={e => change('height', parseFloat(e.target.value) || 178)} />
            </div>
            <div className="field">
              <label>Age</label>
              <input type="number" value={form.age} min="10" max="80" step="1"
                onChange={e => change('age', parseInt(e.target.value) || 25)} />
            </div>
            <div className="field">
              <label>Max Heart Rate (bpm)</label>
              <input type="number" value={form.maxHR} min="120" max="230" step="1"
                onChange={e => change('maxHR', parseInt(e.target.value) || 195)} />
            </div>
            <div className="field">
              <label>Gender</label>
              <select value={form.sex} onChange={e => change('sex', e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="field">
              <label>VO₂ Max (ml/kg/min) — optional</label>
              <input type="number" value={form.vo2max || ''} placeholder="e.g. 50" min="20" max="90" step="0.5"
                onChange={e => change('vo2max', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="field wide">
              <label>Sports</label>
              <div className="position-multi-select">
                {SPORTS.filter(s => s.value !== 'general').map(s => {
                  const selected = (form.mySports || []).includes(s.value);
                  return (
                    <button key={s.value} type="button"
                      className={`position-chip${selected ? ' selected' : ''}`}
                      onClick={() => {
                        const current = form.mySports || [];
                        const next = selected ? current.filter(v => v !== s.value) : [...current, s.value];
                        change('mySports', next);
                        if (selected && form.sport === s.value) change('sport', next[0] || 'general');
                      }}
                    >{s.label}</button>
                  );
                })}
              </div>
            </div>
            {(form.mySports || []).length > 0 && (
              <div className="field wide">
                <label>Default Sport</label>
                <select value={form.sport} onChange={e => change('sport', e.target.value)}>
                  {(form.mySports || []).map(sv => {
                    const s = SPORTS.find(sp => sp.value === sv);
                    return s ? <option key={s.value} value={s.value}>{s.label}</option> : null;
                  })}
                </select>
              </div>
            )}
          </div>

          {sportsWithPositions.length > 0 && (
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
                {(POSITIONS_BY_SPORT[activeSportKey] || []).map(pos => {
                  const selected = (pbs[activeSportKey] || []).includes(pos);
                  return (
                    <button key={pos} type="button"
                      className={`position-chip${selected ? ' selected' : ''}`}
                      onClick={() => {
                        const cur = pbs[activeSportKey] || [];
                        const next = selected ? cur.filter(p => p !== pos) : [...cur, pos];
                        change('positionsBySport', { ...pbs, [activeSportKey]: next });
                      }}
                    >{pos}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="profile-grid" style={{ marginTop: '12px' }}>
            <div className="field">
              <label>Country</label>
              <select value={form.country || ''} onChange={e => { change('country', e.target.value); change('province', ''); }}>
                <option value="">Not set</option>
                {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Province / State</label>
              {cDef?.provinces?.length > 0 ? (
                <select value={form.province || ''} onChange={e => change('province', e.target.value)}>
                  <option value="">Not set</option>
                  {cDef.provinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input type="text" value={form.province || ''} placeholder="Province / State"
                  onChange={e => change('province', e.target.value)} />
              )}
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label className="profile-section-hint" style={{ display: 'block', marginBottom: 4 }}>
              Thresholds &amp; Zones (adjust then Apply; defaults used otherwise)
            </label>
            <ThresholdsPanel
              thresholds={thresholds}
              onChange={setThresholds}
              onApply={setThresholds}
              applyLabel="Apply Thresholds"
            />
          </div>

          {error && <div className="profile-section-hint" style={{ color: 'var(--error, #e5484d)', marginTop: 8 }}>{error}</div>}

          <div className="upload-details-actions" style={{ marginTop: '16px' }}>
            <button className="btn btn-accent btn-lg" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Player'}
            </button>
            <button className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
