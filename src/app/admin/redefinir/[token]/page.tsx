import Link from 'next/link';
import { LoginFrame } from '@/components/admin/login-form';
import PasswordForm from '@/components/admin/password-form';
import { peekToken } from '@/server/auth/tokens';
import { prisma } from '@/server/db';

export const metadata = { title: 'Redefinir senha · Formatura do Benjamim' };
// O link identifica uma pessoa e vale uma vez só: sempre conferido na hora, nunca em cache.
export const dynamic = 'force-dynamic';

/** Link de redefinição vale para admin ativo que já tem senha. Qualquer falha vira "inválido". */
async function isValidReset(token: string): Promise<boolean> {
  try {
    const adminId = await peekToken(token, 'RESET');
    const user = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { disabledAt: true, passwordHash: true },
    });
    return !!user && user.disabledAt === null && user.passwordHash !== null;
  } catch {
    return false;
  }
}

export default async function Redefinir({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isValidReset(token)))
    return (
      <LoginFrame>
        <div className="login-card">
          <span className="demo-chip">BACKOFFICE · NOVA SENHA</span>
          <h2>Link inválido ou expirado</h2>
          <p>Este link já foi usado ou passou do prazo de 1 hora. Peça um novo para definir sua senha.</p>
          <Link href="/admin/esqueci-senha" className="button wide">
            Pedir novo link
          </Link>
          <Link href="/admin">Voltar ao login</Link>
        </div>
      </LoginFrame>
    );
  return (
    <LoginFrame>
      <PasswordForm mode="reset" token={token} />
    </LoginFrame>
  );
}
