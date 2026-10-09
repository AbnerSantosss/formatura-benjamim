'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@/domain/types';
import { fetchOrderStatus } from '@/lib/api-client';

const POLL_MS = 5000;

type Props = {
  orderId: string;
  token: string;
  /** Consulta só enquanto o pedido está pendente no servidor. */
  active: boolean;
  /** Mudar este valor força uma consulta imediata (ex.: depois da aprovação simulada no demo). */
  refreshKey?: number;
  /** Recebe o status que o servidor devolveu. Precisa ser estável (ex.: o setter de um `useState`). */
  onStatus: (status: OrderStatus) => void;
};

/**
 * Consulta o status do pedido no servidor a cada 5 s. Não tem interface própria e nunca muda o
 * status: só lê. Aprovado leva à página de obrigado; os demais status vão para `onStatus`.
 * Com a aba oculta não consulta; ao voltar, consulta na hora.
 */
export default function PaymentStatusPoller({ orderId, token, active, refreshKey = 0, onStatus }: Props) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const { status } = await fetchOrderStatus(orderId, token, controller.signal);
        if (controller.signal.aborted) return;
        onStatus(status);
        if (status === 'APPROVED') {
          router.replace(`/obrigado/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}`);
        }
      } catch {
        // Falha de rede ou limite de requisições: a próxima volta tenta de novo.
      } finally {
        busy = false;
      }
    }
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    if (refreshKey > 0) void check();
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [orderId, token, active, refreshKey, onStatus, router]);
  return null;
}
