'use client';
import { useState, useSyncExternalStore } from 'react';
import { Gift } from 'lucide-react';
import { formatNumber } from '@/domain/orders';
import {
  annulDraw,
  errorMessage,
  fetchDraw,
  formatLongDate,
  performDraw,
  type DrawState,
} from '@/lib/admin-client';
import { useAdmin } from './admin-shell';
import ConfirmDialog from './confirm-dialog';
import { useAdminData } from './use-admin-data';

// Relógio de segundos compartilhado: no servidor (e na hidratação) vale 0, sem contagem.
function subscribe(callback: () => void) {
  const timer = setInterval(callback, 1000);
  return () => clearInterval(timer);
}
const clientSecond = () => Math.floor(Date.now() / 1000);
const serverSecond = () => 0;

const REFRESH_MS = 30_000;
/** O mesmo mínimo exigido pelo servidor para o motivo da anulação. */
const REASON_MIN = 10;
const REASON_MAX = 500;

const two = (value: number) => String(value).padStart(2, '0');

function countdown(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const dayText = days > 0 ? `${days} dia${days === 1 ? '' : 's'}, ` : '';
  return `${dayText}${two(hours)} h ${two(minutes)} min ${two(seconds % 60)} s`;
}

/** `85999990000` → `(85) 99999-0000`. */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return phone;
  const local = digits.slice(2);
  return `(${digits.slice(0, 2)}) ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
}

const numbersText = (count: number) => `${count} ${count === 1 ? 'número' : 'números'}`;

/**
 * Card "Sorteio" da visão geral: data configurada (horário de Fortaleza), contagem regressiva,
 * números participantes, botão "Gerar ganhador" e, depois do sorteio, o resultado com os dados de
 * contato do ganhador. Remonta quando a data muda em Configurações, para reler o estado no servidor.
 */
export default function DrawCard({ drawAt }: { drawAt: string | null }) {
  return <DrawCardBody key={drawAt ?? ''} drawAt={drawAt} />;
}

function DrawCardBody({ drawAt }: { drawAt: string | null }) {
  const me = useAdmin();
  const isOwner = me.role === 'OWNER';
  const { data: state, error, reload, setData } = useAdminData<DrawState>(fetchDraw, REFRESH_MS);
  const nowSecond = useSyncExternalStore(subscribe, clientSecond, serverSecond);

  const [forceChecked, setForceChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState('');
  const [annulling, setAnnulling] = useState(false);
  const [annulPending, setAnnulPending] = useState(false);
  const [annulError, setAnnulError] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');

  const remaining =
    drawAt && nowSecond > 0 ? Math.floor(new Date(drawAt).getTime() / 1000) - nowSecond : null;
  const current = state?.current ?? null;
  const eligibleCount = state?.eligibleCount ?? 0;
  // Quem decide é o servidor; o relógio daqui só habilita o botão sem esperar a próxima recarga.
  const due = Boolean(state?.canDraw) || (remaining !== null && remaining <= 0);
  const force = !due && isOwner && forceChecked;
  const availableHint = drawAt
    ? `Disponível em ${formatLongDate(drawAt)}`
    : 'Disponível depois de definir a data do sorteio em Configurações';
  const disabledReason = !state
    ? 'Carregando…'
    : eligibleCount === 0
      ? 'Ainda não há números confirmados para sortear'
      : !due && !force
        ? availableHint
        : '';
  const reasonLength = reason.trim().length;

  function openConfirm() {
    setDrawError('');
    setNotice('');
    setWarning('');
    setConfirming(true);
  }

  async function confirmDraw() {
    setDrawing(true);
    setDrawError('');
    try {
      const result = await performDraw(force);
      setData(() => result.state);
      setConfirming(false);
      setForceChecked(false);
      if (result.emails.winnerSent) {
        setNotice('Sorteio realizado. O ganhador foi avisado por e-mail.');
      } else {
        setWarning(
          'Sorteio realizado, mas o e-mail para o ganhador não saiu. Avise pelo WhatsApp ou pelo e-mail abaixo.',
        );
      }
    } catch (issue) {
      setDrawError(errorMessage(issue));
      reload();
    } finally {
      setDrawing(false);
    }
  }

  function openAnnul() {
    setAnnulError('');
    setReason('');
    setNotice('');
    setWarning('');
    setAnnulling(true);
  }

  async function confirmAnnul() {
    setAnnulPending(true);
    setAnnulError('');
    try {
      const next = await annulDraw(reason.trim());
      setData(() => next);
      setAnnulling(false);
      setNotice('Sorteio anulado. O registro continua guardado, com o motivo informado.');
    } catch (issue) {
      setAnnulError(errorMessage(issue));
      reload();
    } finally {
      setAnnulPending(false);
    }
  }

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
            {current
              ? 'Horário de Fortaleza.'
              : remaining === null
                ? 'Horário de Fortaleza.'
                : remaining > 0
                  ? `Faltam ${countdown(remaining)} · horário de Fortaleza`
                  : 'A data configurada já chegou.'}
          </p>
        </>
      ) : (
        <>
          <p className="admin-draw-date">Data ainda não definida</p>
          <p>Defina a data e a hora do sorteio em Configurações.</p>
        </>
      )}

      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {warning && (
        <p className="form-error" role="alert">
          {warning}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="admin-link-button" onClick={reload}>
            Tentar de novo
          </button>
        </p>
      )}

      {!state ? (
        !error && <p className="admin-loading-inline">Carregando sorteio…</p>
      ) : current ? (
        <>
          <p className="admin-draw-winner">
            Número sorteado: <b>{formatNumber(current.winnerNumber)}</b>
          </p>
          <dl className="admin-kv admin-draw-result">
            <div>
              <dt>Ganhador</dt>
              <dd>{current.winner?.name ?? 'Pedido não encontrado'}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{current.winner?.email ?? '—'}</dd>
            </div>
            <div>
              <dt>WhatsApp</dt>
              <dd>{current.winner ? formatPhone(current.winner.phone) : '—'}</dd>
            </div>
            <div>
              <dt>Números participantes</dt>
              <dd>{current.eligibleCount}</dd>
            </div>
            <div>
              <dt>Sorteado em</dt>
              <dd>
                {formatLongDate(current.performedAt)}
                {current.forced ? ' (antes da data configurada)' : ''}
              </dd>
            </div>
            <div>
              <dt>Realizado por</dt>
              <dd>{current.performedBy ?? '—'}</dd>
            </div>
            <div>
              <dt>Hash da lista de participantes</dt>
              <dd className="admin-draw-hash">{current.participantsHash}</dd>
            </div>
          </dl>
          {isOwner ? (
            <div className="admin-draw-actions">
              <button type="button" className="danger-button" onClick={openAnnul}>
                Anular sorteio
              </button>
            </div>
          ) : (
            <p className="admin-field-hint">Só o proprietário pode anular o sorteio.</p>
          )}
        </>
      ) : (
        <>
          <dl className="admin-kv admin-draw-result">
            <div>
              <dt>Números participantes</dt>
              <dd>{eligibleCount}</dd>
            </div>
          </dl>
          <p>Participam os números de pedidos com pagamento aprovado. Cada número tem a mesma chance.</p>
          {!due && isOwner && (
            <label className="admin-check">
              <input
                type="checkbox"
                checked={forceChecked}
                onChange={(event) => setForceChecked(event.target.checked)}
              />
              Sei que ainda não é a data e quero sortear agora
            </label>
          )}
          <div className="admin-draw-actions">
            <span title={disabledReason || undefined}>
              <button
                type="button"
                className="button button-small"
                onClick={openConfirm}
                disabled={disabledReason !== ''}
              >
                Gerar ganhador
              </button>
            </span>
          </div>
          {disabledReason && <p className="admin-field-hint">{disabledReason}.</p>}
          {!due && !isOwner && (
            <p className="admin-field-hint">Antes da data, só o proprietário pode sortear.</p>
          )}
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="Gerar ganhador?"
          confirmLabel="Sim, sortear"
          pendingLabel="Sorteando…"
          pending={drawing}
          error={drawError}
          onConfirm={confirmDraw}
          onCancel={() => setConfirming(false)}
        >
          <p>
            Esta ação sorteia o ganhador entre {numbersText(eligibleCount)} e não pode ser desfeita sem
            anulação registrada. Continuar?
          </p>
          {force && (
            <p>A data configurada ainda não chegou: o sorteio fica registrado como feito antes da data.</p>
          )}
        </ConfirmDialog>
      )}

      {annulling && current && (
        <ConfirmDialog
          title="Anular este sorteio?"
          confirmLabel="Sim, anular"
          pendingLabel="Anulando…"
          danger
          pending={annulPending}
          confirmDisabled={reasonLength < REASON_MIN}
          error={annulError}
          onConfirm={confirmAnnul}
          onCancel={() => setAnnulling(false)}
        >
          <p>
            O número <b>{formatNumber(current.winnerNumber)}</b> deixa de ser o ganhador e um novo sorteio
            pode ser feito. O registro anulado continua guardado. O ganhador já avisado por e-mail não recebe
            aviso automático da anulação.
          </p>
          <label className="admin-field">
            Motivo da anulação
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={REASON_MAX}
              required
            />
            <span className="admin-field-hint">Obrigatório, com pelo menos {REASON_MIN} caracteres.</span>
          </label>
        </ConfirmDialog>
      )}
    </section>
  );
}
