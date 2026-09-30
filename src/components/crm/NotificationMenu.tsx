import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrmData } from '../../contexts/CrmDataContext';
import { api } from '../../services/api';
import { useNotificationFeed, type FeedItem } from './useNotificationFeed';

/** "há 5 min", "há 2 h", "ontem"… para a lista de lembretes. */
const timeAgo = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
};

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

  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [remindEmail, setRemindEmail] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Lembretes novos viram aviso do navegador (se ativado). No celular o push cuida disso com o CRM fechado.
  const feed = useNotificationFeed((fresh: FeedItem[]) => {
    if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    fresh.forEach((item) => {
      try {
        new Notification(item.title, { body: item.body, icon: '/icons/icon-192.png', tag: `reminder-${item.id}` });
      } catch {
        /* alguns navegadores exigem service worker */
      }
    });
  });

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ remindEmail: boolean }>('/notifications/prefs')
      .then((p) => setRemindEmail(Boolean(p.remindEmail)))
      .catch(() => {});
  }, [open]);

  const toggleRemindEmail = async () => {
    const next = !remindEmail;
    setRemindEmail(next);
    try {
      await api.put('/notifications/prefs', { remindEmail: next });
    } catch {
      setRemindEmail(!next);
    }
  };

  const openItem = (item: FeedItem) => {
    if (!item.read) void feed.markRead(item.id);
    setOpen(false);
    if (item.url) navigate(item.url);
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
        <i className={`ti ${anyOn || feed.unread > 0 ? 'ti-bell-ringing' : 'ti-bell'}`} aria-hidden="true" />
        {feed.unread > 0 ? (
          <span className="crm-notif-badge" aria-label={`${feed.unread} lembretes não lidos`}>
            {feed.unread > 9 ? '9+' : feed.unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="crm-notif-panel" role="menu">
          <div className="crm-notif-title crm-notif-title-row">
            Lembretes
            {feed.unread > 0 ? (
              <button type="button" className="crm-notif-link" onClick={() => void feed.markAllRead()}>
                Marcar todas como lidas
              </button>
            ) : null}
          </div>
          <div className="crm-feed" role="list" aria-label="Lembretes recentes">
            {feed.items.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`crm-feed-item${item.read ? '' : ' unread'}`}
                onClick={() => openItem(item)}
              >
                <span className="crm-feed-title">{item.title}</span>
                {item.body ? <span className="crm-feed-body">{item.body}</span> : null}
                <span className="crm-feed-time">{timeAgo(item.createdAt)}</span>
              </button>
            ))}
            {feed.items.length === 0 ? <div className="crm-feed-empty">Nenhum lembrete ainda.</div> : null}
          </div>

          <div className="crm-notif-row">
            <div className="crm-notif-row-text">
              <div className="crm-notif-row-label">
                <i className="ti ti-mail" aria-hidden="true" /> Lembretes por e-mail
              </div>
              <div className="crm-notif-row-desc">Receba também os lembretes da Agenda no seu e-mail</div>
            </div>
            <Switch checked={remindEmail} onChange={() => void toggleRemindEmail()} label="Receber lembretes por e-mail" />
          </div>

          <div className="crm-notif-divider" />

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
