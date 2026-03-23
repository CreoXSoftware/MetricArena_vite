import React from 'react';

export default function ProfileCard({ profile, onChange }) {
  const handleChange = (field, value) => {
    onChange({ ...profile, [field]: value });
  };

  return (
    <div className="profile-card">
      <h3><span className="dot"></span> Athlete Profile</h3>
      <div className="profile-grid">
        <div className="field">
          <label>Weight (kg)</label>
          <input type="number" value={profile.weight} min="30" max="200" step="0.5"
            onChange={e => handleChange('weight', parseFloat(e.target.value) || 75)} />
        </div>
        <div className="field">
          <label>Height (cm)</label>
          <input type="number" value={profile.height} min="100" max="230" step="1"
            onChange={e => handleChange('height', parseFloat(e.target.value) || 178)} />
        </div>
        <div className="field">
          <label>Age</label>
          <input type="number" value={profile.age} min="10" max="80" step="1"
            onChange={e => handleChange('age', parseInt(e.target.value) || 25)} />
        </div>
        <div className="field">
          <label>Max Heart Rate (bpm)</label>
          <input type="number" value={profile.maxHR} min="120" max="230" step="1"
            onChange={e => handleChange('maxHR', parseInt(e.target.value) || 195)} />
        </div>
        <div className="field">
          <label>Sex</label>
          <select value={profile.sex} onChange={e => handleChange('sex', e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="field">
          <label>Sport</label>
          <select value={profile.sport} onChange={e => handleChange('sport', e.target.value)}>
            <option value="rugby">Rugby</option>
            <option value="football">Football / Soccer</option>
            <option value="hockey">Hockey</option>
            <option value="athletics">Athletics / Track</option>
            <option value="general">General / Other</option>
          </select>
        </div>
        <div className="field wide">
          <label>VO₂ Max (ml/kg/min) — optional, improves calorie estimate</label>
          <input type="number" value={profile.vo2max || ''} placeholder="e.g. 50" min="20" max="90" step="0.5"
            onChange={e => handleChange('vo2max', parseFloat(e.target.value) || 0)} />
        </div>
      </div>
      <div className="profile-hint">Profile is used for calorie, power, force, and metabolic estimates. Values are saved in your browser.</div>
    </div>
  );
}
