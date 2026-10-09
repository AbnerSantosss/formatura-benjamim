'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Heart, Info, LockKeyhole, Landmark } from 'lucide-react';
import AmountSelector from './amount-selector';
import { money } from '@/lib/campaign';

const maskCpf = (value: string) => value.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskPhone = (value: string) => value.replace(/\D/g, '').slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');

export default function Checkout({ initialAmount }: { initialAmount: number }) {
  const [amount, setAmount] = useState(initialAmount);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  return <div className="checkout-card"><div className="checkout-title"><span className="eyebrow">VOCÊ FAZ PARTE DESSA HISTÓRIA</span><h1>Finalize sua contribuição</h1><p>Escolha um valor e ajude a tornar esse momento inesquecível.</p></div><form onSubmit={event => event.preventDefault()}><section className="checkout-section"><h2><span className="step-number">1</span> Sua contribuição</h2><AmountSelector value={amount} onChange={setAmount} /></section><section className="checkout-section"><h2><span className="step-number">2</span> Seus dados</h2><p className="field-note">Esta é uma prévia visual. Use apenas dados fictícios.</p><div className="form-grid"><label>Nome completo<input autoComplete="off" name="name" placeholder="Como você se chama?" required /></label><label>CPF<input name="cpf" autoComplete="off" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={event => setCpf(maskCpf(event.target.value))} required /></label><label>WhatsApp<input name="phone" autoComplete="off" inputMode="tel" placeholder="(00) 00000-0000" value={phone} onChange={event => setPhone(maskPhone(event.target.value))} required /></label><label>E-mail<input name="email" autoComplete="off" type="email" placeholder="voce@exemplo.com" required /></label></div><p className="data-note"><LockKeyhole size={14} /> Nesta prévia, os dados não são enviados nem salvos. <Link href="/privacidade">Privacidade</Link></p></section><section className="checkout-section payment-section"><h2><span className="step-number">3</span> Pagamento</h2><div className="payment-method"><Landmark size={32} /><div><b>Pix</b><span>Prático para você. Especial para o Benjamim.</span></div><Check size={20} /></div><div className="order-summary"><div><span>Contribuição para a formatura</span><b>{money(amount)}</b></div><div className="order-total"><span>Total da contribuição</span><strong aria-live="polite">{money(amount)}</strong></div></div><button className="button wide payment-disabled" type="button" disabled aria-describedby="payment-info"><LockKeyhole size={18} /> Pagamento disponível em breve</button><p id="payment-info" className="checkout-notice"><Info size={17} /><span>O Pix estará disponível quando os pagamentos forem ativados. Nenhuma cobrança é gerada nesta prévia.</span></p></section><p className="terms-note">Uma contribuição voluntária, feita de coração.<br />Ao contribuir, você concordará com os <Link href="/termos">termos da campanha</Link>.</p></form><div className="checkout-thanks"><Heart size={17} /> Obrigado por estar aqui.</div></div>;
}

