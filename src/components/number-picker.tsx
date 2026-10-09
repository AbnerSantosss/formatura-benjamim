'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Sparkles, Trash2 } from 'lucide-react';
import { TOTAL_NUMBERS, formatNumber, randomAvailableNumbers } from '@/lib/demo-model';

// Sorteio animado: as fichas giram e travam uma a uma. Acima de ROLL_CHIPS, o resto vira "+N".
const ROLL_CHIPS = 20;
const ROLL_TICK_MS = 55;
const ROLL_SPIN_TICKS = 8;
const randomNumber = () => 1 + Math.floor(Math.random() * TOTAL_NUMBERS);

export default function NumberPicker({
  selected,
  onChange,
  allowance,
  occupied,
  ready,
  demo,
}: {
  demo: boolean;
  selected: number[];
  onChange: (numbers: number[]) => void;
  allowance: number;
  occupied: Set<number>;
  ready: boolean;
}) {
  const [page, setPage] = useState(0);
  // `rolling`: sorteio em andamento. `drawn`: último conjunto sorteado, mostrado enquanto for a escolha.
  const [rolling, setRolling] = useState<{ final: number[]; faces: number[]; locked: number } | null>(null);
  const [drawn, setDrawn] = useState<number[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  const pages = Math.ceil(TOTAL_NUMBERS / 100);
  const start = page * 100 + 1;
  function toggle(number: number) {
    if (selected.includes(number)) onChange(selected.filter((item) => item !== number));
    else if (selected.length < allowance && !occupied.has(number))
      onChange([...selected, number].sort((a, b) => a - b));
  }
  function complete() {
    const chosen = selected.filter((number) => !occupied.has(number)).slice(0, allowance);
    for (let number = 1; number <= TOTAL_NUMBERS && chosen.length < allowance; number++)
      if (!occupied.has(number) && !chosen.includes(number)) chosen.push(number);
    onChange(chosen.sort((a, b) => a - b));
  }
  function applyDraw(chosen: number[]) {
    onChange(chosen);
    setDrawn(chosen);
    if (chosen.length) setPage(Math.floor((chosen[0] - 1) / 100));
  }
  function selectRandomly() {
    if (rolling) return;
    const chosen = randomAvailableNumbers(allowance, occupied);
    if (!chosen.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyDraw(chosen);
      return;
    }
    const chips = Math.min(chosen.length, ROLL_CHIPS);
    const ticksPerLock = chips > 10 ? 1 : 2;
    let tick = 0;
    onChange([]);
    setRolling({ final: chosen, faces: Array.from({ length: chips }, randomNumber), locked: 0 });
    timer.current = setInterval(() => {
      tick += 1;
      const locked = Math.max(0, Math.floor((tick - ROLL_SPIN_TICKS) / ticksPerLock));
      if (locked >= chips) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setRolling(null);
        applyDraw(chosen);
        return;
      }
      setRolling({ final: chosen, faces: Array.from({ length: chips }, randomNumber), locked });
    }, ROLL_TICK_MS);
  }
  const showDrawn = !rolling && drawn !== null && drawn.length > 0 && drawn.join() === selected.join();
  const chips = rolling ? rolling.faces.length : showDrawn ? Math.min(drawn.length, ROLL_CHIPS) : 0;
  const chipTotal = rolling ? rolling.final.length : showDrawn ? drawn.length : 0;
  return (
    <div className="number-picker">
      <div className="number-picker-heading">
        <div>
          <b>Escolha seus números</b>
          <p>Os números escolhidos podem estar em blocos diferentes.</p>
        </div>
        <strong aria-live="polite">
          {selected.length} / {allowance}
        </strong>
      </div>
      <div className="number-draw">
        <button
          type="button"
          className="random-number-button"
          onClick={selectRandomly}
          disabled={!ready || !allowance || rolling !== null || TOTAL_NUMBERS - occupied.size < allowance}
        >
          <Sparkles size={18} /> {rolling ? 'Gerando seus números…' : 'Gerar meus números'}
        </button>
        <p className="random-number-hint">
          Sem tempo para escolher? Sorteamos {allowance || 'os'} números livres para você. Um novo sorteio
          substitui a escolha atual.
        </p>
        {chips > 0 && (
          <div className={rolling ? 'number-roller rolling' : 'number-roller'}>
            <b role="status">{rolling ? 'Sorteando seus números…' : 'Seus números da sorte'}</b>
            <div aria-hidden="true">
              {Array.from({ length: chips }, (_, index) => {
                const settled = !rolling || index < rolling.locked;
                const value = rolling
                  ? settled
                    ? rolling.final[index]
                    : rolling.faces[index]
                  : drawn![index];
                return (
                  <span key={index} className={settled ? 'settled' : ''}>
                    {formatNumber(value)}
                  </span>
                );
              })}
              {chipTotal > chips && <span className="settled more">+{chipTotal - chips}</span>}
            </div>
          </div>
        )}
      </div>
      <p className="number-draw-divider">ou escolha na tabela</p>
      <div className="number-pagination">
        <button
          type="button"
          aria-label="Bloco anterior"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <label>
          Bloco{' '}
          <select
            aria-label="Bloco de números"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: pages }, (_, index) => (
              <option value={index} key={index}>
                {formatNumber(index * 100 + 1)} – {formatNumber(Math.min((index + 1) * 100, TOTAL_NUMBERS))}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label="Próximo bloco"
          disabled={page === pages - 1}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <p className="number-scroll-hint">No celular, deslize a tabela para ver todas as colunas.</p>
      <div className="number-grid-scroll">
        <div className="number-grid" role="group" aria-label="Tabela 10 por 10 de números">
          {Array.from({ length: 100 }, (_, index) => start + index)
            .filter((number) => number <= TOTAL_NUMBERS)
            .map((number) => {
              const picked = selected.includes(number);
              const unavailable = occupied.has(number);
              return (
                <button
                  type="button"
                  key={number}
                  aria-label={`Número ${formatNumber(number)} ${unavailable ? 'indisponível' : picked ? 'selecionado' : 'livre'}`}
                  aria-pressed={picked}
                  disabled={
                    !ready || rolling !== null || unavailable || (!picked && selected.length >= allowance)
                  }
                  className={unavailable ? 'unavailable' : picked ? 'picked' : ''}
                  onClick={() => toggle(number)}
                >
                  {formatNumber(number)}
                </button>
              );
            })}
        </div>
      </div>
      <div className="number-legend">
        <span>
          <i />
          Livre
        </span>
        <span>
          <i className="picked" />
          Escolhido
        </span>
        <span>
          <i className="unavailable" />
          Reservado / confirmado
        </span>
      </div>
      <div className="number-tools">
        <button
          type="button"
          className="secondary-button"
          onClick={complete}
          disabled={!ready || rolling !== null || selected.length === allowance || !allowance}
        >
          <Check size={16} /> Completar com disponíveis
        </button>
        <button
          type="button"
          className="clear-number-button"
          onClick={() => onChange([])}
          disabled={rolling !== null || !selected.length}
        >
          <Trash2 size={16} /> Limpar escolha
        </button>
      </div>
      <p className="number-count" role="status">
        {selected.length === allowance && allowance
          ? 'Sua escolha está completa.'
          : `Faltam ${Math.max(0, allowance - selected.length)} números para completar sua escolha.`}
      </p>
      {selected.length > 0 && (
        <details className="selected-number-list">
          <summary>Ver os {selected.length} números escolhidos</summary>
          <div className="selected-number-pills" aria-label="Números escolhidos">
            {selected.map((number) => (
              <span key={number}>{formatNumber(number)}</span>
            ))}
          </div>
        </details>
      )}
      <small className="number-local-note">
        {demo
          ? 'Nesta demonstração, a disponibilidade é salva apenas neste navegador. Ao abrir o Pix, a reserva de teste dura 10 minutos.'
          : 'Ao abrir o Pix, seus números ficam reservados por 10 minutos.'}
      </small>
    </div>
  );
}
