'use client';
import { FormEvent, useState } from 'react';
import { errorMessage, modeLabels, updateProduct, type Metrics, type Product } from '@/lib/admin-client';
import { money } from '@/lib/campaign';

type CardProps = { product: Product; onSaved: (product: Product) => void };

function ProductCard({ product, onSaved }: CardProps) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description);
  const [active, setActive] = useState(product.active);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const dirty =
    title.trim() !== product.title || description.trim() !== product.description || active !== product.active;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice('');
    setError('');
    try {
      const saved = await updateProduct(product.id, {
        title: title.trim(),
        description: description.trim(),
        active,
      });
      setTitle(saved.title);
      setDescription(saved.description);
      setActive(saved.active);
      onSaved(saved);
      setNotice('Produto salvo.');
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="admin-panel">
      <span className={`status-pill ${product.active ? 'approved' : 'expired'}`}>
        {product.active ? 'Ativo' : 'Inativo'}
      </span>
      <h3>{product.title}</h3>
      <dl>
        <dt>Código do produto</dt>
        <dd>{product.id}</dd>
        <dt>Modalidade</dt>
        <dd>{modeLabels[product.mode]}</dd>
        <dt>Preço</dt>
        <dd>{product.unitCents ? `${money(product.unitCents)} por número` : 'Valor livre'}</dd>
        <dt>Pedidos</dt>
        <dd>{product.ordersCount}</dd>
        <dt>Pedidos aprovados</dt>
        <dd>{product.approvedCount}</dd>
        <dt>Total aprovado</dt>
        <dd>{money(product.approvedCents)}</dd>
        {product.mode === 'NUMBERS' && (
          <>
            <dt>Números confirmados</dt>
            <dd>{product.numbersConfirmed}</dd>
          </>
        )}
      </dl>
      <form onSubmit={save} className="admin-product-form">
        <label className="admin-field">
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
        </label>
        <label className="admin-field">
          Descrição
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            rows={4}
            required
          />
        </label>
        <label className="admin-check">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Produto ativo (aceita novos pedidos)
        </label>
        {notice && (
          <p className="admin-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="secondary-button" disabled={pending || !dirty}>
          {pending ? 'Salvando…' : 'Salvar produto'}
        </button>
      </form>
    </article>
  );
}

type Props = {
  products: Product[] | null;
  metrics: Metrics | null;
  error: string;
  onRetry: () => void;
  onSaved: (product: Product) => void;
};

export default function ProductsPanel({ products, metrics, error, onRetry, onSaved }: Props) {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="admin-link-button" onClick={onRetry}>
            Tentar de novo
          </button>
        </p>
      )}
      {!products ? (
        !error && <p className="admin-loading-inline">Carregando produtos…</p>
      ) : (
        <>
          <div className="catalog-counts">
            <span>
              <b>{products.length}</b> produto(s) cadastrado(s)
            </span>
            {metrics && (
              <>
                <span>
                  <b>{metrics.numbersSold}</b> números confirmados de {metrics.totalNumbers}
                </span>
                <span>
                  <b>{metrics.numbersReserved}</b> reservados
                </span>
                <span>
                  <b>{metrics.numbersAvailable}</b> disponíveis
                </span>
              </>
            )}
          </div>
          <div className="catalog-products">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onSaved={onSaved} />
            ))}
          </div>
          <p className="catalog-note">
            Título, descrição e situação podem ser editados aqui. O preço por número e a modalidade fazem
            parte das regras da campanha e não mudam por este painel.
          </p>
        </>
      )}
    </>
  );
}
