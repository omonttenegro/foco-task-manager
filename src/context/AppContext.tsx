import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState } from '../../shared/types';
import { api, body } from '../lib/api';

type Toast = { message: string; kind: 'success' | 'error' } | null;
type MutationOptions = { silent?: boolean };
type ContextValue = {
  state: AppState | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  toast: Toast;
  refresh: () => Promise<void>;
  mutate: <T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', payload?: unknown, options?: MutationOptions) => Promise<T | null>;
  notify: (message: string, kind?: 'success' | 'error') => void;
};

const AppContext = createContext<ContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const inFlightMutations = useRef(new Map<string, Promise<unknown>>());

  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4200);
  }, []);

  const refresh = useCallback(async () => {
    try { setState(await api<AppState>('/api/state')); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(<T,>(url: string, method: 'POST' | 'PATCH' | 'DELETE', payload?: unknown, options: MutationOptions = {}): Promise<T | null> => {
    const mutationKey = JSON.stringify([method, url, payload ?? null]);
    const currentMutation = inFlightMutations.current.get(mutationKey);
    if (currentMutation) return currentMutation as Promise<T | null>;

    setBusy(true);
    const mutation = (async () => {
      try {
        const result = await api<T>(url, { method, body: payload === undefined ? undefined : body(payload) });
        await refresh();
        if (!options.silent) notify('Alterações guardadas.');
        return result;
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Não foi possível guardar.', 'error');
        return null;
      } finally {
        inFlightMutations.current.delete(mutationKey);
        setBusy(inFlightMutations.current.size > 0);
      }
    })();

    inFlightMutations.current.set(mutationKey, mutation);
    return mutation;
  }, [notify, refresh]);

  const value = useMemo(() => ({ state, loading, busy, error, toast, refresh, mutate, notify }), [state, loading, busy, error, toast, refresh, mutate, notify]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve ser utilizado dentro de AppProvider.');
  return context;
}
