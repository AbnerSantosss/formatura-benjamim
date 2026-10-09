'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Heart, Info, LockKeyhole, Landmark } from 'lucide-react';
import AmountSelector from './amount-selector';
import NumberPicker from './number-picker';
import { money } from '@/lib/campaign';
import { createOrder, fetchOccupied, isApiError } from '@/lib/api-client';
import {
  OrderMode,
  TOTAL_NUMBERS,
  formatNumber,
  numberAllowance,
  productFor,
  validateOrder,
} from '@/lib/demo-model';
import { newOrderSchema } from '@/domain/validation';

const OCCUPIED_REFRESH_MS = 20_000;
const GATEWAY_COOLDOWN_MS = 30_000;
const LOAD_ERROR = 'Não foi possível carregar os números agora. Tente de novo em instantes.';
const GENERIC_ERROR = 'Não foi possível concluir agora. Tente novamente.';
const takenMessage = (numbers: number[]) =>
  numbers.length === 1
    ? `O número ${formatNumber(numbers[0])} acabou de ser reservado por outra pessoa. Escolha outro.`
    : `Os números ${numbers.map(formatNumber).join(', ')} acabaram de ser reservados por outra pessoa. Escolha outros.`;
const maskCpf = (value: string) =>
  value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskPhone = (value: string) =>
  value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
export default function Checkout({
  initialAmount,
  initialMode = 'numbers',
  initialNumbers = [],
}: {
  initialAmount: number;
  initialMode?: OrderMode;
  initialNumbers?: number[];
}) {
  const router = useRouter();
  const submitting = useRef(false);
  // Chave de idempotência do formulário: criada no primeiro envio e trocada depois de um pedido
  // criado, de um erro que cancela o pedido no servidor ou quando o conteúdo do pedido muda.
  const idempotency = useRef<{ key: string; signature: string } | null>(null);
  const selectedRef = useRef<number[]>([]);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [occupied, setOccupied] = useState<Set<number>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [mode, setMode] = useState<OrderMode>(initialMode);
  const [amount, setAmount] = useState(initialAmount);
  const [selected, setSelected] = useState<number[]>(() =>
    initialMode === 'numbers' ? initialNumbers.slice(0, numberAllowance(initialAmount)) : [],
  );
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const allowance = mode === 'numbers' ? numberAllowance(amount) : 0;
  const product = productFor(mode);
  // Dados e Pix só aparecem com a escolha completa; na colaboração avulsa não há o que escolher.
  const showCheckout = mode === 'extra' || (allowance > 0 && selected.length === allowance);
  const detailsRef = useRef<HTMLElement | null>(null);
  const wasShown = useRef(showCheckout);
  useEffect(() => {
    if (showCheckout && !wasShown.current && mode === 'numbers') {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      detailsRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    wasShown.current = showCheckout;
  }, [showCheckout, mode]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  /** Busca os ocupados na API. `extra` soma números que o servidor acabou de recusar. */
  const refreshOccupied = useCallback(async (extra: number[] = []) => {
    const list = await fetchOccupied();
    const next = new Set([...list, ...extra]);
    setOccupied(next);
    setReady(true);
    return next;
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const next = await refreshOccupied();
        if (!active) return;
        setError((current) => (current === LOAD_ERROR ? '' : current));
        // Durante o envio os números recém-reservados são os do próprio pedido.
        if (submitting.current) return;
        const taken = selectedRef.current.filter((number) => next.has(number));
        if (taken.length) {
          setSelected((items) => items.filter((number) => !next.has(number)));
          setError(takenMessage(taken));
        }
      } catch {
        if (active) setError((current) => current || LOAD_ERROR);
      }
    }
    void load();
    const timer = setInterval(load, OCCUPIED_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshOccupied]);
  useEffect(
    () => () => {
      if (cooldown.current) clearTimeout(cooldown.current);
    },
    [],
  );
  function chooseAmount(value: number) {
    setAmount(value);
    setSelected((items) => items.slice(0, numberAllowance(value)));
    setError('');
  }
  function chooseMode(value: OrderMode) {
    setMode(value);
    setSelected([]);
    setError('');
    if (value === 'numbers' && !numberAllowance(amount)) setAmount(500);
  }
  async function handleFailure(issue: unknown) {
    const failure = isApiError(issue) ? issue : null;
    // 5xx e pedido não pagável: o pedido dessa chave pode ter sido cancelado no servidor.
    if (failure && (failure.status >= 500 || failure.code === 'ORDER_NOT_PAYABLE'))
      idempotency.current = null;
    if (failure?.status === 409 && failure.code === 'NUMBERS_TAKEN') {
      const taken = failure.numbers ?? [];
      let next = new Set(taken);
      try {
        next = await refreshOccupied(taken);
      } catch {
        setOccupied((current) => new Set([...current, ...taken]));
      }
      setSelected((items) => items.filter((number) => !next.has(number)));
      setError(taken.length ? takenMessage(taken) : failure.message);
    } else if (failure?.status === 503 && failure.code === 'GATEWAY_NOT_CONFIGURED') {
      setError('Pagamentos em configuração. Tente de novo em instantes.');
      setBlocked(true);
      if (cooldown.current) clearTimeout(cooldown.current);
      cooldown.current = setTimeout(() => setBlocked(false), GATEWAY_COOLDOWN_MS);
    } else if (failure?.status === 429) {
      setError('Muitas tentativas. Aguarde um minuto.');
    } else {
      setError(failure?.message || GENERIC_ERROR);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || blocked) return;
    try {
      validateOrder(amount, mode, selected);
    } catch (issue) {
      setError((issue as Error).message);
      return;
    }
    const signature = `${mode}|${amount}|${selected.join(',')}`;
    if (idempotency.current?.signature !== signature)
      idempotency.current = { key: crypto.randomUUID(), signature };
    const order = newOrderSchema.safeParse({
      productId: product.id,
      mode: mode === 'numbers' ? 'NUMBERS' : 'EXTRA',
      amountCents: amount,
      numbers: selected,
      contributor: { name, cpf, phone, email },
      idempotencyKey: idempotency.current.key,
    });
    if (!order.success) {
      setError(order.error.issues[0]?.message ?? 'Pedido inválido.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const created = await createOrder(order.data);
      idempotency.current = null;
      router.push(`/pagamento/${created.orderId}?t=${created.publicToken}`);
    } catch (issue) {
      await handleFailure(issue);
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="checkout-card">
      <div className="checkout-title">
        <span className="eyebrow">VOCÊ FAZ PARTE DESSA HISTÓRIA</span>
        <h1>{mode === 'numbers' ? 'Escolha seus números' : 'Sua colaboração avulsa'}</h1>
        <p>
          {mode === 'numbers'
            ? 'Cestas Boticário masculina e feminina. R$ 5 dão 10 números para escolher.'
            : 'Ajude com o valor que desejar, sem escolher números.'}
        </p>
      </div>
      <form onSubmit={submit}>
        <section className="checkout-section">
          <h2>
            <span className="step-number">1</span> Como você quer ajudar?
          </h2>
          <div className="order-mode-switch" role="group" aria-label="Modalidade do pedido">
            <button type="button" aria-pressed={mode === 'numbers'} onClick={() => chooseMode('numbers')}>
              Escolher números<small>Sorteio das cestas · teste</small>
            </button>
            <button type="button" aria-pressed={mode === 'extra'} onClick={() => chooseMode('extra')}>
              Colaboração avulsa<small>Valor livre, sem números</small>
            </button>
          </div>
          <AmountSelector value={amount} onChange={chooseAmount} numbers={mode === 'numbers'} />
          <label className="order-value-input">
            {mode === 'numbers' ? 'Outro pacote (R$), em múltiplos de 5' : 'Outro valor de colaboração (R$)'}
            <input
              aria-label="Valor do pedido em reais"
              type="number"
              inputMode="decimal"
              min="5"
              max={mode === 'numbers' ? TOTAL_NUMBERS * 0.5 : 1000000}
              step={mode === 'numbers' ? 5 : 0.01}
              value={amount ? amount / 100 : ''}
              onChange={(event) => chooseAmount(Math.round(Number(event.target.value) * 100))}
              required
            />
          </label>
          {mode === 'extra' && (
            <p className="package-note">
              A colaboração avulsa não inclui números nem participação no sorteio.
            </p>
          )}
          {mode === 'numbers' && (
            <NumberPicker
              selected={selected}
              onChange={setSelected}
              allowance={allowance}
              occupied={occupied}
              ready={ready}
            />
          )}
        </section>
        {!showCheckout && (
          <div className="checkout-locked">
            <p>
              <LockKeyhole size={16} /> Escolha {allowance ? `seus ${allowance} números` : 'um pacote'} para
              continuar com seus dados e o Pix.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        {showCheckout && (
          <>
            <section className="checkout-section checkout-reveal" ref={detailsRef}>
              <h2>
                <span className="step-number">2</span> Seus dados
              </h2>
              <p className="field-note">Use somente dados fictícios nesta demonstração.</p>
              <div className="form-grid">
                <label>
                  Nome completo
                  <input
                    autoComplete="off"
                    name="name"
                    placeholder="Como você se chama?"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  CPF
                  <input
                    name="cpf"
                    autoComplete="off"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(event) => setCpf(maskCpf(event.target.value))}
                    required
                  />
                </label>
                <label>
                  WhatsApp
                  <input
                    name="phone"
                    autoComplete="off"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(event) => setPhone(maskPhone(event.target.value))}
                    required
                  />
                </label>
                <label>
                  E-mail
                  <input
                    name="email"
                    autoComplete="off"
                    type="email"
                    placeholder="voce@exemplo.com"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
              </div>
              <p className="data-note">
                <LockKeyhole size={14} /> Dados pessoais não são enviados nem salvos. Pedido, números, valor,
                datas e status do teste ficam neste navegador. <Link href="/privacidade">Privacidade</Link>
              </p>
            </section>
            <section className="checkout-section payment-section checkout-reveal">
              <h2>
                <span className="step-number">3</span> Resumo e Pix
              </h2>
              <div className="payment-method">
                <Landmark size={32} />
                <div>
                  <b>Pix · demonstração</b>
                  <span>Experimente o fluxo, sem movimentar dinheiro.</span>
                </div>
                <Check size={20} />
              </div>
              <div className="order-summary">
                <div>
                  <span>{product.title}</span>
                  <b>{mode === 'numbers' ? `${selected.length} números` : 'Valor livre'}</b>
                </div>
                <div className="order-total">
                  <span>Total simulado</span>
                  <strong aria-live="polite">{money(amount)}</strong>
                </div>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button wide"
                type="submit"
                disabled={
                  busy ||
                  blocked ||
                  !ready ||
                  (mode === 'numbers' && (!allowance || selected.length !== allowance))
                }
              >
                <Heart size={19} />{' '}
                {busy
                  ? 'Abrindo simulação…'
                  : mode === 'numbers' && selected.length !== allowance
                    ? `Escolha mais ${Math.max(0, allowance - selected.length)} números`
                    : mode === 'numbers'
                      ? 'Quero garantir meus números!'
                      : 'Quero ajudar esse sonho!'}
              </button>
              <p className="checkout-notice">
                <Info size={17} />
                <span>
                  Nenhum Pix real será gerado. Os números serão reservados no teste e confirmados somente após
                  a aprovação simulada.
                </span>
              </p>
            </section>
          </>
        )}
        <p className="terms-note">
          Uma iniciativa da família do Benjamim.
          <br />
          <Link href="/termos">Conheça os termos da demonstração</Link>.
        </p>
      </form>
      <div className="checkout-thanks">
        <Heart size={17} /> Obrigado por estar aqui.
      </div>
    </div>
  );
}
