export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Mail-list timestamp the way Outlook/Apple Mail show it: the clock time for
 * today's mail, an absolute numeric date otherwise (D/M this year, D/M/YY for
 * older). Locale-neutral on purpose — no language, so it's stable across the
 * bilingual UI and in tests. Used by the conversation row instead of the
 * relative "2h ago", which reads worse in a dense scannable list.
 */
export function mailTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const m = d.getMinutes();
    return `${d.getHours()}:${m < 10 ? `0${m}` : m}`;
  }
  const day = d.getDate();
  const month = d.getMonth() + 1;
  if (d.getFullYear() === now.getFullYear()) return `${day}/${month}`;
  return `${day}/${month}/${String(d.getFullYear()).slice(2)}`;
}
