export function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + 'm ' + s + 's';
}

export function formatBytes(n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

export function formatBLEFilename(filename) {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return filename;
  const utcDate = new Date(Date.UTC(
    parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
    parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)
  ));
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayMidnight = new Date(todayMidnight - 86400000);
  const localFileMidnight = new Date(utcDate.getFullYear(), utcDate.getMonth(), utcDate.getDate());
  const timeStr = utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const t = localFileMidnight.getTime();
  if (t === todayMidnight.getTime()) return 'Today at ' + timeStr;
  if (t === yesterdayMidnight.getTime()) return 'Yesterday at ' + timeStr;
  const sameYear = utcDate.getFullYear() === now.getFullYear();
  const dateStr = utcDate.toLocaleDateString([], sameYear
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
  return dateStr + ' at ' + timeStr;
}
