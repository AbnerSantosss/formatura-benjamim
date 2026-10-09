'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Clock3,
  ExternalLink,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Package,
  RotateCcw,
  Settings,
  Target,
  Users,
  Wallet,
} from 'lucide-react';
import { fetchMetrics, fetchProducts } from '@/lib/admin-client';
import { money } from '@/lib/campaign';
import { AdminAccount, AdminLogoutButton } from './admin/admin-shell';
import DrawCard from './admin/draw-card';
import OrdersTable from './admin/orders-table';
import ProductsPanel from './admin/products-panel';
import SettingsPanel from './admin/settings-panel';
import { useAdminData } from './admin/use-admin-data';
import UsersPanel from './admin/users-panel';

type Section = 'overview' | 'contributions' | 'products' | 'users' | 'settings';

const METRICS_REFRESH_MS = 30_000;

const sectionNames: Record<Section, string> = {
  overview: 'Visão geral',
  contributions: 'Pedidos',
  products: 'Produtos',
  users: 'Usuários',
  settings: 'Configurações',
};

const sectionTitles: Record<Section, string> = {
  overview: 'Olá, família do Benjamim!',
  contributions: 'Pedidos e números escolhidos',
  products: 'Produtos da campanha',
  users: 'Usuários do painel',
  settings: 'Configurações da campanha',
};

const sectionIntros: Record<Section, string> = {
  overview: 'Acompanhe os resultados da campanha.',
  contributions: 'Busque, filtre e acompanhe cada contribuição.',
  products: 'Edite os textos e a situação de cada produto.',
  users: 'Convide quem ajuda a cuidar da campanha.',
  settings: 'Ajuste a meta, o sorteio e os textos da página pública.',
};

/** `isDemo` vem do servidor (`src/server/env.ts`): só em demonstração aparece "Aprovar (demo)". */
export default function Backoffice({ isDemo }: { isDemo: boolean }) {
  const [section, setSection] = useState<Section>('overview');
  const metrics = useAdminData(fetchMetrics, METRICS_REFRESH_MS);
  const products = useAdminData(fetchProducts);

  const data = metrics.data;
  const percent =
    data && data.goalCents > 0 ? Math.min(100, Math.round((data.raisedCents / data.goalCents) * 100)) : 0;

  function refreshTotals() {
    metrics.reload();
    products.reload();
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          <GraduationCap /> Benjamim<span>PAINEL DA CAMPANHA</span>
        </Link>
        <div className="sidebar-caption">GERENCIAR</div>
        <nav aria-label="Navegação do backoffice" className="admin-nav-wrap">
          <button
            type="button"
            onClick={() => setSection('overview')}
            className={section === 'overview' ? 'active' : ''}
          >
            <LayoutDashboard size={19} /> Visão geral
          </button>
          <button
            type="button"
            onClick={() => setSection('contributions')}
            className={section === 'contributions' ? 'active' : ''}
          >
            <Heart size={19} /> Pedidos {data && <b>{data.ordersTotal}</b>}
          </button>
          <button
            type="button"
            onClick={() => setSection('products')}
            className={section === 'products' ? 'active' : ''}
          >
            <Package size={19} /> Produtos {products.data && <b>{products.data.length}</b>}
          </button>
          <button
            type="button"
            onClick={() => setSection('users')}
            className={section === 'users' ? 'active' : ''}
          >
            <Users size={19} /> Usuários
          </button>
          <button
            type="button"
            onClick={() => setSection('settings')}
            className={section === 'settings' ? 'active' : ''}
          >
            <Settings size={19} /> Configurações
          </button>
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            <ExternalLink size={17} /> Ver campanha
          </Link>
          <AdminLogoutButton />
          <small>
            Painel da campanha
            <br />
            Formatura do Benjamim
          </small>
        </div>
      </aside>
      <main id="conteudo" className="admin-main">
        <header className="admin-topbar">
          <span>
            Formatura do Benjamim <span className="admin-divider">/</span> {sectionNames[section]}
          </span>
          <AdminAccount />
        </header>
        <div className="admin-content">
          <div className="admin-title">
            <div>
              <span className="eyebrow">UM SONHO COMPARTILHADO</span>
              <h1>{sectionTitles[section]}</h1>
              <p>{sectionIntros[section]}</p>
            </div>
            <Link href="/contribuir" className="button button-small">
              Nova contribuição
            </Link>
          </div>
          {section === 'products' ? (
            <ProductsPanel
              products={products.data}
              metrics={data}
              error={products.error}
              onRetry={products.reload}
              onSaved={(saved) =>
                products.setData((list) => list.map((item) => (item.id === saved.id ? saved : item)))
              }
            />
          ) : section === 'users' ? (
            <UsersPanel />
          ) : section === 'settings' ? (
            <SettingsPanel onChanged={refreshTotals} />
          ) : (
            <>
              {section === 'overview' && (
                <>
                  {metrics.error && (
                    <p className="form-error" role="alert">
                      {metrics.error}{' '}
                      <button type="button" className="admin-link-button" onClick={metrics.reload}>
                        Tentar de novo
                      </button>
                    </p>
                  )}
                  {!data ? (
                    !metrics.error && <p className="admin-loading-inline">Carregando indicadores…</p>
                  ) : (
                    <>
                      <div className="metric-grid">
                        <article>
                          <span className="metric-icon green">
                            <Wallet size={21} />
                          </span>
                          <span>Arrecadado</span>
                          <strong>{money(data.raisedCents)}</strong>
                          <small>{data.ordersCount.APPROVED} pedido(s) aprovado(s)</small>
                        </article>
                        <article>
                          <span className="metric-icon blue">
                            <Target size={21} />
                          </span>
                          <span>Meta</span>
                          <strong>{money(data.goalCents)}</strong>
                          <small>{percent}% alcançado</small>
                        </article>
                        <article>
                          <span className="metric-icon yellow">
                            <Clock3 size={21} />
                          </span>
                          <span>Pendente</span>
                          <strong>{money(data.pendingCents)}</strong>
                          <small>{data.ordersCount.PENDING} pedido(s) aguardando pagamento</small>
                        </article>
                        <article>
                          <span className="metric-icon pale">
                            <RotateCcw size={21} />
                          </span>
                          <span>Estornado</span>
                          <strong>{money(data.refundedCents)}</strong>
                          <small>Não entra no total arrecadado</small>
                        </article>
                      </div>
                      <section className="admin-progress admin-panel">
                        <div>
                          <span className="eyebrow">DE GESTO EM GESTO</span>
                          <h2>Cada contribuição aproxima esse sonho.</h2>
                          <p>
                            Faltam <b>{money(Math.max(0, data.goalCents - data.raisedCents))}</b> para a meta.
                          </p>
                        </div>
                        <div className="admin-progress-meter">
                          <strong>{percent}%</strong>
                          <div
                            className="progress-track"
                            role="progressbar"
                            aria-label="Meta de arrecadação"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span style={{ width: `${percent}%` }} />
                          </div>
                          <span>
                            {money(data.raisedCents)} de {money(data.goalCents)}
                          </span>
                        </div>
                      </section>
                      <div className="catalog-counts">
                        <span>
                          <b>{data.numbersSold}</b> números vendidos de {data.totalNumbers}
                        </span>
                        <span>
                          <b>{data.numbersReserved}</b> reservados
                        </span>
                        <span>
                          <b>{data.numbersAvailable}</b> disponíveis
                        </span>
                        <span>
                          Custos previstos: <b>{money(data.costsCents)}</b>
                        </span>
                      </div>
                      <DrawCard drawAt={data.drawAt} />
                    </>
                  )}
                </>
              )}
              <OrdersTable isDemo={isDemo} onChanged={refreshTotals} />
            </>
          )}
          <footer className="admin-footer">
            <Heart size={14} /> Feito com carinho para a formatura do Benjamim.
            <span>Painel da campanha</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
