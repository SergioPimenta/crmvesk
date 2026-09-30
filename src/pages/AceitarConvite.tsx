import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

type InviteInfo = {
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: string;
  accountName: string;
};

const roleLabel = (role: string) => (role === 'admin' ? 'Administrador' : 'Usuário');

const AceitarConvite = () => {
  const { token } = useParams<{ token: string }>();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.classList.add('vesk-app');
    return () => document.body.classList.remove('vesk-app');
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const data = await api.get<InviteInfo>(`/invites/${token}`);
        setInvite(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Convite não encontrado');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      setSubmitError('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('As senhas não coincidem');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await api.post<{ token: string; user: { id: number; email: string; name: string; role: string } }>(
        `/invites/${token}/accept`,
        { password }
      );
      login(response.token, response.user);
      navigate('/admin', { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao aceitar convite');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="vesk-login-page">
      <div className="vesk-login-shell">
        <aside className="vesk-login-marketing">
          <div className="vesk-login-marketing-glow" aria-hidden="true" />
          <div className="vesk-login-marketing-grid" aria-hidden="true" />
          <div className="vesk-login-marketing-inner">
            <div className="vesk-login-brand">
              <img src="/logo-mark.svg" className="vesk-login-brand-logo" alt="" aria-hidden="true" />
              <span>
                VESK <b>CRM</b>
              </span>
            </div>
            <h1 className="vesk-login-headline">
              Você foi convidado para acessar o <span>painel da equipe</span>
            </h1>
            <p className="vesk-login-tagline">
              Defina sua senha para ver os mesmos leads, pipeline, relatórios e conversas de WhatsApp.
            </p>
          </div>
        </aside>

        <main className="vesk-login-formside">
          <div className="vesk-login-card">
            <div className="vesk-login-header">
              <img src="/logo-mark.svg" className="vesk-login-logo-img" alt="" aria-hidden="true" />
              <h2 className="vesk-login-welcome">Aceitar convite</h2>
              {invite ? (
                <p className="vesk-login-sub">
                  {invite.accountName} convidou <strong>{invite.email}</strong> como {roleLabel(invite.role)}
                </p>
              ) : (
                <p className="vesk-login-sub">Crie sua senha de acesso</p>
              )}
            </div>

            {loading ? (
              <div className="kanban-empty" style={{ padding: 24 }}>
                Carregando convite…
              </div>
            ) : loadError ? (
              <div className="vesk-login-error">{loadError}</div>
            ) : invite && invite.status !== 'pending' ? (
              <div className="vesk-login-error">Este convite já foi utilizado ou foi cancelado.</div>
            ) : (
              <form onSubmit={handleSubmit}>
                {submitError && <div className="vesk-login-error">{submitError}</div>}

                <div className="vesk-field">
                  <label htmlFor="ac_nome">Nome</label>
                  <input id="ac_nome" value={invite?.name ?? ''} disabled />
                </div>

                <div className="vesk-field">
                  <label htmlFor="ac_email">E-mail</label>
                  <input id="ac_email" value={invite?.email ?? ''} disabled />
                </div>

                <div className="vesk-field">
                  <label htmlFor="ac_senha">Crie uma senha</label>
                  <input
                    id="ac_senha"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="vesk-field">
                  <label htmlFor="ac_senha2">Confirme a senha</label>
                  <input
                    id="ac_senha2"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <button type="submit" disabled={submitting} className="crm-btn-primary vesk-login-submit">
                  {submitting ? (
                    <span className="vesk-spinner" aria-label="Carregando" />
                  ) : (
                    <>
                      <i className="ti ti-check" style={{ fontSize: 14 }} aria-hidden="true" />
                      Criar conta e entrar
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AceitarConvite;
