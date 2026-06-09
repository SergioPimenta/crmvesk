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

type UserForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  active: boolean;
};

const emptyForm = (): UserForm => ({
  name: '',
  email: '',
  password: '',
  role: 'user',
  active: true,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<CrmUser[]>('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser?.role === 'admin') {
      void loadUsers();
    }
  }, [authUser?.role, loadUsers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || roleLabel(u.role).toLowerCase().includes(q)
    );
  }, [users, query]);

  const openCreate = () => {
    setForm(emptyForm());
    setIsCreateOpen(true);
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
      active: u.active,
    });
    setIsEditOpen(true);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await api.post<CrmUser>('/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      setUsers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setIsCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar usuário');
    } finally {
      setSaving(false);
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
        active: form.active,
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
            Gerencie contas de acesso ao CRM
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
          <button type="button" className="crm-btn-primary" onClick={openCreate}>
            <i className="ti ti-user-plus" style={{ fontSize: 13 }} aria-hidden="true" />
            Novo usuário
          </button>
        </div>
      </div>

      {error ? (
        <div className="integration-hint" style={{ marginBottom: 12, borderColor: '#e0525240', color: '#e05252' }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          <span>{error}</span>
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
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
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
        open={isCreateOpen}
        title="Novo usuário"
        description="Cadastre um usuário com acesso ao CRM. Um funil padrão será criado automaticamente."
        onClose={() => setIsCreateOpen(false)}
      >
        <form className="crm-form" onSubmit={createUser}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="u_nome">Nome</label>
            <input
              id="u_nome"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              autoComplete="name"
            />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="u_email">E-mail</label>
            <input
              id="u_email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
              autoComplete="off"
            />
          </div>
          <div className="crm-field">
            <label htmlFor="u_senha">Senha</label>
            <input
              id="u_senha"
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="crm-field">
            <label htmlFor="u_role">Perfil</label>
            <select id="u_role" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="crm-btn-secondary" onClick={() => setIsCreateOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }} disabled={saving}>
              {saving ? 'Salvando…' : 'Cadastrar usuário'}
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
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="eu_active" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                id="eu_active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                disabled={editingId === authUser?.id && form.active}
              />
              Usuário ativo
            </label>
            <span style={{ fontSize: 11, color: 'var(--vesk-muted)', marginTop: 4, display: 'block' }}>
              Use o toggle na listagem para ativar ou inativar rapidamente.
            </span>
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
