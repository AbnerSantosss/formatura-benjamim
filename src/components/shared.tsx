import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  GraduationCap,
  Heart,
  Camera,
  Target,
  TrendingUp,
  Flag,
  Star,
} from 'lucide-react';
import { money } from '@/lib/campaign';

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Formatura do Benjamim — início">
      <span className="brand-icon">
        <GraduationCap size={29} />
      </span>
      <span>
        Benjamim<span className="brand-sub">MINHA FORMATURA DO ABC</span>
      </span>
    </Link>
  );
}

export function Header({ checkout = false }: { checkout?: boolean }) {
  return (
    <header className="header">
      <div className="container header-inner">
        <Brand />
        {checkout ? (
          <Link href="/" className="back-link">
            <ArrowLeft size={17} /> Voltar à campanha
          </Link>
        ) : (
          <>
            <nav aria-label="Menu principal">
              <a href="#historia">Nossa história</a>
              <a href="#meta">Nossa meta</a>
              <a href="#ajudar">Como ajudar</a>
            </nav>
            <a className="button button-small" href="#ajudar">
              <Heart size={18} /> Quero contribuir
            </a>
          </>
        )}
      </div>
    </header>
  );
}

export function Portrait({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`portrait-composition ${compact ? 'compact' : ''}`}>
      <span className="sun-doodle" aria-hidden="true">
        ☼
      </span>
      <span className="abc-doodle" aria-hidden="true">
        ABC
      </span>
      <Star className="star-doodle" size={35} aria-hidden="true" />
      <div className="portrait-frame">
        <Image
          src="/images/benjamim.png"
          alt="Benjamim sorrindo, com sua mochila, pronto para mais um dia de descobertas"
          fill
          priority
          sizes={compact ? '(max-width: 760px) 90vw, 40vw' : '(max-width: 760px) 230px, 480px'}
        />
        <span className="photo-caption">
          um pequeno formando.
          <br />
          <b>um grande sonho!</b>
          <Heart size={27} />
        </span>
      </div>
      <span className="photo-sticker">
        <GraduationCap size={23} /> Turminha do ABC
      </span>
    </div>
  );
}

export function Progress({
  compact = false,
  raisedCents,
  goalCents,
  winner = null,
}: {
  compact?: boolean;
  raisedCents: number;
  goalCents: number;
  winner?: { number: number; firstName: string } | null;
}) {
  const percent = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  return (
    <section
      id="meta"
      aria-label="Progresso da campanha"
      className={`progress-card ${compact ? 'progress-compact' : ''}`}
    >
      <div className="stats">
        <div className="stat">
          <span className="stat-icon blue">
            <Target />
          </span>
          <div>
            <span>Nossa meta</span>
            <strong>{money(goalCents)}</strong>
            <small>Para esse dia especial</small>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon green">
            <TrendingUp />
          </span>
          <div>
            <span>Já arrecadamos</span>
            <strong className="green-text">{money(raisedCents)}</strong>
            <small>Uma história começando</small>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon yellow">
            <Flag />
          </span>
          <div>
            <span>Falta para a meta</span>
            <strong>{money(goalCents - raisedCents)}</strong>
            <small>Cada gesto faz a diferença</small>
          </div>
        </div>
      </div>
      <div className="progress-row">
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Meta arrecadada"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <strong>{percent}%</strong>
      </div>
      {winner && (
        <small>
          Número sorteado: {String(winner.number).padStart(4, '0')} — parabéns, {winner.firstName}!
        </small>
      )}
    </section>
  );
}

export function Footer({
  instagramFather = '',
  instagramMother = '',
}: {
  instagramFather?: string;
  instagramMother?: string;
} = {}) {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <Brand />
        <p>
          Obrigado por fazer parte
          <br />
          dessa história. <Heart size={16} />
        </p>
        <span className="handwritten">Com carinho, nossa família.</span>
      </div>
      <div className="container footer-bottom">
        <span>
          Site desenvolvido pelo pai, <b>Abner Santos</b>
        </span>
        <div>
          {instagramFather && (
            <a href={instagramFather}>
              <Camera size={15} /> Instagram do pai <ArrowUpRight size={13} />
            </a>
          )}
          {instagramMother && (
            <a href={instagramMother}>
              <Camera size={15} /> Instagram da mãe <ArrowUpRight size={13} />
            </a>
          )}
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </div>
      </div>
    </footer>
  );
}
