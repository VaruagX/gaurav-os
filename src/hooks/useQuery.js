import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { subscribe } from '../database/db';

/**
 * Run an async loader, re-run on screen focus and whenever any database write happens.
 * Returns {data, loading, error, reload}. `data` stays at the last good value during reloads.
 */
export function useQuery(loader, deps = [], initial = null) {
  const [state, setState] = useState({ data: initial, loading: true, error: null });
  const alive = useRef(true);
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const data = await loaderRef.current();
      if (alive.current && my === seq.current) setState({ data, loading: false, error: null });
    } catch (e) {
      if (alive.current && my === seq.current) setState((s) => ({ ...s, loading: false, error: e }));
    }
  }, []);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribe(() => { reload(); }), [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { ...state, reload };
}
