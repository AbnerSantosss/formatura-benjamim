'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Clock3,
  Download,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Search,
  Settings,
  Target,
  Wallet,
  RotateCcw,
  ExternalLink,
  Package,
} from 'lucide-react';
import { changeDemoStatus, resetDemo, saveDemoGoal, useDemo, useDemoClock } from '@/lib/demo-store';
import {
  DemoStatus,
  demoTotals,
  effectiveStatus,
  statusLabels,
  modeLabels,
  paymentProduct,
  formatNumber,
} from '@/lib/demo-model';
import { money } from '@/lib/campaign';
import { AdminAccount, AdminLogoutButton } from './admin/admin-shell';
import ProductCatalog from './product-catalog';

export default function Backoffice() {
  const { data, ready } = useDemo();
  const now = useDemoClock();
  const [section, setSection] = useState('overview');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modality, setModality] = useState('all');
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState('');
  if (!ready)
    return (
      <main id="conteudo" className="admin-loading">
        Carregando demonstração…
      </main>
    );
  const totals = demoTotals(data, now);
  const percent = Math.min(100, Math.round((totals.approved / data.goal) * 100));
  const payments = data.payments.filter(
    (payment) =>
      (filter === 'all' || effectiveStatus(payment, now) === filter) &&
      (modality === 'all' || (payment.mode || 'extra') === modality) &&
      `${payment.id} ${paymentProduct(payment).title} ${(payment.numbers || []).map(formatNumber).join(' ')} ${money(payment.amount)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function action(id: string, status: DemoStatus) {
    try {
      changeDemoStatus(id, status);
      setNotice('Simulação atualizada.');
    } catch (issue) {
      setNotice((issue as Error).message);
    }
  }
  function exportCsv() {
    const rows = [
      ['id', 'produto_id', 'produto', 'modalidade', 'numeros', 'valor_brl', 'status_simulado', 'criado_em'],
      ...payments.map((payment) => [
        payment.id,
        paymentProduct(payment).id,
        paymentProduct(payment).title,
        modeLabels[payment.mode || 'extra'],
        (payment.numbers || []).map(formatNumber).join(' | '),
        (payment.amount / 100).toFixed(2),
        statusLabels[effectiveStatus(payment, now)],
        new Date(payment.createdAt).toISOString(),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + rows.map((row) => row.join(';')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pedidos-simulados.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`${payments.length} registro(s) exportado(s).`);
  }
  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      saveDemoGoal(Math.round(Number(new FormData(event.currentTarget).get('goal')) * 100));
      setNotice('Meta da demonstração salva. A campanha pública não foi alterada.');
    } catch (issue) {
      setNotice((issue as Error).message);
    }
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          <GraduationCap /> Benjamim<span>PAINEL DA CAMPANHA</span>
        </Link>
        <div className="sidebar-caption">GERENCIAR</div>
        <nav aria-label="Navegação do backoffice">
          <button onClick={() => setSection('overview')} className={section === 'overview' ? 'active' : ''}>
            <LayoutDashboard size={19} /> Visão geral
          </button>
          <button
            onClick={() => setSection('contributions')}
            className={section === 'contributions' ? 'active' : ''}
          >
            <Heart size={19} /> Pedidos <b>{data.payments.length}</b>
          </button>
          <button onClick={() => setSection('products')} className={section === 'products' ? 'active' : ''}>
            <Package size={19} /> Produtos <b>{data.products.length}</b>
          </button>
          <button onClick={() => setSection('settings')} className={section === 'settings' ? 'active' : ''}>
            <Settings size={19} /> Configurações
          </button>
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            <ExternalLink size={17} /> Ver campanha
          </Link>
          <AdminLogoutButton />
          <small>
            Protótipo frontend
            <br />
            Dados locais e fictícios
          </small>
        </div>
      </aside>
      <main id="conteudo" className="admin-main">
        <header className="admin-topbar">
          <span>
            Formatura do Benjamim <span className="admin-divider">/</span>{' '}
            {section === 'products'
              ? 'Produtos'
              : section === 'settings'
                ? 'Configurações'
                : section === 'contributions'
                  ? 'Pedidos'
                  : 'Visão geral'}
          </span>
          <AdminAccount />
        </header>
        <div className="admin-content">
          <div className="admin-title">
            <div>
              <span className="eyebrow">UM SONHO COMPARTILHADO</span>
              <h1>
                {section === 'products'
                  ? 'Produtos da campanha'
                  : section === 'settings'
                    ? 'Configurações da campanha'
                    : section === 'contributions'
                      ? 'Pedidos e números escolhidos'
                      : 'Olá, família do Benjamim!'}
              </h1>
              <p>
                {section === 'settings'
                  ? 'Ajuste a meta de teste e gerencie os dados deste navegador.'
                  : 'Acompanhe os resultados da sua campanha de demonstração.'}
              </p>
            </div>
            <Link href="/contribuir" className="button button-small">
              Nova simulação
            </Link>
          </div>
          <div className="admin-demo-notice">
            <span className="demo-chip">MODO DEMONSTRAÇÃO</span>
            <p>Valores simulados, salvos só neste navegador. Nenhuma movimentação financeira acontece.</p>
          </div>
          {notice && (
            <p className="admin-notice" role="status">
              {notice}
            </p>
          )}
          {section === 'products' ? (
            <ProductCatalog data={data} now={now} />
          ) : section === 'settings' ? (
            <div className="settings-grid">
              <form onSubmit={saveSettings} className="admin-panel">
                <span className="panel-icon">
                  <Target />
                </span>
                <h2>Meta de arrecadação</h2>
                <p>Usada somente nos indicadores deste backoffice.</p>
                <label>
                  Meta simulada (R$)
                  <input
                    key={data.goal}
                    type="number"
                    name="goal"
                    min="1"
                    max="1000000"
                    step="0.01"
                    defaultValue={data.goal / 100}
                    required
                  />
                </label>
                <button className="button button-small" type="submit">
                  Salvar meta de teste
                </button>
              </form>
              <section className="admin-panel">
                <span className="panel-icon">
                  <RotateCcw />
                </span>
                <h2>Recomeçar a demonstração</h2>
                <p>Apaga os registros de teste e restaura a meta de R$ 2.500 apenas neste navegador.</p>
                {confirmReset ? (
                  <div className="reset-confirm">
                    <p>Limpar todas as simulações locais?</p>
                    <button
                      className="danger-button"
                      onClick={() => {
                        try {
                          resetDemo();
                          setConfirmReset(false);
                          setNotice('Demonstração reiniciada.');
                        } catch (issue) {
                          setNotice((issue as Error).message);
                        }
                      }}
                    >
                      Sim, limpar testes
                    </button>
                    <button className="secondary-button" onClick={() => setConfirmReset(false)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button className="secondary-button" onClick={() => setConfirmReset(true)}>
                    Limpar dados de teste
                  </button>
                )}
              </section>
              <section className="admin-panel integration-panel">
                <h2>Mercado Pago</h2>
                <span className="status-pill pending">Não conectado</span>
                <p>
                  A integração real será implementada na próxima etapa. Nenhuma credencial é solicitada ou
                  armazenada nesta interface.
                </p>
              </section>
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <>
                  <div className="metric-grid">
                    <article>
                      <span className="metric-icon green">
                        <Wallet size={21} />
                      </span>
                      <span>Aprovado na simulação</span>
                      <strong>{money(totals.approved)}</strong>
                      <small>{totals.count} pedido(s) aprovado(s)</small>
                    </article>
                    <article>
                      <span className="metric-icon blue">
                        <Target size={21} />
                      </span>
                      <span>Meta de teste</span>
                      <strong>{money(data.goal)}</strong>
                      <small>{percent}% alcançado na demonstração</small>
                    </article>
                    <article>
                      <span className="metric-icon yellow">
                        <Clock3 size={21} />
                      </span>
                      <span>Pendente na simulação</span>
                      <strong>{money(totals.pending)}</strong>
                      <small>Aguardando aprovação de teste</small>
                    </article>
                    <article>
                      <span className="metric-icon pale">
                        <RotateCcw size={21} />
                      </span>
                      <span>Estornado na simulação</span>
                      <strong>{money(totals.refunded)}</strong>
                      <small>Não entra no total aprovado</small>
                    </article>
                  </div>
                  <section className="admin-progress admin-panel">
                    <div>
                      <span className="eyebrow">DE GESTO EM GESTO</span>
                      <h2>Cada contribuição aproxima esse sonho.</h2>
                      <p>
                        Faltam <b>{money(Math.max(0, data.goal - totals.approved))}</b> para a meta de
                        demonstração.
                      </p>
                    </div>
                    <div className="admin-progress-meter">
                      <strong>{percent}%</strong>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label="Meta simulada"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <span>
                        {money(totals.approved)} de {money(data.goal)}
                      </span>
                    </div>
                  </section>
                </>
              )}
              <section className="admin-panel records-panel">
                <div className="records-heading">
                  <div>
                    <h2>Pedidos simulados</h2>
                    <p>Registro e acompanhamento dos seus testes.</p>
                  </div>
                  <button className="secondary-button" onClick={exportCsv}>
                    <Download size={16} /> Exportar CSV
                  </button>
                </div>
                <div className="records-filters">
                  <label className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Buscar pedido"
                      placeholder="Buscar produto, código, número ou valor…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <label className="filter-field">
                    Status
                    <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                      <option value="all">Todos os status</option>
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="modality-filter">
                    Modalidade
                    <select
                      aria-label="Filtrar modalidade"
                      value={modality}
                      onChange={(event) => setModality(event.target.value)}
                    >
                      <option value="all">Todas</option>
                      <option value="numbers">Números das cestas</option>
                      <option value="extra">Colaboração avulsa</option>
                    </select>
                  </label>
                </div>
                {payments.length ? (
                  <div className="records-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Produto / pedido</th>
                          <th>Data</th>
                          <th>Valor</th>
                          <th>Status de teste</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => {
                          const status = effectiveStatus(payment, now);
                          return (
                            <tr key={payment.id}>
                              <td data-label="Produto">
                                <b>{paymentProduct(payment).title}</b>
                                <small>
                                  {modeLabels[payment.mode || 'extra']} · {payment.id.slice(0, 13)}
                                </small>
                                {!!payment.numbers?.length && (
                                  <details className="product-order-numbers">
                                    <summary>{payment.numbers.length} números — ver todos</summary>
                                    <p>{payment.numbers.map(formatNumber).join(' · ')}</p>
                                  </details>
                                )}
                              </td>
                              <td data-label="Data">
                                {new Date(payment.createdAt).toLocaleDateString('pt-BR', {
                                  timeZone: 'America/Fortaleza',
                                })}
                                <small>
                                  {new Date(payment.createdAt).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: 'America/Fortaleza',
                                  })}
                                </small>
                              </td>
                              <td data-label="Valor">
                                <strong>{money(payment.amount)}</strong>
                              </td>
                              <td data-label="Status">
                                <span className={`status-pill ${status}`}>{statusLabels[status]}</span>
                              </td>
                              <td data-label="Ações">
                                <div className="record-actions">
                                  <Link
                                    href={`/pagamento?id=${payment.id}`}
                                    aria-label={`Abrir ${payment.id.slice(0, 13)}`}
                                  >
                                    <ExternalLink size={16} />
                                  </Link>
                                  {status === 'pending' && (
                                    <button onClick={() => action(payment.id, 'approved')}>
                                      <Check size={15} /> Aprovar teste
                                    </button>
                                  )}
                                  {status === 'approved' && (
                                    <button onClick={() => action(payment.id, 'refunded')}>
                                      <RotateCcw size={15} /> Estornar teste
                                    </button>
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
                    <h3>
                      {data.payments.length
                        ? 'Nenhum resultado encontrado'
                        : 'Sua primeira simulação começa aqui.'}
                    </h3>
                    <p>
                      {data.payments.length
                        ? 'Experimente outro código, valor ou status.'
                        : 'Faça um pagamento de teste no checkout para ver o registro aparecer no painel.'}
                    </p>
                    {!data.payments.length && (
                      <Link href="/contribuir" className="secondary-button">
                        Testar uma contribuição
                      </Link>
                    )}
                  </div>
                )}
                <div className="records-footer">
                  {payments.length} registro(s) · Dados fictícios, sem informações pessoais
                </div>
              </section>
            </>
          )}
          <footer className="admin-footer">
            <Heart size={14} /> Feito com carinho para a formatura do Benjamim.
            <span>Frontend de demonstração</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
