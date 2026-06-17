import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { useManagedPlayers } from '../hooks/useManagedPlayers';
import { supabase } from '../lib/supabase';
import { SPORTS, COUNTRIES } from '../utils/constants';
import ImageCropModal from '../components/ImageCropModal';
import ManagedPlayerForm from '../components/ManagedPlayerForm';

export default function TeamDetailPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { myTeams, loading: teamsLoading, leaveTeam, removeMember, transferManager, searchUsers, getTeamMembers, updateTeam, updateTeamAvatar, deleteTeam } = useTeams();
  const { createManagedPlayer, updateManagedPlayer, deleteManagedPlayer, linkManagedPlayer, getManagedPlayerSessionCount } = useManagedPlayers();

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Managed players (create/edit modal)
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null); // null = create
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [playerFormError, setPlayerFormError] = useState(null);
  // Managed player delete
  const [deletePlayer, setDeletePlayer] = useState(null); // { id, name, count }
  const [deletingPlayer, setDeletingPlayer] = useState(false);
  // Managed player link/consolidate
  const [linkPlayer, setLinkPlayer] = useState(null); // ghost being linked
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState(null);

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

  // Delete team
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Location fields
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);

  const team = myTeams.find(t => t.id === teamId);

  const [teamCountry, setTeamCountry] = useState(team?.country || '');
  const [teamProvince, setTeamProvince] = useState(team?.province || '');

  const selectedCountryDef = COUNTRIES.find(c => c.value === teamCountry);

  const handleSaveLocation = async () => {
    setLocationSaving(true);
    await updateTeam(teamId, {
      province: teamProvince.trim() || null,
      country: teamCountry.trim() || null,
    });
    setLocationSaving(false);
    setEditingLocation(false);
  };
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

  // ── Managed players ────────────────────────────────────────────────
  const handleAddPlayer = () => {
    setEditingPlayer(null);
    setPlayerFormError(null);
    setShowPlayerForm(true);
  };

  const handleEditPlayer = async (playerId) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, athlete_profile, default_thresholds')
      .eq('id', playerId)
      .single();
    if (!data) return;
    setEditingPlayer(data);
    setPlayerFormError(null);
    setShowPlayerForm(true);
  };

  const handleSavePlayer = async ({ display_name, athlete_profile, default_thresholds }) => {
    setSavingPlayer(true);
    setPlayerFormError(null);
    const result = editingPlayer
      ? await updateManagedPlayer(editingPlayer.id, { display_name, athlete_profile, default_thresholds })
      : await createManagedPlayer(teamId, { display_name, athlete_profile, default_thresholds });
    setSavingPlayer(false);
    if (result?.error) { setPlayerFormError(result.error); return; }
    setShowPlayerForm(false);
    setEditingPlayer(null);
    await fetchMembers();
  };

  const handleAskDeletePlayer = async (m) => {
    const count = await getManagedPlayerSessionCount(m.id);
    setDeletePlayer({ id: m.id, name: m.display_name || 'this player', count });
  };

  const handleConfirmDeletePlayer = async () => {
    if (!deletePlayer) return;
    setDeletingPlayer(true);
    const result = await deleteManagedPlayer(deletePlayer.id);
    setDeletingPlayer(false);
    if (result?.error) { console.error('Delete managed player error:', result.error); return; }
    setDeletePlayer(null);
    await fetchMembers();
  };

  const handleConfirmLink = async () => {
    if (!linkPlayer || !linkTargetId) return;
    setLinking(true);
    setLinkError(null);
    const result = await linkManagedPlayer(linkPlayer.id, linkTargetId, teamId);
    setLinking(false);
    if (result?.error) { setLinkError(result.error); return; }
    setLinkPlayer(null);
    setLinkTargetId('');
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

  const handleDeleteTeam = async () => {
    setDeleting(true);
    const result = await deleteTeam(teamId);
    if (result?.error) {
      console.error('Delete team error:', result.error);
      setDeleting(false);
      setShowDeleteConfirm(false);
    } else {
      navigate('/app/teams');
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn-link back-btn" onClick={() => navigate('/app/teams')}>
            ← Teams
          </button>
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
              {(team.province || team.country) && (
                <span className="team-detail-location">
                  {' · '}{[team.province, team.country].filter(Boolean).join(', ')}
                </span>
              )}
              {isManager && (
                <button
                  className="team-location-edit-btn"
                  onClick={() => setEditingLocation(v => !v)}
                  title="Edit location"
                >
                  {editingLocation ? '✕' : '✎'}
                </button>
              )}
            </div>
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

      {editingLocation && isManager && (
        <div className="team-location-form">
          <select className="filter-select" value={teamCountry} onChange={e => { setTeamCountry(e.target.value); setTeamProvince(''); }}>
            <option value="">Select country…</option>
            {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {selectedCountryDef?.provinces?.length > 0 && (
            <select className="filter-select" value={teamProvince} onChange={e => setTeamProvince(e.target.value)}>
              <option value="">Select province…</option>
              {selectedCountryDef.provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <button className="btn btn-accent btn-sm" onClick={handleSaveLocation} disabled={locationSaving}>
            {locationSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {teamCropFile && (
        <ImageCropModal
          file={teamCropFile}
          onConfirm={handleTeamCropConfirm}
          onCancel={() => setTeamCropFile(null)}
        />
      )}

      <button
        className="team-sessions-btn"
        onClick={() => navigate('/app/sessions', { state: { viewMode: 'team', filterTeam: teamId } })}
      >
        View Team Sessions →
      </button>

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
                {m.is_managed && <span className="manager-badge" style={{ background: 'var(--warn)', color: '#000' }}>Managed</span>}
                {isManager && m.is_managed ? (
                  <div className="team-member-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => handleEditPlayer(m.id)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => { setLinkPlayer(m); setLinkTargetId(''); setLinkError(null); }}>
                      Link
                    </button>
                    <button className="btn btn-sm btn-outline btn-danger" onClick={() => handleAskDeletePlayer(m)}>
                      Delete
                    </button>
                  </div>
                ) : (isManager && m.id !== user?.id && (
                  <div className="team-member-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => handleTransferManager(m.id)}>
                      Make Manager
                    </button>
                    <button className="btn btn-sm btn-outline btn-danger" onClick={() => handleRemoveMember(m.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {isManager && (
          <button className="btn btn-sm btn-accent" onClick={handleAddPlayer} style={{ marginTop: '12px' }}>
            + Add Managed Player
          </button>
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

      {isManager && (
        <div className="team-section">
          <div className="team-privacy-row">
            <div>
              <h4 className="team-privacy-title">Leaderboard Visibility</h4>
              <p className="profile-section-hint" style={{ margin: 0 }}>
                When Private, this team won't appear on public leaderboards.
              </p>
            </div>
            <button
              type="button"
              className={`toggle-btn${team.is_public !== false ? ' active' : ''}`}
              onClick={async () => {
                await updateTeam(teamId, { is_public: !(team.is_public !== false) });
              }}
            >
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-label">{team.is_public !== false ? 'Public' : 'Private'}</span>
            </button>
          </div>
        </div>
      )}

      {isManager && (
        <div className="team-section team-danger-zone">
          <h3 className="team-section-title">Danger Zone</h3>
          {!showDeleteConfirm ? (
            <button className="btn btn-sm btn-outline btn-danger" onClick={() => setShowDeleteConfirm(true)}>
              Delete Team
            </button>
          ) : (
            <div className="delete-confirm-box">
              <p className="delete-confirm-message">
                Are you sure you want to delete <strong>{team.name}</strong>? This will remove all team sessions and members. Individual player sessions will be kept but unlinked.
              </p>
              <div className="delete-confirm-actions">
                <button className="btn btn-sm btn-outline btn-danger" onClick={handleDeleteTeam} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, delete team'}
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showPlayerForm && (
        <ManagedPlayerForm
          initial={editingPlayer}
          saving={savingPlayer}
          error={playerFormError}
          onSave={handleSavePlayer}
          onCancel={() => { if (!savingPlayer) { setShowPlayerForm(false); setEditingPlayer(null); setPlayerFormError(null); } }}
        />
      )}

      {deletePlayer && (
        <div className="upload-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !deletingPlayer) setDeletePlayer(null); }}>
          <div className="upload-modal" style={{ maxWidth: 460 }}>
            <h3 className="team-section-title">Delete Managed Player</h3>
            <p className="delete-confirm-message">
              Permanently delete <strong>{deletePlayer.name}</strong>
              {deletePlayer.count > 0
                ? <> and their <strong>{deletePlayer.count}</strong> session{deletePlayer.count === 1 ? '' : 's'}?</>
                : '?'} This cannot be undone.
            </p>
            <div className="delete-confirm-actions">
              <button className="btn btn-sm btn-outline btn-danger" onClick={handleConfirmDeletePlayer} disabled={deletingPlayer}>
                {deletingPlayer ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button className="btn btn-sm btn-outline" onClick={() => setDeletePlayer(null)} disabled={deletingPlayer}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {linkPlayer && (
        <div className="upload-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !linking) { setLinkPlayer(null); setLinkTargetId(''); } }}>
          <div className="upload-modal" style={{ maxWidth: 460 }}>
            <h3 className="team-section-title">Link to Real Account</h3>
            <p className="profile-section-hint">
              Merge <strong>{linkPlayer.display_name}</strong> into a real team member. All of their sessions move to that account and the managed player is removed. The member must have already joined this team via the invite code.
            </p>
            {(() => {
              const targets = members.filter(m => !m.is_managed && m.is_player && m.id !== linkPlayer.id);
              if (targets.length === 0) {
                return <p className="text-dim">No real team members available yet. Have the player sign up and join with the invite code first.</p>;
              }
              return (
                <select className="filter-select" value={linkTargetId} onChange={e => setLinkTargetId(e.target.value)} style={{ width: '100%', marginTop: 8 }}>
                  <option value="">Select a member…</option>
                  {targets.map(t => <option key={t.id} value={t.id}>{t.display_name || 'Unknown'}</option>)}
                </select>
              );
            })()}
            {linkError && <div className="profile-section-hint" style={{ color: 'var(--error, #e5484d)', marginTop: 8 }}>{linkError}</div>}
            <div className="delete-confirm-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-sm btn-accent" onClick={handleConfirmLink} disabled={linking || !linkTargetId}>
                {linking ? 'Linking…' : 'Link & Merge'}
              </button>
              <button className="btn btn-sm btn-outline" onClick={() => { setLinkPlayer(null); setLinkTargetId(''); }} disabled={linking}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
