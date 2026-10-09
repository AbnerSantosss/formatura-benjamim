'use client';
import { FormEvent, ReactNode, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, GraduationCap, Heart } from 'lucide-react';

export type AuthResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

/**
 * POST em `/api/admin/auth/<rota>`. Nunca lança: falha de rede e resposta de erro viram
 * `{ ok: false, message }` com a mensagem pronta para a tela. As rotas exigem mesma origem,
 * que o navegador envia no cabeçalho `Origin`.
 */
export async function postAuth<T = unknown>(route: string, body?: unknown): Promise<AuthResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/auth/${route}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK', message: 'Sem conexão. Tente novamente.' };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok) return { ok: true, data: (payload ?? {}) as T };
  return {
    ok: false,
    status: response.status,
    code: typeof payload?.code === 'string' ? payload.code : 'UNKNOWN',
    message:
      typeof payload?.message === 'string'
        ? payload.message
        : 'Não foi possível concluir agora. Tente novamente.',
  };
}

/** Moldura das telas de acesso do painel: coluna de história à esquerda e o card à direita. */
export function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <main id="conteudo" className="admin-login">
      <div className="login-story">
        <Link href="/" className="admin-brand">
          <GraduationCap /> Benjamim<span>FORMATURA DO ABC</span>
        </Link>
        <div>
          <span className="eyebrow">CADA GESTO CONTA</span>
          <h1>
            Uma grande conquista.
            <br />
            <em>Muitos pequenos carinhos.</em>
          </h1>
          <p>Acompanhe as contribuições e cuide de cada detalhe dessa história especial.</p>
          <Heart size={74} />
        </div>
        <small>Iniciativa da família · Formatura do Benjamim</small>
      </div>
      <div className="login-side">{children}</div>
    </main>
  );
}

type LoginResponse = { admin: { mustChangePassword: boolean } };

/** `next`: destino depois do login, já validado pelo servidor (caminho interno de `/admin`). */
export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    const result = await postAuth<LoginResponse>('login', {
      email: String(fields.get('email') ?? ''),
      password: String(fields.get('password') ?? ''),
      remember: fields.get('remember') === 'on',
    });
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    router.replace(result.data.admin?.mustChangePassword ? '/admin/trocar-senha' : (next ?? '/admin'));
    router.refresh();
  }

  return (
    <LoginFrame>
      <form className="login-card" onSubmit={login}>
        <span className="demo-chip">BACKOFFICE · DEMONSTRAÇÃO</span>
        <h2>Que bom ter você aqui.</h2>
        <p>Entre para conhecer o painel da campanha.</p>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" placeholder="Seu e-mail" required />
        </label>
        <label>
          Senha
          <div className="password-field">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Sua senha"
              required
            />
            <button
              type="button"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </label>
        <div className="login-options">
          <label>
            <input name="remember" type="checkbox" /> Lembrar de mim
          </label>
          <Link href="/admin/esqueci-senha">Esqueci minha senha</Link>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="button wide" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar no painel'}
        </button>
        <Link href="/">Voltar à campanha</Link>
      </form>
    </LoginFrame>
  );
}

/** Formulário de "esqueci minha senha". A resposta é a mesma, exista ou não o e-mail. */
export function ForgotPasswordForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    const result = await postAuth('esqueci-senha', { email: String(fields.get('email') ?? '') });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  }

  return (
    <LoginFrame>
      <form className="login-card" onSubmit={submit}>
        <span className="demo-chip">BACKOFFICE · RECUPERAR ACESSO</span>
        <h2>Esqueceu a senha?</h2>
        <p>Informe o e-mail do seu acesso e enviaremos um link para definir uma nova senha.</p>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" placeholder="Seu e-mail" required />
        </label>
        {sent && (
          <p role="status" className="admin-notice">
            Se este e-mail estiver cadastrado, enviamos um link. Verifique também o spam.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="button wide" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar link'}
        </button>
        <Link href="/admin">Voltar ao login</Link>
      </form>
    </LoginFrame>
  );
}
