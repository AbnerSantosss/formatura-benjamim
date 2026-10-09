'use client';
import { useSyncExternalStore } from 'react';
import { Gift } from 'lucide-react';
import { formatLongDate } from '@/lib/admin-client';

// Relógio de segundos compartilhado: no servidor (e na hidratação) vale 0, sem contagem.
function subscribe(callback: () => void) {
  const timer = setInterval(callback, 1000);
  return () => clearInterval(timer);
}
const clientSecond = () => Math.floor(Date.now() / 1000);
const serverSecond = () => 0;

const two = (value: number) => String(value).padStart(2, '0');

function countdown(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const dayText = days > 0 ? `${days} dia${days === 1 ? '' : 's'}, ` : '';
  return `${dayText}${two(hours)} h ${two(minutes)} min ${two(seconds % 60)} s`;
}

/**
 * Card "Sorteio" da visão geral. PLACEHOLDER: só mostra a data configurada (horário de Fortaleza)
 * e a contagem regressiva. A T20 substitui pelo card real, com o botão "Gerar ganhador".
 */
export default function DrawCard({ drawAt }: { drawAt: string | null }) {
  const nowSecond = useSyncExternalStore(subscribe, clientSecond, serverSecond);
  const remaining =
    drawAt && nowSecond > 0 ? Math.floor(new Date(drawAt).getTime() / 1000) - nowSecond : null;

  return (
    <section className="admin-panel admin-draw">
      <span className="panel-icon">
        <Gift />
      </span>
      <h2>Sorteio</h2>
      {drawAt ? (
        <>
          <p className="admin-draw-date">{formatLongDate(drawAt)}</p>
          <p className="admin-draw-countdown" aria-live="off">
            {remaining === null
              ? 'Horário de Fortaleza.'
              : remaining > 0
                ? `Faltam ${countdown(remaining)} · horário de Fortaleza`
                : 'A data configurada já chegou.'}
          </p>
        </>
      ) : (
        <p className="admin-draw-date">Data ainda não definida</p>
      )}
      <p>Sorteio disponível na data configurada.</p>
      {!drawAt && <p>Defina a data e a hora do sorteio em Configurações.</p>}
    </section>
  );
}
