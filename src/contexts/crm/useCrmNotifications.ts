import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  pushSupported as pushIsSupported,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
} from '../../utils/push';
import { isEmailUnread, type EmailItem } from './types';

type Options = {
  userId: number | string | undefined;
  whatsappUnread: number;
  emails: EmailItem[];
  refreshWhatsappUnread: () => Promise<void>;
  refreshEmails: () => Promise<void>;
};

/**
 * Notificações de novas mensagens (WhatsApp e e-mails): permissão do navegador, preferências por canal,
 * push no celular e a verificação periódica que detecta mensagens novas.
 */
export function useCrmNotifications({ userId, whatsappUnread, emails, refreshWhatsappUnread, refreshEmails }: Options) {
  const navigate = useNavigate();

  const notificationsSupported =
    typeof window !== 'undefined' && 'Notification' in window;

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    if (!notificationsSupported) return false;
    return (
      localStorage.getItem('crm_notifications_enabled') === '1' &&
      Notification.permission === 'granted'
    );
  });

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const notifyBrowser = useCallback((title: string, body: string, path: string) => {
    if (!notificationsSupported || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(title, { body, icon: '/icons/icon-192.png', tag: path });
      notification.onclick = () => {
        window.focus();
        navigateRef.current(path);
        notification.close();
      };
    } catch {
      /* alguns navegadores exigem service worker; ignora silenciosamente */
    }
  }, [notificationsSupported]);

  const toggleNotifications = useCallback(async () => {
    if (!notificationsSupported) {
      window.alert('Este navegador não suporta notificações.');
      return false;
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('crm_notifications_enabled', '0');
      return false;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('crm_notifications_enabled', '1');
      return true;
    }
    window.alert(
      'Permissão de notificações negada. Habilite nas configurações do navegador para receber alertas.'
    );
    return false;
  }, [notificationsSupported, notificationsEnabled]);

  // Preferências por canal (WhatsApp / e-mail).
  const [notifyWhatsapp, setNotifyWhatsappState] = useState<boolean>(
    () => localStorage.getItem('crm_notify_whatsapp') !== '0'
  );
  const [notifyEmail, setNotifyEmailState] = useState<boolean>(
    () => localStorage.getItem('crm_notify_email') !== '0'
  );
  const setNotifyWhatsapp = useCallback((v: boolean) => {
    setNotifyWhatsappState(v);
    localStorage.setItem('crm_notify_whatsapp', v ? '1' : '0');
  }, []);
  const setNotifyEmail = useCallback((v: boolean) => {
    setNotifyEmailState(v);
    localStorage.setItem('crm_notify_email', v ? '1' : '0');
  }, []);

  // Push no celular (Web Push).
  const pushSupported = pushIsSupported();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!userId || !pushSupported) {
      setPushEnabled(false);
      return;
    }
    void isPushSubscribed()
      .then(setPushEnabled)
      .catch(() => setPushEnabled(false));
  }, [userId, pushSupported]);

  const togglePush = useCallback(async () => {
    if (!pushSupported) {
      window.alert('Este dispositivo não suporta notificações push.');
      return;
    }
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        if (Notification.permission !== 'granted') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            window.alert('Permissão de notificações negada. Habilite nas configurações do navegador.');
            return;
          }
        }
        await subscribeToPush();
        setPushEnabled(true);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Falha ao configurar push no celular.');
    } finally {
      setPushBusy(false);
    }
  }, [pushSupported, pushEnabled]);

  // Polling: contagem do WhatsApp + e-mails, para detectar mensagens novas.
  useEffect(() => {
    if (!userId) return;

    void refreshWhatsappUnread();
    void refreshEmails().catch(() => {});
    const interval = window.setInterval(() => {
      void refreshWhatsappUnread();
      void refreshEmails().catch(() => {});
    }, 15000);

    return () => window.clearInterval(interval);
  }, [userId, refreshWhatsappUnread, refreshEmails]);

  // Só dispara notificações após um curto período, evitando alertar na carga inicial.
  const notifArmedRef = useRef(false);
  const prevWaUnreadRef = useRef<number | null>(null);
  const prevEmailUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) {
      notifArmedRef.current = false;
      prevWaUnreadRef.current = null;
      prevEmailUnreadRef.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      notifArmedRef.current = true;
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    const prev = prevWaUnreadRef.current;
    prevWaUnreadRef.current = whatsappUnread;
    if (prev === null || !notifArmedRef.current || !notificationsEnabled || !notifyWhatsapp) return;
    if (whatsappUnread > prev) {
      const diff = whatsappUnread - prev;
      notifyBrowser(
        'Novas mensagens no WhatsApp',
        diff === 1
          ? 'Você recebeu 1 nova mensagem no WhatsApp.'
          : `Você recebeu ${diff} novas mensagens no WhatsApp.`,
        '/admin/whatsapp'
      );
    }
  }, [whatsappUnread, notificationsEnabled, notifyWhatsapp, notifyBrowser]);

  const emailUnread = emails.filter((e) => isEmailUnread(e.status)).length;

  useEffect(() => {
    const prev = prevEmailUnreadRef.current;
    prevEmailUnreadRef.current = emailUnread;
    if (prev === null || !notifArmedRef.current || !notificationsEnabled || !notifyEmail) return;
    if (emailUnread > prev) {
      const diff = emailUnread - prev;
      notifyBrowser(
        'Novos e-mails',
        diff === 1 ? 'Você recebeu 1 novo e-mail.' : `Você recebeu ${diff} novos e-mails.`,
        '/admin/emails'
      );
    }
  }, [emailUnread, notificationsEnabled, notifyEmail, notifyBrowser]);

  return {
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
  };
}
