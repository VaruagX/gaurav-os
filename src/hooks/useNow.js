import { useEffect, useState } from 'react';

/** Re-renders every `ms` (default 30s) with the current Date. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}
