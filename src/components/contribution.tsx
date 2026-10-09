'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Heart, Landmark } from 'lucide-react';
import AmountSelector from './amount-selector';
import { campaign } from '@/lib/campaign';

export default function Contribution() {
  const [amount, setAmount] = useState(campaign.defaultAmount);
  return <section className="contribution" id="ajudar"><div className="container contribution-grid"><div className="contribution-copy"><Heart className="outline-heart" size={65} /><span className="eyebrow light">UM GESTO SEU. UMA MEMÓRIA PARA SEMPRE.</span><h2>Como você <br />pode ajudar?</h2><p>Cada contribuição ajuda a transformar a formatura do Benjamim em uma lembrança ainda mais especial.</p><span className="handwritten">Juntos, esse sonho fica mais bonito!</span></div><div className="contribution-card"><h3>Escolha um valor para contribuir</h3><p>Todo carinho conta, de qualquer tamanho.</p><AmountSelector value={amount} onChange={setAmount} /><Link className="button wide" href={`/contribuir?valor=${amount / 100}`}><Heart size={21} /> Quero contribuir via Pix <ArrowRight size={20} /></Link><div className="pix-note"><Landmark size={26} /><div><b>Um jeito simples de fazer parte</b><span>Contribuição voluntária, feita com carinho.</span></div></div><small className="preview-note">Prévia do site · pagamentos ainda não disponíveis</small></div></div></section>;
}

