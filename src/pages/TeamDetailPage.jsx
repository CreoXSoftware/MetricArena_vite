import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { supabase } from '../lib/supabase';
import { SPORTS } from '../utils/constants';
import ImageCropModal from '../components/ImageCropModal';

export default function TeamDetailPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { myTeams, loading: teamsLoading, leaveTeam, removeMember, transferManager, searchUsers, getTeamMembers, updateTeamAvatar } = useTeams();

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Manager transfer
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  // Team avatar
  const [teamCropFile, setTeamCropFile] = useState(null);
  const [teamAvatarUploading, setTeamAvatarUploading] = useState(false);
  const teamAvatarInputRef = useRef(null);

  // Clipboard
  const [copied, setCopied] = useState(false);

  const team = myTeams.find(t => t.id === teamId);
  const isManager = team?.is_manager || false;

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

  const handleRemoveMember = async (userId) => {
    await removeMember(teamId, userId);
    await fetchMembers();
  };

  const handleTransferManager = async (newManagerId) => {
    await transferManager(teamId, newManagerId);
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

  const handleTeamCropConfirm = useCallback(async (blob) => {
    setTeamCropFile(null);
    setTeamAvatarUploading(true);
    const path = `teams/${teamId}/avatar.png`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: blob.type });
    if (uploadError) { console.error('Team avatar upload error:', uploadError.message); setTeamAvatarUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await updateTeamAvatar(teamId, `${publicUrl}?t=${Date.now()}`);
    setTeamAvatarUploading(false);
  }, [teamId, updateTeamAvatar]);

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
        <div className="team-header-identity">
          <div
            className={`team-avatar-wrapper${isManager ? ' team-avatar-clickable' : ''}`}
            onClick={isManager ? () => teamAvatarInputRef.current?.click() : undefined}
            title={isManager ? 'Change team avatar' : undefined}
          >
            {team.avatar_url ? (
              <img src={team.avatar_url} alt="" className="team-avatar-img" />
            ) : (
              <div className="team-avatar-placeholder">
                {(team.name || 'T').charAt(0).toUpperCase()}
              </div>
            )}
            {isManager && (
              <div className="profile-avatar-overlay">
                {teamAvatarUploading ? 'Uploading…' : 'Change'}
              </div>
            )}
            <input
              ref={teamAvatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { e.target.value = ''; setTeamCropFile(f); } }}
            />
          </div>
          <div>
            <h2 className="page-title">{team.name}</h2>
            <div className="team-detail-sport">
              {SPORTS.find(s => s.value === team.sport)?.label || team.sport}
            </div>
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

      {teamCropFile && (
        <ImageCropModal
          file={teamCropFile}
          onConfirm={handleTeamCropConfirm}
          onCancel={() => setTeamCropFile(null)}
        />
      )}

      {/* Members */}
      <div className="team-section">
        <h3 className="team-section-title">Players ({members.filter(m => m.is_player).length})</h3>
        {loadingMembers ? (
          <p className="text-dim">Loading…</p>
        ) : (
          <div className="team-members-list">
            {members.filter(m => m.is_player).map(m => (
              <div key={m.id} className="team-member-row">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="team-member-avatar" />
                ) : (
                  <div className="team-member-avatar-placeholder">
                    {(m.display_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="team-member-name">{m.display_name || 'Unknown'}</span>
                {m.is_manager && <span className="manager-badge">Manager</span>}
                {isManager && m.id !== user?.id && (
                  <div className="team-member-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => handleTransferManager(m.id)}>
                      Make Manager
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

        {isManager && (
          <div className="team-transfer-section">
            <button className="btn btn-sm btn-outline" onClick={() => setShowSearch(!showSearch)}>
              {showSearch ? 'Cancel Search' : 'Search Members to Transfer Manager'}
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
                      <button key={r.id} className="user-search-result" onClick={() => handleTransferManager(r.id)}>
                        {r.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isManager && (
          <button className="btn btn-sm btn-outline btn-danger" onClick={handleLeave} style={{ marginTop: '12px' }}>
            Leave Team
          </button>
        )}
      </div>

    </div>
  );
}
