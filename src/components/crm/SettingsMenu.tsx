import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredTheme, setStoredTheme, type Theme } from '../../utils/theme';

const getInitials = (name?: string) => {
  if (!name) return 'VS';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const roleLabel = (role?: string) => {
  if (role === 'admin') return 'Administrador';
  if (role === 'user') return 'Usuário';
  return role || 'Usuário';
};

const SettingsMenu = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const wrapRef = useRef<HTMLDivElement>(null);

  const changeTheme = (next: Theme) => {
    setStoredTheme(next);
    setTheme(next);
  };

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/');
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="crm-settings" ref={wrapRef}>
      <button
        type="button"
        className={`crm-icon-btn${open ? ' active' : ''}`}
        title="Configurações"
        aria-label="Configurações"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="ti ti-settings" aria-hidden="true" />
      </button>

      {open ? (
        <div className="crm-settings-panel" role="menu">
          <div className="crm-settings-account">
            <div className="crm-settings-avatar">{getInitials(user?.name)}</div>
            <div className="crm-settings-account-info">
              <div className="crm-settings-account-name">{user?.name || 'Usuário'}</div>
              {user?.email ? <div className="crm-settings-account-email">{user.email}</div> : null}
              <span className="crm-settings-role">{roleLabel(user?.role)}</span>
            </div>
          </div>

          <div className="crm-settings-divider" />
          <div className="crm-settings-section-label">Aparência</div>
          <div className="crm-theme-toggle" role="group" aria-label="Tema">
            <button
              type="button"
              className={`crm-theme-opt${theme === 'dark' ? ' active' : ''}`}
              aria-pressed={theme === 'dark'}
              onClick={() => changeTheme('dark')}
            >
              <i className="ti ti-moon" aria-hidden="true" />
              Escuro
            </button>
            <button
              type="button"
              className={`crm-theme-opt${theme === 'light' ? ' active' : ''}`}
              aria-pressed={theme === 'light'}
              onClick={() => changeTheme('light')}
            >
              <i className="ti ti-sun" aria-hidden="true" />
              Claro
            </button>
          </div>

          <div className="crm-settings-divider" />
          <div className="crm-settings-section-label">Configurações</div>

          <button type="button" className="crm-settings-item" role="menuitem" onClick={() => go('/admin/integracoes')}>
            <i className="ti ti-plug-connected" aria-hidden="true" />
            <span>Integrações</span>
          </button>

          {isAdmin ? (
            <button type="button" className="crm-settings-item" role="menuitem" onClick={() => go('/admin/usuarios')}>
              <i className="ti ti-users" aria-hidden="true" />
              <span>Usuários</span>
            </button>
          ) : null}

          <button type="button" className="crm-settings-item" role="menuitem" onClick={() => go('/admin/instalar-app')}>
            <i className="ti ti-device-mobile-down" aria-hidden="true" />
            <span>Baixar app</span>
          </button>

          <div className="crm-settings-divider" />

          <button type="button" className="crm-settings-item crm-settings-item--danger" role="menuitem" onClick={handleLogout}>
            <i className="ti ti-logout" aria-hidden="true" />
            <span>Sair da conta</span>
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default SettingsMenu;
