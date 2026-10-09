'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { postAuth } from './login-form';

type Mode = 'reset' | 'invite' | 'change';

type Props = {
  mode: Mode;
  /** Token do link (modos `reset` e `invite`). */
  token?: string;
  /** Nome pré-preenchido (modo `invite`). */
  name?: string;
  /** Texto abaixo do título; cada modo tem um padrão. */
  intro?: string;
};

const POLICY_HINT = 'Use pelo menos 10 caracteres, com letra e número.';

/**
 * Mesma política de `passwordPolicy` (src/server/auth/password.ts), repetida aqui para o
 * formulário avisar antes de enviar. Quem decide é o servidor.
 */
function policyError(password: string): string {
  if (password.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (password.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/\p{L}/u.test(password)) return 'A senha precisa ter pelo menos uma letra.';
  if (!/\d/.test(password)) return 'A senha precisa ter pelo menos um número.';
  return '';
}

const copy: Record<Mode, { chip: string; title: string; intro: string; submit: string }> = {
  reset: {
    chip: 'BACKOFFICE · NOVA SENHA',
    title: 'Defina uma nova senha.',
    intro: 'Escolha a senha que você vai usar para entrar no painel.',
    submit: 'Salvar nova senha',
  },
  invite: {
    chip: 'BACKOFFICE · CONVITE',
    title: 'Que bom ter você aqui.',
    intro: 'Confira seu nome e defina uma senha para entrar no painel.',
    submit: 'Criar acesso e entrar',
  },
  change: {
    chip: 'BACKOFFICE · NOVA SENHA',
    title: 'Defina uma nova senha.',
    intro: 'Informe a senha atual e escolha uma nova.',
    submit: 'Salvar e continuar',
  },
};

export default function PasswordForm({ mode, token, name, intro }: Props) {
  const router = useRouter();
  const text = copy[mode];
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const fullName = String(fields.get('name') ?? '').trim();
    const currentPassword = String(fields.get('currentPassword') ?? '');
    const password = String(fields.get('password') ?? '');
    const confirmation = String(fields.get('confirmation') ?? '');

    const problem =
      (mode === 'invite' && fullName.length < 2 && 'Informe seu nome.') ||
      policyError(password) ||
      (password !== confirmation && 'A confirmação não é igual à nova senha.') ||
      (mode === 'change' && password === currentPassword && 'A nova senha precisa ser diferente da atual.');
    if (problem) {
      setError(problem);
      return;
    }

    setPending(true);
    setError('');
    const result =
      mode === 'reset'
        ? await postAuth('redefinir', { token, password })
        : mode === 'invite'
          ? await postAuth('aceitar-convite', { token, name: fullName, password })
          : await postAuth('trocar-senha', { currentPassword, newPassword: password });
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    if (mode === 'reset') {
      setDone(true);
      setPending(false);
      return;
    }
    // Convite e troca já terminam com sessão válida.
    router.replace('/admin');
    router.refresh();
  }

  if (done)
    return (
      <div className="login-card">
        <span className="demo-chip">{text.chip}</span>
        <h2>Tudo certo.</h2>
        <p role="status">Senha redefinida. Entre com a nova senha.</p>
        <Link href="/admin" className="button wide">
          Ir para o login
        </Link>
      </div>
    );

  const toggle = (
    <button
      type="button"
      aria-label={showPassword ? 'Ocultar senhas' : 'Mostrar senhas'}
      onClick={() => setShowPassword(!showPassword)}
    >
      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  );
  const passwordType = showPassword ? 'text' : 'password';

  return (
    <form className="login-card" onSubmit={submit} noValidate>
      <span className="demo-chip">{text.chip}</span>
      <h2>{text.title}</h2>
      <p>{intro ?? text.intro}</p>
      {mode === 'invite' && (
        <label>
          Nome
          <input name="name" autoComplete="name" defaultValue={name} maxLength={120} required />
        </label>
      )}
      {mode === 'change' && (
        <label>
          Senha atual
          <div className="password-field">
            <input
              name="currentPassword"
              type={passwordType}
              autoComplete="current-password"
              placeholder="Sua senha atual"
              required
            />
            {toggle}
          </div>
        </label>
      )}
      <label>
        Nova senha
        <div className="password-field">
          <input
            name="password"
            type={passwordType}
            autoComplete="new-password"
            placeholder="Sua nova senha"
            aria-describedby="password-hint"
            required
          />
          {toggle}
        </div>
        <small id="password-hint" className="login-hint">
          {POLICY_HINT}
        </small>
      </label>
      <label>
        Confirme a nova senha
        <div className="password-field">
          <input
            name="confirmation"
            type={passwordType}
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            required
          />
          {toggle}
        </div>
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" className="button wide" disabled={pending}>
        {pending ? 'Salvando…' : text.submit}
      </button>
      {mode === 'reset' && <Link href="/admin">Voltar ao login</Link>}
    </form>
  );
}
