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
    if (sessionStorage.getItem('session_expired')) {
      sessionStorage.removeItem('session_expired');
      setError('Sua sessão expirou. Faça login novamente.');
    }
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

  const features = [
    {
      icon: 'ti-brand-whatsapp',
      title: 'WhatsApp oficial (Meta API)',
      desc: 'Envie e receba mensagens, áudios e mídia direto do CRM',
    },
    {
      icon: 'ti-trending-up',
      title: 'Pipeline visual de vendas',
      desc: 'Funis personalizáveis em formato kanban, por etapa',
    },
    {
      icon: 'ti-broadcast',
      title: 'Disparos em massa segmentados',
      desc: 'Grupos de contatos e modelos aprovados pela Meta',
    },
    {
      icon: 'ti-bell-ringing',
      title: 'Notificações em tempo real',
      desc: 'No navegador e no celular, via app instalável',
    },
    {
      icon: 'ti-device-mobile-down',
      title: 'Aplicativo instalável (PWA)',
      desc: 'Acesse do computador ou celular como um app nativo',
    },
    {
      icon: 'ti-chart-bar',
      title: 'Dashboard de métricas',
      desc: 'Conversão, funil e desempenho em um só lugar',
    },
  ];

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
              O CRM completo para vender mais pelo <span>WhatsApp</span>
            </h1>
            <p className="vesk-login-tagline">
              Contatos, funil de vendas e conversas do WhatsApp — tudo em um só lugar, com a API
              oficial da Meta.
            </p>

            <ul className="vesk-login-features">
              {features.map((f) => (
                <li key={f.title}>
                  <span className="vesk-login-feature-icon">
                    <i className={`ti ${f.icon}`} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{f.title}</strong>
                    <span>{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="vesk-login-mock" aria-hidden="true">
              <div className="vesk-login-mock-bar">
                <span />
                <span />
                <span />
              </div>
              <div className="vesk-login-mock-body">
                <div className="vesk-login-mock-col">
                  <div className="vesk-login-mock-col-head">
                    <i className="vesk-login-mock-dot" />
                    Prospecção
                  </div>
                  <div className="vesk-login-mock-card" />
                  <div className="vesk-login-mock-card short" />
                </div>
                <div className="vesk-login-mock-col">
                  <div className="vesk-login-mock-col-head">
                    <i className="vesk-login-mock-dot blue" />
                    Negociação
                  </div>
                  <div className="vesk-login-mock-card" />
                </div>
                <div className="vesk-login-mock-chat">
                  <div className="vesk-login-mock-bubble in" />
                  <div className="vesk-login-mock-bubble out" />
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="vesk-login-formside">
          <div className="vesk-login-card">
            <div className="vesk-login-header">
              <img src="/logo-mark.svg" className="vesk-login-logo-img" alt="" aria-hidden="true" />
              <h2 className="vesk-login-welcome">Bem-vindo de volta</h2>
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

            <div className="vesk-login-trust">
              <i className="ti ti-lock" aria-hidden="true" />
              Conexão segura e criptografada
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Login;
