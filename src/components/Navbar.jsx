import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { BrandSmall } from './Brand';
import { useAuth } from '../contexts/AuthContext';
import { useSession } from '../contexts/SessionContext';
import { SPORTS } from '../utils/constants';

export default function Navbar() {
  const { profile, signOut } = useAuth();
  const { activeSport, setActiveSport } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionsDashboard = location.pathname === '/app/dashboard' && location.state?.from === 'sessions';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const avatarUrl = profile?.avatar_url || null;
  const initial = (profile?.display_name || 'U').charAt(0).toUpperCase();

  return (
    <nav className="navbar">
      <NavLink to="/app/sessions" className="navbar-brand">
        <BrandSmall />
      </NavLink>

      <div className="navbar-links">
        <NavLink to="/app/leaderboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Leaderboard
        </NavLink>
        <NavLink to="/app/sessions" className={({ isActive }) => `nav-link ${isActive || sessionsDashboard ? 'active' : ''}`}>
          Sessions
        </NavLink>
        <NavLink to="/app/teams" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Teams
        </NavLink>
        {profile?.role === 'admin' && (
          <NavLink to="/app/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Admin
          </NavLink>
        )}
      </div>

      <select
        className="navbar-sport-select"
        value={activeSport}
        onChange={(e) => setActiveSport(e.target.value)}
      >
        <option value="all">All Sports</option>
        {(() => {
          const mySports = profile?.athlete_profile?.mySports;
          const list = mySports?.length > 0
            ? SPORTS.filter(s => mySports.includes(s.value))
            : SPORTS;
          return list.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ));
        })()}
      </select>

      <div className="navbar-user">
        <NavLink to="/app/profile" className="navbar-profile-link">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="navbar-avatar" />
          ) : (
            <div className="navbar-avatar-placeholder">{initial}</div>
          )}
          <span className="navbar-displayname">{profile?.display_name || 'User'}</span>
          {profile?.role === 'admin' && <span className="navbar-role-badge">admin</span>}
        </NavLink>
        <button className="btn btn-sm btn-outline" onClick={handleSignOut}>Sign Out</button>
      </div>
    </nav>
  );
}
