import Link from 'next/link';
import { LoginFrame } from '@/components/admin/login-form';
import PasswordForm from '@/components/admin/password-form';
import { peekToken } from '@/server/auth/tokens';
import { prisma } from '@/server/db';

export const metadata = { title: 'Convite · Formatura do Benjamim' };
// O link identifica uma pessoa e vale uma vez só: sempre conferido na hora, nunca em cache.
export const dynamic = 'force-dynamic';

/** Convite vale para admin ativo que ainda não tem senha. Devolve o nome, ou `null` se inválido. */
async function invitedName(token: string): Promise<string | null> {
  try {
    const adminId = await peekToken(token, 'INVITE');
    const user = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { name: true, disabledAt: true, passwordHash: true },
    });
    if (!user || user.disabledAt !== null || user.passwordHash !== null) return null;
    return user.name;
  } catch {
    return null;
  }
}

export default async function Convite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const name = await invitedName(token);
  if (name === null)
    return (
      <LoginFrame>
        <div className="login-card">
          <span className="demo-chip">BACKOFFICE · CONVITE</span>
          <h2>Link inválido ou expirado</h2>
          <p>Este convite já foi usado ou passou do prazo. Peça um novo convite ao administrador.</p>
          <Link href="/admin">Voltar ao login</Link>
        </div>
      </LoginFrame>
    );
  return (
    <LoginFrame>
      <PasswordForm mode="invite" token={token} name={name} />
    </LoginFrame>
  );
}
