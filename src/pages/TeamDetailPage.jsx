import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { SPORTS } from '../utils/constants';

export default function TeamDetailPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { myTeams, loading: teamsLoading, leaveTeam, removeMember, transferCoach, searchUsers, getTeamMembers } = useTeams();
  const { teamSessions, createTeamSession, deleteTeamSession } = useTeamSessions(teamId);

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Create session form
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Coach transfer
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  // Clipboard
  const [copied, setCopied] = useState(false);

  const team = myTeams.find(t => t.id === teamId);
  const isCoach = team?.is_coach || false;

  const fetchMembers = useCallback(async () => {
    const data = await getTeamMembers(teamId);
    setMembers(data);
    setLoadingMembers(false);
  }, [teamId, getTeamMembers]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleCopyInvite = () => {
    if (team?.invite_code) {
      navigator.clipboard.writeText(team.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!sessionName.trim() || !sessionDate) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await createTeamSession(teamId, sessionName.trim(), sessionDate);
    setSubmitting(false);
    if (err) { setError(err); return; }
    setSessionName('');
    setSessionDate('');
    setShowCreateSession(false);
  };

  const handleRemoveMember = async (userId) => {
    await removeMember(teamId, userId);
    await fetchMembers();
  };

  const handleTransferCoach = async (newCoachId) => {
    await transferCoach(teamId, newCoachId);
    setShowSearch(false);
    await fetchMembers();
  };

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const results = await searchUsers(q);
    // Filter to only team members
    const memberIds = new Set(members.map(m => m.id));
    setSearchResults(results.filter(r => memberIds.has(r.id) && r.id !== user?.id));
  };

  const handleLeave = async () => {
    await leaveTeam(teamId);
    navigate('/app/teams');
  };

  if (teamsLoading) {
    return (
      <div className="loading" style={{ display: 'flex' }}>
        <div className="spinner"></div>
        <p>Loading team…</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="team-detail-page">
        <div className="empty-state">
          <div className="empty-state-title">Team not found</div>
          <button className="btn btn-outline" onClick={() => navigate('/app/teams')}>Back to Teams</button>
        </div>
      </div>
    );
  }

  return (
    <div className="team-detail-page">
      <div className="team-detail-header">
        <div>
          <h2 className="page-title">{team.name}</h2>
          <div className="team-detail-sport">
            {SPORTS.find(s => s.value === team.sport)?.label || team.sport}
          </div>
        </div>
        <div className="team-invite-section">
          <span className="team-invite-label">Invite Code</span>
          <button className="team-invite-code" onClick={handleCopyInvite} title="Click to copy">
            {team.invite_code}
            <span className="team-invite-copied">{copied ? ' Copied!' : ''}</span>
          </button>
        </div>
      </div>

      {error && <div className="upload-error">{error}</div>}

      {/* Members */}
      <div className="team-section">
        <h3 className="team-section-title">Members ({members.length})</h3>
        {loadingMembers ? (
          <p className="text-dim">Loading…</p>
        ) : (
          <div className="team-members-list">
            {members.map(m => (
              <div key={m.id} className="team-member-row">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="team-member-avatar" />
                ) : (
                  <div className="team-member-avatar-placeholder">
                    {(m.display_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="team-member-name">{m.display_name || 'Unknown'}</span>
                {m.is_coach && <span className="coach-badge">Coach</span>}
                {isCoach && !m.is_coach && m.id !== user?.id && (
                  <div className="team-member-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => handleTransferCoach(m.id)}>
                      Make Coach
                    </button>
                    <button className="btn btn-sm btn-outline btn-danger" onClick={() => handleRemoveMember(m.id)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isCoach && (
          <div className="team-transfer-section">
            <button className="btn btn-sm btn-outline" onClick={() => setShowSearch(!showSearch)}>
              {showSearch ? 'Cancel Search' : 'Search Members to Transfer Coach'}
            </button>
            {showSearch && (
              <div className="user-search">
                <input
                  type="text"
                  placeholder="Search by display name…"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="user-search-results">
                    {searchResults.map(r => (
                      <button key={r.id} className="user-search-result" onClick={() => handleTransferCoach(r.id)}>
                        {r.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isCoach && (
          <button className="btn btn-sm btn-outline btn-danger" onClick={handleLeave} style={{ marginTop: '12px' }}>
            Leave Team
          </button>
        )}
      </div>

      {/* Team Sessions */}
      <div className="team-section">
        <div className="team-section-header">
          <h3 className="team-section-title">Team Sessions</h3>
          {isCoach && (
            <button className="btn btn-sm btn-accent" onClick={() => setShowCreateSession(!showCreateSession)}>
              {showCreateSession ? 'Cancel' : 'Create Session'}
            </button>
          )}
        </div>

        {showCreateSession && (
          <form className="teams-inline-form" onSubmit={handleCreateSession}>
            <input
              type="text"
              placeholder="Session name (e.g. Bats vs Rats)"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              required
              autoFocus
            />
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-accent" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}

        {teamSessions.length === 0 ? (
          <div className="empty-state-inline">
            No team sessions yet{isCoach ? ' — create one above.' : '.'}
          </div>
        ) : (
          <div className="team-sessions-list">
            {teamSessions.map(ts => (
              <div key={ts.id} className="team-session-card">
                <div className="team-session-card-top">
                  <span className="team-session-card-name">{ts.name}</span>
                  <span className="team-session-card-date">
                    {new Date(ts.session_date + 'T00:00:00').toLocaleDateString(undefined, {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
                {isCoach && (
                  <button className="btn btn-sm btn-outline btn-danger" onClick={() => deleteTeamSession(ts.id)}>
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
