import { useCallback, useEffect, useRef, useState } from 'react';

/** 데이터를 불러오고, intervalMs마다 다시 불러옵니다 (탭이 숨겨져 있을 때는 쉼). */
export function usePolling(loader, intervalMs = 5000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      setData(await loaderRef.current());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!intervalMs) return undefined;
    const timer = setInterval(() => { if (!document.hidden) reload(); }, intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, intervalMs, ...deps]);

  return { data, error, loading, reload };
}

/** 1초마다 갱신되는 현재 시각 (경과 시간 표시용) */
export function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}
