export default function TeamSessionTag({ teamName, sessionName }) {
  return (
    <span className="team-session-tag">
      <span className="team-session-tag-team">{teamName}</span>
      <span className="team-session-tag-name">{sessionName}</span>
    </span>
  );
}
