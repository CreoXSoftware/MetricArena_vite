import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeams } from '../hooks/useTeams';
import { SPORTS } from '../utils/constants';

export default function TeamsPage() {
  const { myTeams, loading, createTeam, joinTeam } = useTeams();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSport, setNewSport] = useState('general');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await createTeam(newName.trim(), newSport);
    setSubmitting(false);
    if (err) { setError(err); return; }
    setNewName('');
    setShowCreate(false);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await joinTeam(inviteCode);
    setSubmitting(false);
    if (err) { setError(err); return; }
    setInviteCode('');
    setShowJoin(false);
  };

  if (loading) {
    return (
      <div className="loading" style={{ display: 'flex' }}>
        <div className="spinner"></div>
        <p>Loading teams…</p>
      </div>
    );
  }

  return (
    <div className="teams-page">
      <div className="teams-page-header">
        <h2 className="page-title">My Teams</h2>
        <div className="teams-actions">
          <button className="btn btn-accent" onClick={() => { setShowCreate(!showCreate); setShowJoin(false); setError(null); }}>
            Create Team
          </button>
          <button className="btn btn-outline" onClick={() => { setShowJoin(!showJoin); setShowCreate(false); setError(null); }}>
            Join Team
          </button>
        </div>
      </div>

      {error && <div className="upload-error">{error}</div>}

      {showCreate && (
        <form className="teams-inline-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Team name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            autoFocus
          />
          <select value={newSport} onChange={(e) => setNewSport(e.target.value)}>
            {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-accent" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      {showJoin && (
        <form className="teams-inline-form" onSubmit={handleJoin}>
          <input
            type="text"
            placeholder="Invite code (8 characters)"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            maxLength={8}
            required
            autoFocus
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em', textTransform: 'uppercase' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-accent" disabled={submitting}>
              {submitting ? 'Joining…' : 'Join'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowJoin(false)}>Cancel</button>
          </div>
        </form>
      )}

      {myTeams.length === 0 && !showCreate && !showJoin ? (
        <div className="empty-state">
          <div className="empty-state-title">No teams yet</div>
          <p className="empty-state-desc">Create a team or join one with an invite code.</p>
        </div>
      ) : (
        <div className="teams-list">
          {myTeams.map(team => (
            <div key={team.id} className="team-card" onClick={() => navigate(`/app/teams/${team.id}`)}>
              <div className="team-card-top">
                <span className="team-card-name">{team.name}</span>
                {team.is_coach && <span className="coach-badge">Coach</span>}
              </div>
              <div className="team-card-meta">
                {SPORTS.find(s => s.value === team.sport)?.label || team.sport}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
