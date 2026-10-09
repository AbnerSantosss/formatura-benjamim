'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Download, ExternalLink, Heart, Mail, RotateCcw, Search } from 'lucide-react';
import { formatNumber } from '@/domain/orders';
import {
  approveDemoOrder,
  errorMessage,
  exportCsvUrl,
  fetchOrders,
  formatDate,
  formatTime,
  modeLabels,
  refundOrder,
  resendOrderEmail,
  statusLabels,
  type Order,
  type OrderMode,
  type OrderStatus,
} from '@/lib/admin-client';
import { money } from '@/lib/campaign';
import ConfirmDialog from './confirm-dialog';
import { useAdminData } from './use-admin-data';

const SEARCH_DEBOUNCE_MS = 300;

/** Classe de cor do selo de status (as cores existentes; cancelado usa a de expirado). */
const statusClass: Record<OrderStatus, string> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
  CANCELED: 'expired',
};

const shortId = (id: string) => id.slice(0, 13);

type Props = {
  /** Modo demonstração: mostra "Aprovar (demo)" nos pedidos pendentes do gateway de teste. */
  isDemo: boolean;
  /** Chamado depois de uma ação que muda totais (aprovar, estornar). */
  onChanged: () => void;
};

export default function OrdersTable({ isDemo, onChanged }: Props) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [mode, setMode] = useState<OrderMode | ''>('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [refundPending, setRefundPending] = useState(false);
  const [refundError, setRefundError] = useState('');

  // Busca com espera de 300 ms: a consulta só sai quando a digitação para.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    (signal: AbortSignal) => fetchOrders({ q, status, mode, page }, signal),
    [q, status, mode, page],
  );
  const { data, error, loading, reload } = useAdminData(load);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Boolean(q || status || mode);

  function afterChange(message: string) {
    setNotice(message);
    reload();
    onChanged();
  }

  async function approveDemo(order: Order) {
    setBusyId(order.id);
    setActionError('');
    setNotice('');
    try {
      await approveDemoOrder(order.id);
      afterChange(`Pedido ${shortId(order.id)} aprovado (demo).`);
    } catch (issue) {
      setActionError(errorMessage(issue));
    } finally {
      setBusyId('');
    }
  }

  async function resendEmail(order: Order) {
    setBusyId(order.id);
    setActionError('');
    setNotice('');
    try {
      const { emailSent } = await resendOrderEmail(order.id);
      if (emailSent) setNotice(`E-mail de confirmação reenviado para ${order.contributor.name}.`);
      else setActionError('O e-mail não pôde ser enviado agora. Tente de novo em instantes.');
    } catch (issue) {
      setActionError(errorMessage(issue));
    } finally {
      setBusyId('');
    }
  }

  async function confirmRefund() {
    if (!refunding) return;
    setRefundPending(true);
    setRefundError('');
    try {
      await refundOrder(refunding.id);
      setRefunding(null);
      setActionError('');
      afterChange(`Pedido ${shortId(refunding.id)} estornado.`);
    } catch (issue) {
      setRefundError(errorMessage(issue));
    } finally {
      setRefundPending(false);
    }
  }

  function openRefund(order: Order) {
    setRefundError('');
    setNotice('');
    setActionError('');
    setRefunding(order);
  }

  return (
    <section className="admin-panel records-panel">
      <div className="records-heading">
        <div>
          <h2>Pedidos</h2>
          <p>Registro e acompanhamento das contribuições.</p>
        </div>
        <a className="secondary-button" href={exportCsvUrl({ q, status, mode })} download="pedidos.csv">
          <Download size={16} /> Exportar CSV
        </a>
      </div>
      <div className="records-filters">
        <label className="search-field">
          <Search size={18} />
          <input
            type="search"
            aria-label="Buscar pedido"
            placeholder="Buscar nome, e-mail, final do CPF, código, número ou valor…"
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="filter-field">
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as OrderStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            {(Object.keys(statusLabels) as OrderStatus[]).map((key) => (
              <option key={key} value={key}>
                {statusLabels[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="modality-filter">
          Modalidade
          <select
            aria-label="Filtrar modalidade"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as OrderMode | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(modeLabels) as OrderMode[]).map((key) => (
              <option key={key} value={key}>
                {modeLabels[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {notice && (
        <p className="admin-notice admin-records-message" role="status">
          {notice}
        </p>
      )}
      {(actionError || error) && (
        <p className="form-error admin-records-message" role="alert">
          {actionError || error}{' '}
          {!actionError && (
            <button type="button" className="admin-link-button" onClick={reload}>
              Tentar de novo
            </button>
          )}
        </p>
      )}
      {!data ? (
        !error && <p className="admin-loading-inline">Carregando pedidos…</p>
      ) : items.length ? (
        <div className={`records-table${loading ? ' admin-busy' : ''}`} aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>Produto / pedido</th>
                <th>Contribuinte</th>
                <th>Data</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((order) => {
                const busy = busyId === order.id;
                return (
                  <tr key={order.id}>
                    <td data-label="Produto">
                      <b>{order.product.title}</b>
                      <small>
                        {modeLabels[order.mode]} · {shortId(order.id)}
                      </small>
                      {order.numbers.length > 0 && (
                        <details className="product-order-numbers">
                          <summary>
                            {order.numbers.length} números{order.numbersReleased ? ' (liberados)' : ''} — ver
                            todos
                          </summary>
                          <p>{order.numbers.map(formatNumber).join(' · ')}</p>
                        </details>
                      )}
                    </td>
                    <td data-label="Contribuinte">
                      <b>{order.contributor.name}</b>
                      <small>{order.contributor.email}</small>
                      <small>CPF {order.contributor.cpfMasked}</small>
                    </td>
                    <td data-label="Data">
                      {formatDate(order.createdAt)}
                      <small>{formatTime(order.createdAt)}</small>
                    </td>
                    <td data-label="Valor">
                      <strong>{money(order.amountCents)}</strong>
                    </td>
                    <td data-label="Status">
                      <span className={`status-pill ${statusClass[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td data-label="Ações">
                      <div className="record-actions admin-record-actions">
                        <a
                          href={`/pagamento/${encodeURIComponent(order.id)}?t=${encodeURIComponent(order.publicToken)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir pedido ${shortId(order.id)} em nova aba`}
                        >
                          <ExternalLink size={16} /> Abrir
                        </a>
                        {isDemo && order.status === 'PENDING' && order.gateway === 'DEMO' && (
                          <button type="button" onClick={() => approveDemo(order)} disabled={busy}>
                            <Check size={15} /> Aprovar (demo)
                          </button>
                        )}
                        {order.status === 'APPROVED' && (
                          <>
                            <button type="button" onClick={() => openRefund(order)} disabled={busy}>
                              <RotateCcw size={15} /> Estornar
                            </button>
                            <button type="button" onClick={() => resendEmail(order)} disabled={busy}>
                              <Mail size={15} /> Reenviar e-mail
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="records-empty">
          <Heart size={34} />
          <h3>{filtered ? 'Nenhum resultado encontrado' : 'Ainda não há pedidos.'}</h3>
          <p>
            {filtered
              ? 'Experimente outro nome, código, valor ou status.'
              : 'Quando alguém contribuir, o pedido aparece aqui.'}
          </p>
        </div>
      )}
      <div className="records-footer admin-pagination">
        <span>
          {total} registro(s) · página {Math.min(page, pages)} de {pages}
        </span>
        <span className="admin-pagination-buttons">
          <button
            type="button"
            className="secondary-button admin-page-button"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1 || loading}
          >
            Anterior
          </button>
          <button
            type="button"
            className="secondary-button admin-page-button"
            onClick={() => setPage(page + 1)}
            disabled={page >= pages || loading}
          >
            Próxima
          </button>
        </span>
      </div>
      {refunding && (
        <ConfirmDialog
          title="Estornar este pedido?"
          confirmLabel="Sim, estornar"
          pendingLabel="Estornando…"
          danger
          pending={refundPending}
          error={refundError}
          onConfirm={confirmRefund}
          onCancel={() => setRefunding(null)}
        >
          <p>
            Pedido <b>{shortId(refunding.id)}</b> de <b>{refunding.contributor.name}</b>, no valor de{' '}
            <b>{money(refunding.amountCents)}</b>.
          </p>
          <p>
            O valor é devolvido pelo meio de pagamento
            {refunding.numbers.length > 0
              ? ` e os ${refunding.numbers.length} números do pedido voltam a ficar disponíveis`
              : ''}
            . Esta ação não pode ser desfeita.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
