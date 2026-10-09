'use client';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage, isAbort } from '@/lib/admin-client';

type State<T> = { load: unknown; tick: number; data: T | null; error: string };

export type AdminData<T> = {
  /** Último dado recebido; continua na tela enquanto uma nova carga está em andamento. */
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
  /** Troca o dado local depois de uma ação que já devolveu o valor novo. */
  setData: (update: (current: T) => T) => void;
};

/**
 * Carrega dados do painel com estados `loading / error / data`. Recarrega quando `load` muda
 * (passe uma função estável, com `useCallback`), quando `reload()` é chamado e, se `refreshMs`
 * for informado, a cada intervalo enquanto a aba estiver visível.
 */
export function useAdminData<T>(load: (signal: AbortSignal) => Promise<T>, refreshMs = 0): AdminData<T> {
  const [state, setState] = useState<State<T>>({ load: null, tick: -1, data: null, error: '' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const run = () =>
      load(controller.signal).then(
        (data) => {
          if (!controller.signal.aborted) setState({ load, tick, data, error: '' });
        },
        (error: unknown) => {
          if (controller.signal.aborted || isAbort(error)) return;
          setState((previous) => ({ load, tick, data: previous.data, error: errorMessage(error) }));
        },
      );
    void run();
    const timer =
      refreshMs > 0
        ? setInterval(() => {
            if (document.visibilityState === 'visible') void run();
          }, refreshMs)
        : undefined;
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [load, tick, refreshMs]);

  const loading = state.load !== load || state.tick !== tick;
  const reload = useCallback(() => setTick((value) => value + 1), []);
  const setData = useCallback(
    (update: (current: T) => T) =>
      setState((previous) =>
        previous.data === null ? previous : { ...previous, data: update(previous.data) },
      ),
    [],
  );

  return { data: state.data, error: loading ? '' : state.error, loading, reload, setData };
}
