import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('vesk-app');
    return () => document.body.classList.remove('vesk-app');
  }, []);

  useEffect(() => {
    if (user) {
      navigate('/admin', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post<{ token: string; user: { id: number; email: string; name: string; role: string } }>(
        '/auth/login',
        { email, password }
      );

      login(response.token, response.user);
      navigate('/admin');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao efetuar login';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="vesk-login-page">
      <div className="vesk-login-card">
        <div className="vesk-login-header">
          <div className="vesk-login-logo">
            <i className="ti ti-bolt" style={{ color: 'var(--vesk-orange)', fontSize: 24 }} aria-hidden="true" />
            VESK <span>CR</span>
          </div>
          <p className="vesk-login-sub">Entre com suas credenciais para acessar o painel</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && <div className="vesk-login-error">{error}</div>}

          <div className="vesk-field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="vesk-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={isLoading} className="crm-btn-primary vesk-login-submit">
            {isLoading ? (
              <span className="vesk-spinner" aria-label="Carregando" />
            ) : (
              <>
                <i className="ti ti-login" style={{ fontSize: 14 }} aria-hidden="true" />
                Entrar no painel
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
