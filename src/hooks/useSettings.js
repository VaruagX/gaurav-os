import { useCallback, useEffect, useState } from 'react';
import { settingsRepository, DEFAULTS } from '../database/repositories';
import { subscribe } from '../database/db';

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const load = useCallback(() => settingsRepository.getAll().then(setSettings).catch(() => {}), []);
  useEffect(() => { load(); return subscribe(load); }, [load]);
  return settings;
}
