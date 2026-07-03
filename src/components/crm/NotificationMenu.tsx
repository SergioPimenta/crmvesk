import { useEffect, useRef, useState } from 'react';
import { useCrmData } from '../../contexts/CrmDataContext';

const Switch = ({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`crm-switch${checked ? ' on' : ''}`}
    onClick={onChange}
    disabled={disabled}
  >
    <span className="crm-switch-knob" />
  </button>
);

const NotificationMenu = () => {
  const {
    notificationsEnabled,
    toggleNotifications,
    notifyWhatsapp,
    notifyEmail,
    setNotifyWhatsapp,
    setNotifyEmail,
    pushEnabled,
    pushBusy,
    pushSupported,
    togglePush,
  } = useCrmData();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const anyOn = notificationsEnabled || pushEnabled;

  return (
    <div className="crm-notif" ref={wrapRef}>
      <button
        type="button"
        className={`crm-icon-btn${anyOn ? ' active' : ''}`}
        title="Preferências de notificações"
        aria-label="Preferências de notificações"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={`ti ${anyOn ? 'ti-bell-ringing' : 'ti-bell'}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="crm-notif-panel" role="menu">
          <div className="crm-notif-title">Notificações</div>

          <div className="crm-notif-row">
            <div className="crm-notif-row-text">
              <div className="crm-notif-row-label">Ativar no navegador</div>
              <div className="crm-notif-row-desc">Alertas enquanto o CRM estiver aberto</div>
            </div>
            <Switch
              checked={notificationsEnabled}
              onChange={() => void toggleNotifications()}
              label="Ativar notificações no navegador"
            />
          </div>

          <div className={`crm-notif-channels${notificationsEnabled ? '' : ' disabled'}`}>
            <div className="crm-notif-row">
              <div className="crm-notif-row-text">
                <div className="crm-notif-row-label">
                  <i className="ti ti-brand-whatsapp" aria-hidden="true" /> WhatsApp
                </div>
                <div className="crm-notif-row-desc">Novas mensagens recebidas</div>
              </div>
              <Switch
                checked={notifyWhatsapp}
                onChange={() => setNotifyWhatsapp(!notifyWhatsapp)}
                disabled={!notificationsEnabled}
                label="Notificar WhatsApp"
              />
            </div>
            <div className="crm-notif-row">
              <div className="crm-notif-row-text">
                <div className="crm-notif-row-label">
                  <i className="ti ti-mail" aria-hidden="true" /> E-mails
                </div>
                <div className="crm-notif-row-desc">Novos e-mails não lidos</div>
              </div>
              <Switch
                checked={notifyEmail}
                onChange={() => setNotifyEmail(!notifyEmail)}
                disabled={!notificationsEnabled}
                label="Notificar e-mails"
              />
            </div>
          </div>

          <div className="crm-notif-divider" />

          <div className="crm-notif-row">
            <div className="crm-notif-row-text">
              <div className="crm-notif-row-label">
                <i className="ti ti-device-mobile" aria-hidden="true" /> Receber no celular
              </div>
              <div className="crm-notif-row-desc">
                {pushSupported
                  ? 'Push do WhatsApp mesmo com o CRM fechado'
                  : 'Não suportado neste dispositivo'}
              </div>
            </div>
            <Switch
              checked={pushEnabled}
              onChange={() => void togglePush()}
              disabled={!pushSupported || pushBusy}
              label="Receber notificações no celular"
            />
          </div>

          {pushSupported ? (
            <div className="crm-notif-hint">
              <i className="ti ti-info-circle" aria-hidden="true" /> No celular, adicione o CRM à
              tela inicial e ative esta opção para receber push em segundo plano.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default NotificationMenu;
