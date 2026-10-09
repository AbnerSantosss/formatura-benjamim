'use client';
import { FormEvent, ReactNode, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { GATEWAY_DEFS } from '@/domain/gateway-fields';
import {
  errorMessage,
  fetchGatewaySettings,
  updateGatewaySettings,
  type GatewayItem,
  type GatewaySettings,
} from '@/lib/admin-client';
import { useAdminData } from './use-admin-data';

const sourceLabel = { painel: 'salvo no painel', ambiente: 'vindo do servidor (.env)' } as const;

type CardProps = { item: GatewayItem; onSaved: (settings: GatewaySettings) => void };

function GatewayCard({ item, onSaved }: CardProps) {
  const def = GATEWAY_DEFS[item.id];
  // Segredos começam sempre vazios: o servidor nunca devolve o valor. Vazio = manter como está.
  const initial = () =>
    Object.fromEntries(
      def.fields.map((field) => {
        const state = item.fields.find((entry) => entry.name === field.name);
        return [field.name, field.secret ? '' : state?.source === 'painel' ? (state.value ?? '') : ''];
      }),
    );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function submit(changes: Parameters<typeof updateGatewaySettings>[0], done: string) {
    if (pending) return;
    setPending(true);
    setNotice('');
    setError('');
    try {
      onSaved(await updateGatewaySettings(changes));
      setValues((current) =>
        Object.fromEntries(
          def.fields.map((field) => [field.name, field.secret ? '' : (current[field.name] ?? '')]),
        ),
      );
      setNotice(done);
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setPending(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: Record<string, string | null> = {};
    for (const field of def.fields) {
      const state = item.fields.find((entry) => entry.name === field.name);
      const value = (values[field.name] ?? '').trim();
      if (field.secret) {
        if (value) fields[field.name] = value;
      } else if (value !== (state?.source === 'painel' ? (state.value ?? '') : '')) {
        fields[field.name] = value || null;
      }
    }
    if (Object.keys(fields).length === 0) return setError('Preencha ao menos um campo para salvar.');
    void submit({ gateway: item.id, fields }, 'Credenciais salvas.');
  }

  const webhookUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/api/webhooks/${item.id}`;

  return (
    <form className={`admin-panel${item.id === 'mercadopago' ? ' integration-panel' : ''}`} onSubmit={save}>
      <span className="panel-icon">
        <CreditCard />
      </span>
      <h2>{def.label}</h2>
      <span className={`status-pill ${item.configured ? 'approved' : 'pending'}`}>
        {item.active ? 'Em uso · ' : ''}
        {item.configured ? 'Credenciais presentes' : 'Credenciais ausentes'}
      </span>
      {!def.implemented && (
        <p>
          Integração ainda não liberada: as chaves ficam guardadas, mas este gateway só poderá ser ativado
          quando a integração estiver pronta.
        </p>
      )}
      {def.fields.map((field) => {
        const state = item.fields.find((entry) => entry.name === field.name);
        return (
          <label className="admin-field" key={field.name}>
            {field.label}
            <input
              name={`${item.id}-${field.name}`}
              type={field.secret ? 'password' : field.url ? 'url' : 'text'}
              autoComplete={field.secret ? 'new-password' : 'off'}
              spellCheck={false}
              maxLength={500}
              placeholder={
                field.secret && state?.set
                  ? 'Já definido. Preencha só para trocar.'
                  : !field.secret && state?.source === 'ambiente'
                    ? state.value
                    : field.hint
              }
              value={values[field.name] ?? ''}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            />
            <span className="admin-field-hint">
              {state?.source ? `Preenchido, ${sourceLabel[state.source]}.` : 'Não preenchido.'}{' '}
              {state?.source === 'painel' && (
                <button
                  type="button"
                  className="admin-link-button"
                  disabled={pending}
                  onClick={() =>
                    void submit(
                      { gateway: item.id, fields: { [field.name]: null } },
                      'Campo apagado do painel.',
                    )
                  }
                >
                  Apagar
                </button>
              )}
            </span>
          </label>
        );
      })}
      <dl className="admin-kv">
        <div>
          <dt>Endereço do webhook</dt>
          <dd>{webhookUrl}</dd>
        </div>
      </dl>
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
      <button className="button button-small" type="submit" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar credenciais'}
      </button>{' '}
      {!item.active && def.implemented && (
        <button
          type="button"
          className="secondary-button"
          disabled={pending || !item.configured}
          onClick={() =>
            void submit({ gateway: item.id, activate: true }, `${def.label} agora é o gateway em uso.`)
          }
        >
          Usar este gateway
        </button>
      )}
    </form>
  );
}

type PanelProps = {
  /** Mostrado a quem não é proprietário (só leitura). */
  fallback: ReactNode;
  onSaved: () => void;
};

export default function GatewaysPanel({ fallback, onSaved }: PanelProps) {
  // `undefined` no dado = ainda carregando; `null` vindo da API = sem permissão.
  const { data, error, reload, setData } = useAdminData(loadSettings);

  if (error) {
    return (
      <p className="form-error" role="alert">
        {error}{' '}
        <button type="button" className="admin-link-button" onClick={reload}>
          Tentar de novo
        </button>
      </p>
    );
  }
  if (!data) return <p className="admin-loading-inline">Carregando gateways…</p>;
  if (!data.settings) return <div className="settings-grid">{fallback}</div>;

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Gateways de pagamento</h2>
        <p>
          As chaves são guardadas cifradas e nunca voltam a aparecer aqui. O que for salvo no painel vale no
          lugar do que estiver no servidor; novos pedidos passam a usar o gateway em uso em até 10 segundos.
        </p>
      </section>
      <div className="settings-grid">
        {data.settings.gateways.map((item) => (
          <GatewayCard
            key={item.id}
            item={item}
            onSaved={(settings) => {
              setData(() => ({ settings }));
              onSaved();
            }}
          />
        ))}
      </div>
    </div>
  );
}

const loadSettings = async (signal: AbortSignal) => ({ settings: await fetchGatewaySettings(signal) });
