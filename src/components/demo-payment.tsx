'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, CheckCircle2, Clock3, Copy, Heart, QrCode, RotateCcw, TimerOff } from 'lucide-react';
import { changeDemoStatus, useDemo, useDemoClock } from '@/lib/demo-store';
import { effectiveStatus } from '@/lib/demo-model';
import { money } from '@/lib/campaign';

export default function DemoPayment() {
  const params = useSearchParams();
  const { data, ready } = useDemo();
  const now = useDemoClock();
  const [notice, setNotice] = useState('');
  const payment = data.payments.find(item => item.id === params.get('id'));
  if (!ready) return <div className="demo-payment-card">Carregando simulação…</div>;
  if (!payment) return <div className="demo-payment-card"><QrCode size={42} /><h1>Simulação não encontrada</h1><p>Os testes ficam apenas neste navegador. Comece uma nova contribuição para experimentar o fluxo.</p><Link href="/contribuir" className="button">Iniciar uma simulação</Link></div>;
  const status = effectiveStatus(payment, now);
  const remaining = Math.max(0, Math.ceil((payment.expiresAt - (now || payment.createdAt)) / 1000));
  const code = `SIMULACAO-SEM-VALOR-FINANCEIRO:${payment.id}`;
  const change = (next: 'approved' | 'expired') => {
    try { changeDemoStatus(payment.id, next); setNotice(''); }
    catch (error) { setNotice((error as Error).message); }
  };
  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setNotice('Código de demonstração copiado. Ele não funciona em aplicativos bancários.'); }
    catch { setNotice('Não foi possível copiar. Você pode selecionar o código no campo.'); }
  }
  return <div className={`demo-payment-card payment-${status}`}><span className="demo-chip">SIMULAÇÃO · SEM VALOR FINANCEIRO</span><div className="payment-state-icon">{status === 'approved' ? <CheckCircle2 /> : status === 'pending' ? <Clock3 /> : status === 'expired' ? <TimerOff /> : <RotateCcw />}</div><h1>{status === 'approved' ? 'Pagamento simulado aprovado!' : status === 'pending' ? 'Vamos testar sua contribuição?' : status === 'expired' ? 'Esta simulação expirou' : 'Estorno simulado concluído'}</h1><p>{status === 'approved' ? 'Obrigado por fazer parte desse momento! Este é o exemplo da tela de agradecimento. Nenhum dinheiro foi movimentado.' : status === 'pending' ? 'Veja como será a etapa de pagamento. Use os controles abaixo para experimentar o resultado.' : status === 'expired' ? 'Nenhuma cobrança foi feita. Você pode começar outro teste quando quiser.' : 'O valor foi retirado das métricas de aprovação da demonstração.'}</p><strong className="payment-amount">{money(payment.amount)}</strong>{status === 'pending' && <><div className="demo-qr"><QrCode size={74} aria-hidden="true" /><b>DEMONSTRAÇÃO</b><span>Sem QR Code pagável</span></div><div className="demo-timer"><Clock3 size={16} /> Expira em {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</div><label className="demo-code-label">Código ilustrativo — não é um Pix<input readOnly value={code} onFocus={event => event.target.select()} /></label><button type="button" className="secondary-button wide" onClick={copyCode}><Copy size={17} /> Copiar código de demonstração</button><button className="button wide" onClick={() => change('approved')}><Check size={19} /> Simular pagamento aprovado</button><button className="text-button" onClick={() => change('expired')}>Simular expiração</button></>}{notice && <p className="demo-feedback" role="status">{notice}</p>}{status !== 'pending' && <div className="payment-finish"><Heart size={25} /><span className="handwritten">Um pequeno gesto. Uma lembrança enorme.</span><Link href="/contribuir" className="button wide">Fazer outra simulação</Link></div>}<div className="payment-links"><Link href="/admin">Ver no backoffice</Link><Link href="/">Voltar à campanha</Link></div><small>Registro de teste: {payment.id.slice(0, 13)} · salvo somente neste navegador</small></div>;
}
