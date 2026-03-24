import { useState } from 'react';

export default function TeamSessionTag({ teamName, sessionName, onUnlink, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      className={`team-session-tag${onUnlink ? ' team-session-tag-unlinkable' : ''}${hovered && onUnlink ? ' team-session-tag-hovered' : ''}${onClick ? ' team-session-tag-clickable' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="team-session-tag-team">{teamName}</span>
      <span className="team-session-tag-name">{sessionName}</span>
      {onUnlink && (
        <button
          className="team-session-tag-unlink"
          onClick={(e) => { e.stopPropagation(); onUnlink(); }}
          title="Unlink from team session"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </span>
  );
}
