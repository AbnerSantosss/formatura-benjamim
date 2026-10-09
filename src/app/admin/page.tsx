import { redirect } from 'next/navigation';
import AdminShell from '@/components/admin/admin-shell';
import LoginForm from '@/components/admin/login-form';
import Backoffice from '@/components/backoffice';
import { getAdminOrNull } from '@/server/auth/require-admin';
import { isDemo } from '@/server/env';

export const metadata = { title: 'Backoffice · Formatura do Benjamim' };

/** Só aceita destino interno do painel (`/admin/...`); qualquer outra coisa cai em `/admin`. */
function safeNext(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!/^\/admin(\/[A-Za-z0-9\-._~/]*)?$/.test(value) || value.includes('//')) return undefined;
  return value;
}

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const auth = await getAdminOrNull();
  if (!auth) return <LoginForm next={safeNext((await searchParams).next)} />;
  if (auth.admin.mustChangePassword) redirect('/admin/trocar-senha');
  const { name, email, role } = auth.admin;
  return (
    <AdminShell admin={{ name, email, role }}>
      <Backoffice isDemo={isDemo} />
    </AdminShell>
  );
}
