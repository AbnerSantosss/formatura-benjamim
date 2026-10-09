'use client';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Heart, Info, LockKeyhole, Landmark, FlaskConical } from 'lucide-react';
import AmountSelector from './amount-selector';
import NumberPicker from './number-picker';
import { money } from '@/lib/campaign';
import { createDemoPayment, useDemo, useDemoClock } from '@/lib/demo-store';
import {
  OrderMode,
  TOTAL_NUMBERS,
  numberAllowance,
  occupiedNumbers,
  productFor,
  validateOrder,
} from '@/lib/demo-model';
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
}: {
  initialAmount: number;
  initialMode?: OrderMode;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const { data, ready } = useDemo();
  const now = useDemoClock();
  const [mode, setMode] = useState<OrderMode>(initialMode);
  const [amount, setAmount] = useState(initialAmount);
  const [selected, setSelected] = useState<number[]>([]);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const allowance = mode === 'numbers' ? numberAllowance(amount) : 0;
  const occupied = occupiedNumbers(data, now);
  const product = productFor(mode);
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
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    try {
      validateOrder(amount, mode, selected);
    } catch (issue) {
      setError((issue as Error).message);
      return;
    }
    if (
      name.trim().length < 2 ||
      cpf.replace(/\D/g, '').length !== 11 ||
      phone.replace(/\D/g, '').length !== 11
    ) {
      setError('Preencha os campos fictícios ou use “Preencher dados de teste”.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const id = createDemoPayment(amount, mode, selected);
      router.push(`/pagamento?id=${id}`);
    } catch (issue) {
      setError((issue as Error).message);
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
        <section className="checkout-section">
          <h2>
            <span className="step-number">2</span> Seus dados
          </h2>
          <p className="field-note">Use somente dados fictícios nesta demonstração.</p>
          <button
            type="button"
            className="fill-demo-button"
            onClick={() => {
              setName('Pessoa de teste');
              setEmail('teste@example.com');
              setCpf('000.000.000-00');
              setPhone('(00) 00000-0000');
              setError('');
            }}
          >
            <FlaskConical size={15} /> Preencher dados de teste
          </button>
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
        <section className="checkout-section payment-section">
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
            disabled={busy || !ready || (mode === 'numbers' && (!allowance || selected.length !== allowance))}
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
              Nenhum Pix real será gerado. Os números serão reservados no teste e confirmados somente após a
              aprovação simulada.
            </span>
          </p>
        </section>
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
