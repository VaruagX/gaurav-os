/** "today" / "yesterday" / "3 days ago" for a past instant (epoch ms). */
export const timeAgo = (ms, now = Date.now()) => {
  const d = Math.floor((now - ms) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
};
