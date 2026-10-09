import { redirect } from 'next/navigation';
import { LoginFrame } from '@/components/admin/login-form';
import PasswordForm from '@/components/admin/password-form';
import { getAdminOrNull } from '@/server/auth/require-admin';

export const metadata = { title: 'Trocar senha · Formatura do Benjamim' };

export default async function TrocarSenha() {
  const auth = await getAdminOrNull();
  if (!auth) redirect('/admin');
  return (
    <LoginFrame>
      <PasswordForm
        mode="change"
        intro={
          auth.admin.mustChangePassword
            ? 'Sua senha é temporária. Defina uma nova para continuar.'
            : undefined
        }
      />
    </LoginFrame>
  );
}
