'use client';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Heart, Info, LockKeyhole, Landmark, FlaskConical } from 'lucide-react';
import AmountSelector from './amount-selector';
import { money } from '@/lib/campaign';
import { createDemoPayment } from '@/lib/demo-store';
const maskCpf = (value: string) => value.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskPhone = (value: string) => value.replace(/\D/g, '').slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
export default function Checkout({ initialAmount }: { initialAmount: number }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [amount, setAmount] = useState(initialAmount);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (name.trim().length < 2 || cpf.replace(/\D/g,'').length !== 11 || phone.replace(/\D/g,'').length !== 11) { setError('Preencha os campos fictícios ou use “Preencher dados de teste”.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try { const id = createDemoPayment(amount); router.push(`/pagamento?id=${id}`); }
    catch (issue) { setError((issue as Error).message); submitting.current = false; setBusy(false); }
  }
  return <div className="checkout-card"><div className="checkout-title"><span className="eyebrow">VOCÊ FAZ PARTE DESSA HISTÓRIA</span><h1>Finalize sua contribuição</h1><p>Escolha um valor e conheça o fluxo de pagamento simulado.</p></div><form onSubmit={submit}><section className="checkout-section"><h2><span className="step-number">1</span> Sua contribuição</h2><AmountSelector value={amount} onChange={setAmount} /></section><section className="checkout-section"><h2><span className="step-number">2</span> Seus dados</h2><p className="field-note">Use somente dados fictícios nesta demonstração.</p><button type="button" className="fill-demo-button" onClick={() => { setName('Pessoa de teste'); setEmail('teste@example.com'); setCpf('000.000.000-00'); setPhone('(00) 00000-0000'); setError(''); }}><FlaskConical size={15} /> Preencher dados de teste</button><div className="form-grid"><label>Nome completo<input autoComplete="off" name="name" placeholder="Como você se chama?" required value={name} onChange={event => setName(event.target.value)} /></label><label>CPF<input name="cpf" autoComplete="off" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={event => setCpf(maskCpf(event.target.value))} required /></label><label>WhatsApp<input name="phone" autoComplete="off" inputMode="tel" placeholder="(00) 00000-0000" value={phone} onChange={event => setPhone(maskPhone(event.target.value))} required /></label><label>E-mail<input name="email" autoComplete="off" type="email" placeholder="voce@exemplo.com" required value={email} onChange={event => setEmail(event.target.value)} /></label></div><p className="data-note"><LockKeyhole size={14} /> Dados pessoais não são enviados nem salvos. Apenas valor, data e status do teste ficam neste navegador. <Link href="/privacidade">Privacidade</Link></p></section><section className="checkout-section payment-section"><h2><span className="step-number">3</span> Pagamento</h2><div className="payment-method"><Landmark size={32} /><div><b>Pix · demonstração</b><span>Experimente o fluxo, sem movimentar dinheiro.</span></div><Check size={20} /></div><div className="order-summary"><div><span>Contribuição para a formatura</span><b>{money(amount)}</b></div><div className="order-total"><span>Total simulado</span><strong aria-live="polite">{money(amount)}</strong></div></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button wide" type="submit" disabled={busy}><FlaskConical size={19} /> {busy ? 'Abrindo simulação…' : 'Iniciar pagamento simulado'}</button><p className="checkout-notice"><Info size={17} /><span>Nenhum Pix real será gerado. Na próxima tela, você poderá simular a aprovação ou a expiração do pagamento.</span></p></section><p className="terms-note">Uma contribuição voluntária, feita de coração.<br /><Link href="/termos">Conheça os termos da campanha</Link>.</p></form><div className="checkout-thanks"><Heart size={17} /> Obrigado por estar aqui.</div></div>;
}
