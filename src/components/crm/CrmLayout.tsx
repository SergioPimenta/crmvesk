import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useCrmData, isEmailUnread } from '../../contexts/CrmDataContext';
import NotificationMenu from './NotificationMenu';

interface CrmLayoutProps {
  children: ReactNode;
}

const getInitials = (name?: string) => {
  if (!name) return 'VS';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const CrmLayout = ({ children }: CrmLayoutProps) => {
  const { user, logout } = useAuth();
  const { contacts, emails, whatsappUnread } = useCrmData();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const contatosPendentes = contacts.filter((c) => c.precisaFollowUp).length;
  const emailsPendentes = emails.filter((e) => isEmailUnread(e.status)).length;

  // Fecha o menu mobile ao trocar de rota.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="crm-root" role="main" aria-label="VESK CRM — painel principal">
      <h2 className="sr-only">VESK CRM — painel de controle de relacionamento com clientes</h2>

      <div className="crm-topbar">
        <button
          type="button"
          className="crm-hamburger"
          aria-label="Abrir menu de navegação"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((v) => !v)}
        >
          <i className={`ti ${mobileNavOpen ? 'ti-x' : 'ti-menu-2'}`} aria-hidden="true" />
        </button>
        <div className="crm-logo">
          <img src="/logo-mark.svg" className="crm-logo-img" alt="" aria-hidden="true" />
          VESK <span>CRM</span>
        </div>
        <div className="crm-badge">Beta</div>
        <div className="crm-search">
          <i className="ti ti-search si" aria-hidden="true" />
          <input type="text" placeholder="Buscar contato, empresa…" aria-label="Buscar" />
        </div>
        <div className="crm-topbar-actions">
          <NotificationMenu />
          <button type="button" className="crm-icon-btn" title="Configurações" aria-label="Configurações">
            <i className="ti ti-settings" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="crm-avatar"
            title="Sair do sistema"
            aria-label="Perfil e sair"
            onClick={handleLogout}
          >
            {getInitials(user?.name)}
          </button>
        </div>
      </div>

      <div className="crm-body">
        <div
          className={`crm-nav-backdrop${mobileNavOpen ? ' open' : ''}`}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
        <nav className={`crm-sidebar${mobileNavOpen ? ' open' : ''}`} aria-label="Menu principal">
          <div className="crm-nav-section">
            <div className="crm-nav-label">Principal</div>
            <NavLink to="/admin" end className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Dashboard">
              <i className="ti ti-layout-dashboard" aria-hidden="true" />
              <span className="crm-nav-text">Dashboard</span>
            </NavLink>
            <NavLink to="/admin/contatos" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Contatos">
              <i className="ti ti-users" aria-hidden="true" />
              <span className="crm-nav-text">Contatos</span>
              {contatosPendentes > 0 ? <span className="nav-count">{contatosPendentes}</span> : null}
            </NavLink>
            <NavLink to="/admin/empresas" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Empresas">
              <i className="ti ti-building" aria-hidden="true" />
              <span className="crm-nav-text">Empresas</span>
            </NavLink>
            <NavLink to="/admin/pipeline" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Pipeline">
              <i className="ti ti-trending-up" aria-hidden="true" />
              <span className="crm-nav-text">Pipeline</span>
            </NavLink>
          </div>
          <div className="crm-nav-section">
            <div className="crm-nav-label">Gestão</div>
            <NavLink to="/admin/agenda" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Agenda">
              <i className="ti ti-calendar" aria-hidden="true" />
              <span className="crm-nav-text">Agenda</span>
            </NavLink>
            <NavLink to="/admin/emails" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="E-mails">
              <i className="ti ti-mail" aria-hidden="true" />
              <span className="crm-nav-text">E-mails</span>
              {emailsPendentes > 0 ? <span className="nav-count">{emailsPendentes}</span> : null}
            </NavLink>
            <NavLink to="/admin/whatsapp" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="WhatsApp">
              <i className="ti ti-brand-whatsapp" aria-hidden="true" />
              <span className="crm-nav-text">WhatsApp</span>
              {whatsappUnread > 0 ? <span className="nav-count">{whatsappUnread}</span> : null}
            </NavLink>
            <NavLink to="/admin/relatorios" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Relatórios">
              <i className="ti ti-chart-bar" aria-hidden="true" />
              <span className="crm-nav-text">Relatórios</span>
            </NavLink>
            <NavLink to="/admin/propostas" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Propostas">
              <i className="ti ti-file-text" aria-hidden="true" />
              <span className="crm-nav-text">Propostas</span>
            </NavLink>
            <NavLink to="/admin/scraping" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Scraping">
              <i className="ti ti-map-pin" aria-hidden="true" />
              <span className="crm-nav-text">Scraping</span>
            </NavLink>
          </div>
          <div className="crm-nav-section">
            <div className="crm-nav-label">Integrações</div>
            <NavLink to="/admin/integracoes" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Integrações">
              <i className="ti ti-plug-connected" aria-hidden="true" />
              <span className="crm-nav-text">Integrações</span>
            </NavLink>
          </div>
          {user?.role === 'admin' ? (
            <div className="crm-nav-section">
              <div className="crm-nav-label">Administração</div>
              <NavLink to="/admin/usuarios" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`} title="Usuários">
                <i className="ti ti-user-cog" aria-hidden="true" />
                <span className="crm-nav-text">Usuários</span>
              </NavLink>
            </div>
          ) : null}
          <div className="crm-nav-section">
            <div className="crm-nav-label">Automação</div>
            <button type="button" className="crm-nav-item" title="Fluxos">
              <i className="ti ti-robot" aria-hidden="true" />
              <span className="crm-nav-text">Fluxos</span>
            </button>
            <button type="button" className="crm-nav-item" title="Campanhas">
              <i className="ti ti-target" aria-hidden="true" />
              <span className="crm-nav-text">Campanhas</span>
            </button>
          </div>
          <div className="crm-sidebar-bottom">
            <button type="button" className="crm-nav-item" title="Suporte">
              <i className="ti ti-help-circle" aria-hidden="true" />
              <span className="crm-nav-text">Suporte</span>
            </button>
            <button type="button" className="crm-nav-item" onClick={handleLogout} title="Sair">
              <i className="ti ti-logout" aria-hidden="true" />
              <span className="crm-nav-text">Sair</span>
            </button>
          </div>
        </nav>

        <main className="crm-main">{children}</main>
      </div>
    </div>
  );
};

export default CrmLayout;
