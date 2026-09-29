import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import CrmLayout from '../components/crm/CrmLayout';
import Modal from '../components/crm/Modal';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

type UserRole = 'admin' | 'user';

type CrmUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt?: string;
};

type CrmInvite = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  expiresAt?: string;
  createdAt?: string;
};

type InviteForm = {
  name: string;
  email: string;
  role: UserRole;
};

type UserForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

const emptyInviteForm = (): InviteForm => ({ name: '', email: '', role: 'user' });

const emptyForm = (): UserForm => ({
  name: '',
  email: '',
  password: '',
  role: 'user',
});

const roleLabel = (role: UserRole) => (role === 'admin' ? 'Administrador' : 'Usuário');

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Usuarios = () => {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [invites, setInvites] = useState<CrmInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm());
  const [inviting, setInviting] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm());

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersData, invitesData] = await Promise.all([
        api.get<CrmUser[]>('/users'),
        api.get<CrmInvite[]>('/invites'),
      ]);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setInvites(Array.isArray(invitesData) ? invitesData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
      setUsers([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      void loadAll();
    }
  }, [authUser?.role, loadAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || roleLabel(u.role).toLowerCase().includes(q)
    );
  }, [users, query]);

  const openInvite = () => {
    setInviteForm(emptyInviteForm());
    setNotice('');
    setIsInviteOpen(true);
  };

  const openEdit = (id: number) => {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    setEditingId(id);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
    });
    setIsEditOpen(true);
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post<{ invite: CrmInvite; emailSent: boolean; emailError?: string }>('/invites', {
        name: inviteForm.name.trim(),
        email: inviteForm.email.trim(),
        role: inviteForm.role,
      });
      setInvites((prev) => [result.invite, ...prev.filter((i) => i.email !== result.invite.email)]);
      setIsInviteOpen(false);
      setNotice(
        result.emailSent
          ? `Convite enviado por e-mail para ${result.invite.email}.`
          : `Convite criado para ${result.invite.email}, mas o e-mail não pôde ser enviado (${result.emailError ?? 'verifique a configuração de SMTP'}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar convite');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (invite: CrmInvite) => {
    if (!window.confirm(`Cancelar o convite enviado para "${invite.email}"?`)) return;
    setRevokingId(invite.id);
    setError('');
    try {
      await api.delete(`/invites/${invite.id}`);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar convite');
    } finally {
      setRevokingId(null);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      };
      if (form.password.trim()) {
        payload.password = form.password;
      }

      const updated = await api.put<CrmUser>(`/users/${editingId}`, payload);
      setUsers((prev) =>
        prev
          .map((u) => (u.id === editingId ? updated : u))
          .sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            return a.name.localeCompare(b.name, 'pt-BR');
          })
      );

      setIsEditOpen(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar usuário');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: CrmUser, nextActive: boolean) => {
    if (user.id === authUser?.id && !nextActive) return;

    setTogglingId(user.id);
    setError('');
    try {
      const updated = await api.patch<CrmUser>(`/users/${user.id}/active`, { active: nextActive });
      setUsers((prev) =>
        prev
          .map((u) => (u.id === user.id ? updated : u))
          .sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            return a.name.localeCompare(b.name, 'pt-BR');
          })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status do usuário');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (user: CrmUser) => {
    if (user.id === authUser?.id) return;
    if (!window.confirm(`Excluir o usuário "${user.name}"? Esta ação não pode ser desfeita.`)) return;

    setDeletingId(user.id);
    setError('');
    try {
      await api.delete(`/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário');
    } finally {
      setDeletingId(null);
    }
  };

  if (authUser?.role !== 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Usuários <span>({filtered.length})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Convide sua equipe para acessar os mesmos leads, pipeline, relatórios e conversas de WhatsApp
          </div>
        </div>
        <div className="crm-page-actions">
          <div className="crm-inline-search" role="search">
            <i className="ti ti-search si" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              aria-label="Buscar usuários"
            />
          </div>
          <button type="button" className="crm-btn-primary" onClick={openInvite}>
            <i className="ti ti-user-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Convidar usuário
          </button>
        </div>
      </div>

      {notice ? (
        <div className="integration-hint" style={{ marginBottom: 12 }}>
          <i className="ti ti-mail-check" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {error ? (
        <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {invites.length > 0 ? (
        <div className="crm-card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--vesk-border, #26262a)' }}>
            Convites pendentes ({invites.length})
          </div>
          <table className="crm-table" aria-label="Convites pendentes">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Expira em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600 }}>{inv.name}</td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{inv.email}</td>
                  <td>
                    <span className={`pill-status ${inv.role === 'admin' ? 'ok' : ''}`}>{roleLabel(inv.role)}</span>
                  </td>
                  <td style={{ color: 'var(--vesk-muted)' }}>{formatDate(inv.expiresAt)}</td>
                  <td>
                    <div className="crm-row-actions">
                      <button
                        type="button"
                        className="crm-action-btn crm-action-btn-danger"
                        onClick={() => void handleRevoke(inv)}
                        disabled={revokingId === inv.id}
                        aria-label={`Cancelar convite de ${inv.name}`}
                      >
                        <i className="ti ti-x" aria-hidden="true" />
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="crm-card">
        {loading ? (
          <div className="kanban-empty" style={{ padding: 24 }}>
            Carregando usuários…
          </div>
        ) : (
          <table className="crm-table" aria-label="Lista de usuários">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Cadastro</th>
                <th>Ativo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isSelf = u.id === authUser?.id;
                const toggleDisabled = togglingId === u.id || (isSelf && u.active);

                return (
                  <tr key={u.id} className={u.active ? undefined : 'crm-user-row-inactive'}>
                    <td style={{ fontWeight: 600 }}>
                      {u.name}
                      {isSelf ? <span style={{ color: 'var(--vesk-muted)', fontWeight: 400 }}> (você)</span> : null}
                    </td>
                    <td style={{ color: 'var(--vesk-muted)' }}>{u.email}</td>
                    <td>
                      <span className={`pill-status ${u.role === 'admin' ? 'ok' : ''}`}>{roleLabel(u.role)}</span>
                    </td>
                    <td style={{ color: 'var(--vesk-muted)' }}>{formatDate(u.createdAt)}</td>
                    <td>
                      <label className="crm-switch" title={u.active ? 'Usuário ativo' : 'Usuário inativo'}>
                        <input
                          type="checkbox"
                          checked={u.active}
                          disabled={toggleDisabled}
                          onChange={(e) => void toggleActive(u, e.target.checked)}
                          aria-label={u.active ? `Desativar ${u.name}` : `Ativar ${u.name}`}
                        />
                        <span className="crm-switch-slider" aria-hidden="true" />
                      </label>
                    </td>
                    <td>
                      <div className="crm-row-actions">
                        <button type="button" className="crm-action-btn" onClick={() => openEdit(u.id)} aria-label={`Editar ${u.name}`}>
                          <i className="ti ti-pencil" aria-hidden="true" />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="crm-action-btn crm-action-btn-danger"
                          onClick={() => void handleDelete(u)}
                          disabled={isSelf || deletingId === u.id}
                          aria-label={`Excluir ${u.name}`}
                          title={isSelf ? 'Você não pode excluir sua própria conta' : 'Excluir usuário'}
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--vesk-muted)', padding: 14 }}>
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={isInviteOpen}
        title="Convidar usuário"
        description="Enviamos um e-mail com um link para a pessoa criar a própria senha. Ela passa a ver os mesmos leads, pipeline, relatórios e conversas de WhatsApp desta conta."
        onClose={() => setIsInviteOpen(false)}
      >
        <form className="crm-form" onSubmit={sendInvite}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="i_nome">Nome</label>
            <input
              id="i_nome"
              value={inviteForm.name}
              onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))}
              required
              autoComplete="name"
            />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="i_email">E-mail</label>
            <input
              id="i_email"
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
              required
              autoComplete="off"
            />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="i_role">Perfil</label>
            <select
              id="i_role"
              value={inviteForm.role}
              onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value as UserRole }))}
            >
              <option value="user">Usuário (acesso total, exceto gerenciar usuários)</option>
              <option value="admin">Administrador (pode convidar e gerenciar usuários)</option>
            </select>
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsInviteOpen(false)} disabled={inviting}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }} disabled={inviting}>
              {inviting ? 'Enviando…' : 'Enviar convite'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isEditOpen}
        title="Editar usuário"
        description="Atualize os dados do usuário. Deixe a senha em branco para mantê-la."
        onClose={() => setIsEditOpen(false)}
      >
        <form className="crm-form" onSubmit={saveEdit}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="eu_nome">Nome</label>
            <input
              id="eu_nome"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              autoComplete="name"
            />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="eu_email">E-mail</label>
            <input
              id="eu_email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
              autoComplete="off"
            />
          </div>
          <div className="crm-field">
            <label htmlFor="eu_senha">Nova senha</label>
            <input
              id="eu_senha"
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Opcional"
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="crm-field">
            <label htmlFor="eu_role">Perfil</label>
            <select id="eu_role" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsEditOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </Modal>
    </CrmLayout>
  );
};

export default Usuarios;
