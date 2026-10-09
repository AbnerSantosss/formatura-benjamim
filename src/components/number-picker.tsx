'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Shuffle, Trash2 } from 'lucide-react';
import { TOTAL_NUMBERS, formatNumber, randomAvailableNumbers } from '@/lib/demo-model';

export default function NumberPicker({ selected, onChange, allowance, occupied, ready }: { selected: number[]; onChange: (numbers: number[]) => void; allowance: number; occupied: Set<number>; ready: boolean }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(TOTAL_NUMBERS / 100);
  const start = page * 100 + 1;
  function toggle(number: number) {
    if (selected.includes(number)) onChange(selected.filter(item => item !== number));
    else if (selected.length < allowance && !occupied.has(number)) onChange([...selected, number].sort((a,b) => a-b));
  }
  function complete() {
    const chosen = selected.filter(number => !occupied.has(number)).slice(0,allowance);
    for (let number = 1; number <= TOTAL_NUMBERS && chosen.length < allowance; number++) if (!occupied.has(number) && !chosen.includes(number)) chosen.push(number);
    onChange(chosen.sort((a,b) => a-b));
  }
  function selectRandomly() {
    const chosen = randomAvailableNumbers(allowance, occupied);
    onChange(chosen);
    if (chosen.length) setPage(Math.floor((chosen[0]-1)/100));
  }
  return <div className="number-picker">
    <div className="number-picker-heading"><div><b>Escolha seus números</b><p>Os números escolhidos podem estar em blocos diferentes.</p></div><strong aria-live="polite">{selected.length} / {allowance}</strong></div>
    <div className="number-pagination"><button type="button" aria-label="Bloco anterior" disabled={page === 0} onClick={() => setPage(page-1)}><ChevronLeft size={18}/></button><label>Bloco <select aria-label="Bloco de números" value={page} onChange={event => setPage(Number(event.target.value))}>{Array.from({length:pages},(_,index) => <option value={index} key={index}>{formatNumber(index*100+1)} – {formatNumber(Math.min((index+1)*100,TOTAL_NUMBERS))}</option>)}</select></label><button type="button" aria-label="Próximo bloco" disabled={page === pages-1} onClick={() => setPage(page+1)}><ChevronRight size={18}/></button></div>
    <p className="number-scroll-hint">No celular, deslize a tabela para ver todas as colunas.</p>
    <div className="number-grid-scroll"><div className="number-grid" role="group" aria-label="Tabela 10 por 10 de números">{Array.from({length:100},(_,index) => start+index).filter(number => number<=TOTAL_NUMBERS).map(number => { const picked = selected.includes(number); const unavailable = occupied.has(number); return <button type="button" key={number} aria-label={`Número ${formatNumber(number)} ${unavailable ? 'indisponível' : picked ? 'selecionado' : 'livre'}`} aria-pressed={picked} disabled={!ready || unavailable || (!picked && selected.length>=allowance)} className={unavailable ? 'unavailable' : picked ? 'picked' : ''} onClick={() => toggle(number)}>{formatNumber(number)}</button>; })}</div></div>
    <div className="number-legend"><span><i/>Livre</span><span><i className="picked"/>Escolhido</span><span><i className="unavailable"/>Reservado / confirmado</span></div>
    <div className="number-tools">
      <button type="button" className="random-number-button" onClick={selectRandomly} disabled={!ready || !allowance || TOTAL_NUMBERS-occupied.size < allowance}><Shuffle size={18} /> Selecionar aleatoriamente</button>
      <button type="button" className="secondary-button" onClick={complete} disabled={!ready || selected.length===allowance || !allowance}><Check size={16}/> Completar com disponíveis</button>
      <button type="button" className="clear-number-button" onClick={() => onChange([])} disabled={!selected.length}><Trash2 size={16} /> Limpar escolha</button>
    </div>
    <p className="random-number-hint">A seleção aleatória escolhe um novo conjunto e substitui os números selecionados.</p>
    <p className="number-count" role="status">{selected.length===allowance && allowance ? 'Sua escolha está completa.' : `Faltam ${Math.max(0,allowance-selected.length)} números para completar sua escolha.`}</p>
    {selected.length>0 && <details className="selected-number-list"><summary>Ver os {selected.length} números escolhidos</summary><div className="selected-number-pills" aria-label="Números escolhidos">{selected.map(number => <span key={number}>{formatNumber(number)}</span>)}</div></details>}
    <small className="number-local-note">Nesta demonstração, a disponibilidade é salva apenas neste navegador. Ao abrir o Pix, a reserva de teste dura 10 minutos.</small>
  </div>;
}
