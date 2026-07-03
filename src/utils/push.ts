import { api } from '../services/api';

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}

let registration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker() {
  if (!pushSupported()) return null;
  if (registration) return registration;
  registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return registration;
}

async function getVapidKey() {
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (envKey) return envKey;
  const data = await api.get<{ key: string }>('/notifications/vapid-public-key');
  return data?.key || '';
}

/** Inscreve o dispositivo para push e envia a inscrição ao servidor. */
export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('Este dispositivo não suporta notificações push.');
  const reg = await registerServiceWorker();
  if (!reg) throw new Error('Não foi possível registrar o service worker.');

  const vapidKey = await getVapidKey();
  if (!vapidKey) throw new Error('Chave de push não configurada no servidor.');

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  await api.post('/notifications/subscribe', { subscription });
  return subscription;
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const reg = await registerServiceWorker();
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await api.post('/notifications/unsubscribe', { endpoint: subscription.endpoint });
  } catch {
    /* ignora falha de rede ao desinscrever no servidor */
  }
  await subscription.unsubscribe();
}

export async function isPushSubscribed() {
  if (!pushSupported()) return false;
  const reg = await registerServiceWorker();
  if (!reg) return false;
  const subscription = await reg.pushManager.getSubscription();
  return Boolean(subscription);
}
