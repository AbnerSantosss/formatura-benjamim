'use client';
import { FormEvent, useState } from 'react';
import { CalendarClock, Clock3, Megaphone, Target } from 'lucide-react';
import {
  centsToInput,
  errorMessage,
  fetchSettings,
  inputToCents,
  isoToLocalInput,
  localInputToIso,
  runExpiration,
  updateSettings,
  type Gateways,
  type Settings,
} from '@/lib/admin-client';
import GatewaysPanel from './gateways-panel';
import { useAdminData } from './use-admin-data';

const gatewayLabels: Record<string, string> = {
  demo: 'Demonstração (sem cobrança real)',
  mercadopago: 'Mercado Pago',
  fastpay: 'FastPay',
  ironpay: 'IronPay',
};
const gatewayLabel = (id: string) => gatewayLabels[id] ?? id;

type FormProps = { settings: Settings; onSaved: (settings: Settings, gateways: Gateways) => void };

function SettingsForm({ settings, onSaved }: FormProps) {
  const [goal, setGoal] = useState(centsToInput(settings.goalCents));
  const [costs, setCosts] = useState(centsToInput(settings.costsCents));
  const [drawAt, setDrawAt] = useState(isoToLocalInput(settings.drawAt));
  const [drawPublic, setDrawPublic] = useState(settings.drawPublic);
  const [instagramFather, setInstagramFather] = useState(settings.instagramFather);
  const [instagramMother, setInstagramMother] = useState(settings.instagramMother);
  const [publicMessage, setPublicMessage] = useState(settings.publicMessage);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setNotice('');
    const goalCents = inputToCents(goal);
    const costsCents = inputToCents(costs);
    const drawIso = localInputToIso(drawAt);
    if (goalCents === null) return setError('Informe a meta em reais, por exemplo 2500,00.');
    if (costsCents === null) return setError('Informe os custos em reais, por exemplo 800,00.');
    if (drawIso === undefined) return setError('Data do sorteio inválida.');

    setPending(true);
    setError('');
    try {
      const saved = await updateSettings({
        goalCents,
        costsCents,
        drawAt: drawIso,
        drawPublic,
        instagramFather: instagramFather.trim(),
        instagramMother: instagramMother.trim(),
        publicMessage: publicMessage.trim(),
      });
      setGoal(centsToInput(saved.settings.goalCents));
      setCosts(centsToInput(saved.settings.costsCents));
      setDrawAt(isoToLocalInput(saved.settings.drawAt));
      setDrawPublic(saved.settings.drawPublic);
      setInstagramFather(saved.settings.instagramFather);
      setInstagramMother(saved.settings.instagramMother);
      setPublicMessage(saved.settings.publicMessage);
      onSaved(saved.settings, saved.gateways);
      setNotice('Configurações salvas.');
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="admin-stack">
      <div className="settings-grid">
        <section className="admin-panel">
          <span className="panel-icon">
            <Target />
          </span>
          <h2>Meta de arrecadação</h2>
          <p>A meta aparece na campanha pública; os custos ficam só neste painel.</p>
          <label className="admin-field">
            Meta (R$)
            <input
              name="goal"
              inputMode="decimal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              required
            />
          </label>
          <label className="admin-field">
            Custos previstos (R$)
            <input
              name="costs"
              inputMode="decimal"
              value={costs}
              onChange={(event) => setCosts(event.target.value)}
              required
            />
          </label>
        </section>
        <section className="admin-panel">
          <span className="panel-icon">
            <CalendarClock />
          </span>
          <h2>Sorteio</h2>
          <p>Data e hora no horário de Fortaleza. Deixe em branco enquanto não houver data.</p>
          <label className="admin-field">
            Data e hora do sorteio
            <input
              name="drawAt"
              type="datetime-local"
              value={drawAt}
              onChange={(event) => setDrawAt(event.target.value)}
            />
          </label>
          <label className="admin-check">
            <input
              name="drawPublic"
              type="checkbox"
              checked={drawPublic}
              onChange={(event) => setDrawPublic(event.target.checked)}
            />
            Exibir o resultado do sorteio na página da campanha
          </label>
        </section>
        <section className="admin-panel integration-panel">
          <span className="panel-icon">
            <Megaphone />
          </span>
          <h2>Página da campanha</h2>
          <p>Endereços completos do Instagram (https://…). Em branco, o link não aparece.</p>
          <div className="admin-form-row admin-form-row-two">
            <label className="admin-field">
              Instagram do pai
              <input
                name="instagramFather"
                type="url"
                inputMode="url"
                placeholder="https://www.instagram.com/…"
                value={instagramFather}
                onChange={(event) => setInstagramFather(event.target.value)}
                maxLength={200}
              />
            </label>
            <label className="admin-field">
              Instagram da mãe
              <input
                name="instagramMother"
                type="url"
                inputMode="url"
                placeholder="https://www.instagram.com/…"
                value={instagramMother}
                onChange={(event) => setInstagramMother(event.target.value)}
                maxLength={200}
              />
            </label>
          </div>
          <label className="admin-field">
            Mensagem pública
            <textarea
              name="publicMessage"
              value={publicMessage}
              onChange={(event) => setPublicMessage(event.target.value)}
              maxLength={500}
              rows={4}
            />
            <span className="admin-field-hint">{publicMessage.length} de 500 caracteres</span>
          </label>
        </section>
      </div>
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
      <div>
        <button className="button button-small" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  );
}

function GatewaysCard({ gateways }: { gateways: Gateways }) {
  const others = Object.entries(gateways.others);
  return (
    <section className="admin-panel">
      <h2>Gateways</h2>
      <p>
        Meio de pagamento ativo: <b>{gatewayLabel(gateways.active)}</b>
      </p>
      <span className={`status-pill ${gateways.configured ? 'approved' : 'pending'}`}>
        {gateways.configured ? 'Credenciais presentes' : 'Credenciais ausentes'}
      </span>
      {others.length > 0 && (
        <dl className="admin-kv">
          {others.map(([id, configured]) => (
            <div key={id}>
              <dt>{gatewayLabel(id)}</dt>
              <dd>{configured ? 'Credenciais presentes' : 'Não configurado'}</dd>
            </div>
          ))}
        </dl>
      )}
      <p>As chaves ficam só no servidor e nunca são exibidas aqui.</p>
    </section>
  );
}

function ExpirationCard({ onChanged }: { onChanged: () => void }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function run() {
    if (pending) return;
    setPending(true);
    setNotice('');
    setError('');
    try {
      const { expired } = await runExpiration();
      setNotice(
        expired > 0
          ? `${expired} pedido(s) vencido(s) marcado(s) como expirado(s); os números foram liberados.`
          : 'Nenhum pedido vencido para expirar.',
      );
      onChanged();
    } catch (issue) {
      setError(errorMessage(issue));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="admin-panel">
      <span className="panel-icon">
        <Clock3 />
      </span>
      <h2>Pedidos vencidos</h2>
      <p>Marca como expirados os pedidos pendentes que passaram do prazo e libera os números reservados.</p>
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
      <button type="button" className="secondary-button" onClick={run} disabled={pending}>
        {pending ? 'Rodando…' : 'Rodar expiração agora'}
      </button>
    </section>
  );
}

/** `onChanged`: algo que muda os indicadores da visão geral foi salvo (meta, sorteio, expiração). */
export default function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const { data, error, reload, setData } = useAdminData(fetchSettings);

  return (
    <div className="admin-stack">
      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="admin-link-button" onClick={reload}>
            Tentar de novo
          </button>
        </p>
      )}
      {!data ? (
        !error && <p className="admin-loading-inline">Carregando configurações…</p>
      ) : (
        <>
          <SettingsForm
            settings={data.settings}
            onSaved={(settings, gateways) => {
              setData(() => ({ settings, gateways }));
              onChanged();
            }}
          />
          <GatewaysPanel fallback={<GatewaysCard gateways={data.gateways} />} onSaved={reload} />
          <div className="settings-grid">
            <ExpirationCard onChanged={onChanged} />
          </div>
        </>
      )}
    </div>
  );
}
