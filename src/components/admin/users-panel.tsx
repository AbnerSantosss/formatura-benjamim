'use client';
import { FormEvent, useState } from 'react';
import { Mail, UserCheck, UserPlus, UserX } from 'lucide-react';
import {
  errorMessage,
  fetchAdmins,
  formatDate,
  inviteAdmin,
  resendInvite,
  setAdminActive,
  type AdminRole,
  type AdminUser,
} from '@/lib/admin-client';
import { adminRoleLabels, useAdmin } from './admin-shell';
import ConfirmDialog from './confirm-dialog';
import { useAdminData } from './use-admin-data';

const statusText: Record<AdminUser['status'], { label: string; pill: string }> = {
  invited: { label: 'Convidado', pill: 'pending' },
  active: { label: 'Ativo', pill: 'approved' },
  disabled: { label: 'Desativado', pill: 'expired' },
};

export default function UsersPanel() {
  const me = useAdmin();
  const isOwner = me.role === 'OWNER';
  const { data: users, error, loading, reload } = useAdminData(fetchAdmins);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('ADMIN');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);
  const [deactivatePending, setDeactivatePending] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviting) return;
    setInviting(true);
    setInviteError('');
    setNotice('');
    setActionError('');
    try {
      const result = await inviteAdmin({ name: name.trim(), email: email.trim(), role });
      setName('');
      setEmail('');
      setRole('ADMIN');
      setNotice(
        result.emailSent
          ? `Convite enviado para ${result.admin.name}.`
          : `Convite criado para ${result.admin.name}, mas o e-mail não saiu. Use "Reenviar convite".`,
      );
      reload();
    } catch (issue) {
      setInviteError(errorMessage(issue));
    } finally {
      setInviting(false);
    }
  }

  async function resend(user: AdminUser) {
    setBusyId(user.id);
    setNotice('');
    setActionError('');
    try {
      const result = await resendInvite(user.id);
      if (result.emailSent) setNotice(`Convite reenviado para ${user.name}.`);
      else setActionError('O e-mail do convite não pôde ser enviado agora. Tente de novo em instantes.');
      reload();
    } catch (issue) {
      setActionError(errorMessage(issue));
    } finally {
      setBusyId('');
    }
  }

  async function reactivate(user: AdminUser) {
    setBusyId(user.id);
    setNotice('');
    setActionError('');
    try {
      await setAdminActive(user.id, true);
      setNotice(`Acesso de ${user.name} reativado.`);
      reload();
    } catch (issue) {
      setActionError(errorMessage(issue));
    } finally {
      setBusyId('');
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    setDeactivatePending(true);
    setDeactivateError('');
    try {
      await setAdminActive(deactivating.id, false);
      setNotice(`Acesso de ${deactivating.name} desativado.`);
      setDeactivating(null);
      reload();
    } catch (issue) {
      setDeactivateError(errorMessage(issue));
    } finally {
      setDeactivatePending(false);
    }
  }

  function openDeactivate(user: AdminUser) {
    setDeactivateError('');
    setNotice('');
    setActionError('');
    setDeactivating(user);
  }

  return (
    <div className="admin-stack">
      <form className="admin-panel" onSubmit={invite}>
        <span className="panel-icon">
          <UserPlus />
        </span>
        <h2>Convidar</h2>
        <p>
          A pessoa recebe um e-mail com um link para criar a própria senha. Seu papel:{' '}
          <b>{adminRoleLabels[me.role]}</b>.
          {!isOwner && ' Só o proprietário convida outro proprietário e desativa acessos.'}
        </p>
        <div className="admin-form-row">
          <label className="admin-field">
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              maxLength={120}
              required
            />
          </label>
          <label className="admin-field">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              maxLength={254}
              required
            />
          </label>
          <label className="admin-field">
            Papel
            <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
              <option value="ADMIN">{adminRoleLabels.ADMIN}</option>
              {isOwner && <option value="OWNER">{adminRoleLabels.OWNER}</option>}
            </select>
          </label>
        </div>
        {inviteError && (
          <p className="form-error" role="alert">
            {inviteError}
          </p>
        )}
        <button type="submit" className="button button-small" disabled={inviting}>
          {inviting ? 'Enviando…' : 'Enviar convite'}
        </button>
      </form>

      <section className="admin-panel records-panel">
        <div className="records-heading">
          <div>
            <h2>Usuários do painel</h2>
            <p>Quem pode entrar no backoffice da campanha.</p>
          </div>
        </div>
        {notice && (
          <p className="admin-notice admin-records-message" role="status">
            {notice}
          </p>
        )}
        {(actionError || error) && (
          <p className="form-error admin-records-message" role="alert">
            {actionError || error}{' '}
            {!actionError && (
              <button type="button" className="admin-link-button" onClick={reload}>
                Tentar de novo
              </button>
            )}
          </p>
        )}
        {!users ? (
          !error && <p className="admin-loading-inline">Carregando usuários…</p>
        ) : (
          <div className={`records-table${loading ? ' admin-busy' : ''}`} aria-busy={loading}>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th>Desde</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isMe = user.email === me.email;
                  const busy = busyId === user.id;
                  // Só o proprietário mexe em convite de proprietário; só ele desativa e reativa.
                  const canResend = user.status === 'invited' && (isOwner || user.role !== 'OWNER');
                  const canDeactivate = isOwner && !isMe && user.status !== 'disabled';
                  const canReactivate = isOwner && user.status === 'disabled';
                  return (
                    <tr key={user.id}>
                      <td data-label="Nome">
                        <b>
                          {user.name}
                          {isMe ? ' (você)' : ''}
                        </b>
                        <small>{user.email}</small>
                      </td>
                      <td data-label="Papel">{adminRoleLabels[user.role]}</td>
                      <td data-label="Status">
                        <span className={`status-pill ${statusText[user.status].pill}`}>
                          {statusText[user.status].label}
                        </span>
                      </td>
                      <td data-label="Desde">{formatDate(user.acceptedAt ?? user.createdAt)}</td>
                      <td data-label="Ações">
                        <div className="record-actions admin-record-actions">
                          {canResend && (
                            <button type="button" onClick={() => resend(user)} disabled={busy}>
                              <Mail size={15} /> Reenviar convite
                            </button>
                          )}
                          {canDeactivate && (
                            <button type="button" onClick={() => openDeactivate(user)} disabled={busy}>
                              <UserX size={15} /> Desativar
                            </button>
                          )}
                          {canReactivate && (
                            <button type="button" onClick={() => reactivate(user)} disabled={busy}>
                              <UserCheck size={15} /> Reativar
                            </button>
                          )}
                          {!canResend && !canDeactivate && !canReactivate && <span>—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="records-footer">{users ? `${users.length} usuário(s)` : ' '}</div>
      </section>

      {deactivating && (
        <ConfirmDialog
          title="Desativar este acesso?"
          confirmLabel="Sim, desativar"
          pendingLabel="Desativando…"
          danger
          pending={deactivatePending}
          error={deactivateError}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivating(null)}
        >
          <p>
            <b>{deactivating.name}</b> ({deactivating.email}) deixa de entrar no painel e as sessões abertas
            são encerradas.
          </p>
          <p>O acesso pode ser reativado depois por um proprietário.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
