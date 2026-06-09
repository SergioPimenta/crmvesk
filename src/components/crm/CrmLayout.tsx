import { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import { useCrmData, isEmailUnread } from '../../contexts/CrmDataContext';

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
  const { contacts, emails } = useCrmData();
  const navigate = useNavigate();

  const contatosPendentes = contacts.filter((c) => c.precisaFollowUp).length;
  const emailsPendentes = emails.filter((e) => isEmailUnread(e.status)).length;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="crm-root" role="main" aria-label="VESK CRM — painel principal">
      <h2 className="sr-only">VESK CRM — painel de controle de relacionamento com clientes</h2>

      <div className="crm-topbar">
        <div className="crm-logo">
          <i className="ti ti-bolt" style={{ color: 'var(--vesk-orange)', fontSize: 18 }} aria-hidden="true" />
          VESK <span>CRM</span>
        </div>
        <div className="crm-badge">Beta</div>
        <div className="crm-search">
          <i className="ti ti-search si" aria-hidden="true" />
          <input type="text" placeholder="Buscar contato, empresa…" aria-label="Buscar" />
        </div>
        <div className="crm-topbar-actions">
          <button type="button" className="crm-icon-btn" title="Notificações" aria-label="Notificações">
            <i className="ti ti-bell" aria-hidden="true" />
          </button>
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
        <nav className="crm-sidebar" aria-label="Menu principal">
          <div className="crm-nav-section">
            <div className="crm-nav-label">Principal</div>
            <NavLink to="/admin" end className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-layout-dashboard" aria-hidden="true" />
              Dashboard
            </NavLink>
            <NavLink to="/admin/contatos" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-users" aria-hidden="true" />
              Contatos {contatosPendentes > 0 ? <span className="nav-count">{contatosPendentes}</span> : null}
            </NavLink>
            <NavLink to="/admin/empresas" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-building" aria-hidden="true" />
              Empresas
            </NavLink>
            <NavLink to="/admin/pipeline" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-trending-up" aria-hidden="true" />
              Pipeline
            </NavLink>
          </div>
          <div className="crm-nav-section">
            <div className="crm-nav-label">Gestão</div>
            <NavLink to="/admin/agenda" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-calendar" aria-hidden="true" />
              Agenda
            </NavLink>
            <NavLink to="/admin/emails" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-mail" aria-hidden="true" />
              E-mails {emailsPendentes > 0 ? <span className="nav-count">{emailsPendentes}</span> : null}
            </NavLink>
            <NavLink to="/admin/whatsapp" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-brand-whatsapp" aria-hidden="true" />
              WhatsApp
            </NavLink>
            <NavLink to="/admin/relatorios" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-chart-bar" aria-hidden="true" />
              Relatórios
            </NavLink>
            <NavLink to="/admin/propostas" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-file-text" aria-hidden="true" />
              Propostas
            </NavLink>
            <NavLink to="/admin/scraping" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-map-pin" aria-hidden="true" />
              Scraping
            </NavLink>
          </div>
          <div className="crm-nav-section">
            <div className="crm-nav-label">Integrações</div>
            <NavLink to="/admin/integracoes" className={({ isActive }) => `crm-nav-item${isActive ? ' active' : ''}`}>
              <i className="ti ti-plug-connected" aria-hidden="true" />
              Integrações
            </NavLink>
          </div>
          <div className="crm-nav-section">
            <div className="crm-nav-label">Automação</div>
            <button type="button" className="crm-nav-item">
              <i className="ti ti-robot" aria-hidden="true" />
              Fluxos
            </button>
            <button type="button" className="crm-nav-item">
              <i className="ti ti-target" aria-hidden="true" />
              Campanhas
            </button>
          </div>
          <div className="crm-sidebar-bottom">
            <button type="button" className="crm-nav-item">
              <i className="ti ti-help-circle" aria-hidden="true" />
              Suporte
            </button>
            <button type="button" className="crm-nav-item" onClick={handleLogout}>
              <i className="ti ti-logout" aria-hidden="true" />
              Sair
            </button>
          </div>
        </nav>

        <main className="crm-main">{children}</main>
      </div>
    </div>
  );
};

export default CrmLayout;
