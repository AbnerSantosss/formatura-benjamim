'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  BookOpen,
  CheckCheck,
  ChevronRight,
  Code,
  Gift,
  GraduationCap,
  Heart,
  LockKeyhole,
  Menu,
  MousePointerClick,
  Settings,
  Star,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import { Progress } from './shared';
import { campaign, money } from '@/lib/campaign';

function SchoolMark() {
  return (
    <span className="ref-school-brand">
      <GraduationCap aria-hidden="true" />
      <span>
        BENJAMIM<small>FORMATURA DO ABC</small>
      </span>
    </span>
  );
}
function PixMark() {
  return (
    <span className="ref-pix-mark">
      <span aria-hidden="true">❖</span>pix
    </span>
  );
}
// Dados vindos do servidor (página `/`). Só valores serializáveis: drawAt chega como ISO ou null.
export type LandingSummary = {
  raisedCents: number;
  goalCents: number;
  numbersSold: number;
  numbersAvailable: number;
  drawAt: string | null;
  drawPublic: boolean;
  winner: { number: number; firstName: string } | null;
};
export type LandingProps = {
  summary: LandingSummary;
  instagramFather: string;
  instagramMother: string;
};
export default function ReferenceLanding({ summary }: LandingProps) {
  const [amount, setAmount] = useState(campaign.defaultAmount);
  const [menu, setMenu] = useState(false);
  return (
    <div className="ref-site">
      <header className="ref-header">
        <a href="#inicio" aria-label="Início — Formatura do Benjamim">
          <SchoolMark />
        </a>
        <nav aria-label="Navegação principal" className={menu ? 'is-open' : ''}>
          {[
            ['#inicio', 'Início'],
            ['#sobre', 'Sobre'],
            ['#ajudar', 'Como ajudar'],
            ['#kits', 'Kits'],
            ['#contato', 'Contato'],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </a>
          ))}
        </nav>
        <a href="#ajudar" className="ref-header-cta">
          <Heart size={20} /> Quero ajudar
        </a>
        <button
          className="ref-menu"
          aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <main id="conteudo">
        <section className="ref-hero" id="inicio">
          <Image
            className="ref-hero-background"
            src="/images/hero-cenario.webp"
            alt="Composição de formatura baseada na fotografia do Benjamim, com cenário escolar e livros"
            fill
            priority
            sizes="(max-width:760px) 760px, (max-width:1280px) 1280px, 100vw"
          />
          <div className="ref-hero-copy">
            <span className="ref-badge">
              <GraduationCap /> FORMATURA DO ABC
            </span>
            <h1>
              Ajude o<br className="desktop-break" /> Benjamim a celebrar
              <br className="desktop-break" /> sua formatura do ABC
            </h1>
            <p>
              O Benjamim está concluindo uma etapa muito especial na Knox Kids e vamos juntos tornar esse
              momento ainda mais inesquecível!
            </p>
            <span className="ref-handwritten">
              Toda grande conquista
              <br />
              começa com pessoas especiais! <Heart />
            </span>
          </div>
          <GraduationCap className="ref-flying-cap" aria-hidden="true" />
          <Sun className="ref-sun" aria-hidden="true" />
          <span className="ref-abc" aria-hidden="true">
            ABC
          </span>
          <span className="ref-note">
            Obrigado por
            <br />
            fazer parte
            <br />
            dessa jornada! <Heart />
          </span>
          <a className="ref-hero-cta" href="#ajudar">
            <Heart /> Quero ajudar esse sonho <ChevronRight />
          </a>
        </section>
        <div className="ref-content">
          <div className="ref-progress">
            <Progress
              raisedCents={summary.raisedCents}
              goalCents={summary.goalCents}
              winner={summary.drawPublic ? summary.winner : null}
            />
          </div>
          <section className="ref-help" id="ajudar">
            <div className="ref-help-copy">
              <h2>
                <Heart /> Como você pode ajudar?
              </h2>
              <p>
                Escolha números para o sorteio das cestas <b>Boticário</b> ou faça uma colaboração avulsa para
                a formatura do Benjamim. Tudo acontece em modo de demonstração.
              </p>
              <span className="ref-handwritten">
                <GraduationCap /> É uma forma simples, segura e<br />
                afetuosa de fazer parte dessa conquista!
              </span>
              <Star className="ref-help-star" aria-hidden="true" />
            </div>
            <div className="ref-contribution">
              <h3>Escolha seu pacote de números</h3>
              <div className="ref-amounts" role="group" aria-label="Pacote de números">
                {campaign.amounts.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={amount === value}
                    onClick={() => setAmount(value)}
                    className={amount === value ? 'selected' : ''}
                  >
                    <span>{value / 50}</span>
                    <small>números</small>
                    <strong>{money(value)}</strong>
                    {value === 2500 && <em>Valor sugerido</em>}
                  </button>
                ))}
              </div>
              <Link className="ref-yellow-cta" href={`/contribuir?valor=${amount / 100}`}>
                <Heart />
                <span>Quero escolher meus números</span>
                <ChevronRight />
              </Link>
              <Link className="ref-extra-link" href="/contribuir?modalidade=avulsa">
                Prefiro fazer uma colaboração avulsa, sem números
              </Link>
              <div className="ref-pix">
                <PixMark />
                <div>
                  <b>Pedido via Pix</b>
                  <p>Nesta prévia, você pode testar o pagamento simulado.</p>
                  <span>
                    <LockKeyhole size={15} /> Demonstração sem cobrança real
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="ref-kits" id="kits">
            <div className="ref-section-title">
              <Trophy />
              <div>
                <h2>Kits para o sorteio</h2>
                <p>Kits masculino e feminino para celebrar esse momento com nossa família.</p>
              </div>
            </div>
            <div className="ref-kit-grid">
              <article className="ref-kit masculine">
                <div>
                  <h3>
                    Kit Boticário
                    <br />
                    Masculino <Heart />
                  </h3>
                  <p>
                    Perfumes e produtos
                    <br />
                    de cuidados pessoais
                    <br />
                    para o dia a dia.
                  </p>
                </div>
                <div
                  className="ref-kit-photo"
                  role="img"
                  aria-label="Kit Boticário masculino com perfumes e produtos de cuidado pessoal, conforme a referência"
                />
              </article>
              <article className="ref-kit feminine">
                <div>
                  <h3>
                    Kit Boticário
                    <br />
                    Feminino <Heart />
                  </h3>
                  <p>
                    Perfumes e produtos
                    <br />
                    de beleza para
                    <br />
                    momentos especiais.
                  </p>
                </div>
                <div
                  className="ref-kit-photo"
                  role="img"
                  aria-label="Kit Boticário feminino com perfumes e produtos de beleza, conforme a referência"
                />
              </article>
            </div>
            <p className="ref-kit-disclaimer">
              Demonstração do sorteio das cestas masculina e feminina. R$ 5 dão 10 números; são 5.000 números
              em blocos de 100. Nenhuma cobrança ou apuração real acontece nesta prévia.
            </p>
          </section>
          <section className="ref-how" id="sobre">
            <div className="ref-section-title">
              <Settings />
              <h2>Como funciona?</h2>
            </div>
            <div className="ref-how-grid">
              {[
                {
                  icon: MousePointerClick,
                  title: 'Escolha um pacote',
                  text: 'A partir de R$ 5, escolha 10 números. Ou colabore sem números.',
                },
                {
                  icon: WalletIcon,
                  title: 'Escolha seus números',
                  text: 'Use a tabela 10×10 e navegue entre os blocos.',
                },
                {
                  icon: CheckCheck,
                  title: 'Teste o pagamento Pix',
                  text: 'Veja o produto e os números reservados no seu pedido.',
                },
                {
                  icon: Gift,
                  title: 'Receba a confirmação',
                  text: 'Após a aprovação de teste, confira seus números no agradecimento.',
                },
              ].map((item, index) => (
                <article key={item.title}>
                  <span className="ref-how-number">{index + 1}</span>
                  <item.icon />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  {index < 3 && <ChevronRight className="ref-how-arrow" />}
                </article>
              ))}
            </div>
          </section>
          <section className="ref-thanks">
            <div className="ref-thanks-portrait">
              <Image src="/images/benjamim.webp" alt="Fotografia original do Benjamim" fill sizes="200px" />
            </div>
            <div>
              <span className="ref-handwritten">
                Juntos, vamos tornar esse momento inesquecível! <Heart />
              </span>
              <p>
                A formatura do ABC é uma etapa muito especial na vida do Benjamim e a sua colaboração, por
                menor que seja, faz toda a diferença. Obrigado por fazer parte dessa história!
              </p>
            </div>
            <span className="ref-gratitude">
              Gratidão
              <br />a todos! <Heart />
            </span>
          </section>
        </div>
      </main>
      <footer className="ref-footer" id="contato">
        <SchoolMark />
        <div>
          <b>Acompanhe nossa família</b>
          <p>Com carinho, a família do Benjamim.</p>
          <small>Iniciativa independente. A escola não organiza a campanha.</small>
        </div>
        <div>
          <Heart />
          <b>Entre em contato</b>
          <p>
            Fale com a família pessoalmente.
            <br />
            Os perfis serão adicionados aqui.
          </p>
        </div>
        <div>
          <Code />
          <p>
            Site desenvolvido pelo pai,
            <br />
            <b>
              Abner Santos <Heart size={13} />
            </b>
          </p>
        </div>
        <div className="ref-footer-links">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
          <Link href="/admin">Backoffice de demonstração</Link>
        </div>
      </footer>
    </div>
  );
}
function WalletIcon() {
  return <BookOpen />;
}
