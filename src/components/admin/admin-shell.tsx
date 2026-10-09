'use client';
import { ReactNode, createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { postAuth } from './login-form';

export type ShellAdmin = { name: string; email: string; role: 'OWNER' | 'ADMIN' };

const roleLabels: Record<ShellAdmin['role'], string> = { OWNER: 'Proprietário', ADMIN: 'Administrador' };

type ShellContext = { admin: ShellAdmin; loggingOut: boolean; logout: () => void };

const AdminShellContext = createContext<ShellContext | null>(null);

function useAdminShell(): ShellContext {
  const value = useContext(AdminShellContext);
  if (!value) throw new Error('Este componente precisa estar dentro de <AdminShell>.');
  return value;
}

/**
 * Casca do painel autenticado: entrega o admin logado e o "Sair" para a sidebar e a topbar,
 * que continuam desenhadas em `backoffice.tsx` (`AdminLogoutButton` e `AdminAccount`).
 */
export default function AdminShell({ admin, children }: { admin: ShellAdmin; children: ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await postAuth('logout');
    // Com ou sem sucesso, o servidor decide o que mostrar: o login, se a sessão acabou.
    router.refresh();
    setLoggingOut(false);
  }

  return (
    <AdminShellContext.Provider value={{ admin, loggingOut, logout }}>{children}</AdminShellContext.Provider>
  );
}

/** Botão "Sair" da sidebar. */
export function AdminLogoutButton() {
  const { loggingOut, logout } = useAdminShell();
  return (
    <button type="button" onClick={logout} disabled={loggingOut}>
      <LogOut size={17} /> {loggingOut ? 'Saindo…' : 'Sair'}
    </button>
  );
}

/** Bloco da conta na topbar: inicial, nome e papel do admin logado. */
export function AdminAccount() {
  const { admin } = useAdminShell();
  return (
    <div className="admin-account">
      <span>{admin.name.trim().charAt(0).toUpperCase() || 'A'}</span>
      <b>
        {admin.name}
        <small>{roleLabels[admin.role]}</small>
      </b>
    </div>
  );
}
