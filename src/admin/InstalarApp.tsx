import { useEffect, useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import {
  canInstall,
  getPlatform,
  isStandalone,
  promptInstall,
  subscribeInstall,
  type MobilePlatform,
} from '../utils/pwaInstall';

const BENEFITS = [
  { icon: 'ti-bell-ringing', text: 'Receba notificações de novas mensagens no WhatsApp' },
  { icon: 'ti-bolt', text: 'Acesso rápido pela tela inicial, como um app nativo' },
  { icon: 'ti-maximize', text: 'Experiência em tela cheia, sem a barra do navegador' },
  { icon: 'ti-devices', text: 'Funciona no celular e no computador' },
];

const instructionsFor = (platform: MobilePlatform) => {
  if (platform === 'ios') {
    return {
      title: 'Instalar no iPhone / iPad',
      steps: [
        'Abra este site no Safari.',
        'Toque no botão Compartilhar (o quadrado com a seta para cima).',
        'Escolha "Adicionar à Tela de Início".',
        'Confirme em "Adicionar" — o app VESK CRM aparecerá na tela inicial.',
      ],
    };
  }
  if (platform === 'android') {
    return {
      title: 'Instalar no Android',
      steps: [
        'Abra este site no Chrome.',
        'Toque no menu (⋮) no canto superior direito.',
        'Escolha "Instalar app" ou "Adicionar à tela inicial".',
        'Confirme — o app VESK CRM aparecerá na tela inicial.',
      ],
    };
  }
  return {
    title: 'Instalar no computador',
    steps: [
      'Abra este site no Chrome, Edge ou navegador compatível.',
      'Clique no ícone de instalar (⊕) na barra de endereço, à direita.',
      'Ou abra o menu (⋮) → "Instalar VESK CRM…".',
      'Confirme — o app abrirá em sua própria janela.',
    ],
  };
};

const InstalarApp = () => {
  const [installed, setInstalled] = useState(isStandalone());
  const [installable, setInstallable] = useState(canInstall());
  const [feedback, setFeedback] = useState('');
  const platform = getPlatform();

  useEffect(() => {
    const unsub = subscribeInstall(() => {
      setInstallable(canInstall());
      setInstalled(isStandalone());
    });
    return unsub;
  }, []);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      setFeedback('Instalação iniciada! Confira a tela inicial do seu dispositivo.');
    } else if (outcome === 'dismissed') {
      setFeedback('Instalação cancelada. Você pode instalar quando quiser.');
    } else {
      setFeedback('');
    }
  };

  const instructions = instructionsFor(platform);

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">
            Baixar <span>app</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Instale o VESK CRM no seu dispositivo para acesso rápido e notificações
          </div>
        </div>
      </div>

      <div className="crm-card install-hero">
        <img src="/logo-mark.svg" className="install-hero-logo" alt="VESK CRM" />
        <div className="install-hero-title">
          VESK <span>CRM</span>
        </div>
        <p className="install-hero-sub">
          Tenha o CRM sempre à mão, com a mesma experiência de um aplicativo instalado.
        </p>

        {installed ? (
          <div className="install-status ok">
            <i className="ti ti-circle-check" aria-hidden="true" />
            App instalado — você já está usando o VESK CRM como aplicativo.
          </div>
        ) : installable ? (
          <button type="button" className="crm-btn-primary install-btn" onClick={() => void handleInstall()}>
            <i className="ti ti-download" aria-hidden="true" />
            Instalar app
          </button>
        ) : (
          <div className="install-status hint">
            <i className="ti ti-info-circle" aria-hidden="true" />
            Siga as instruções abaixo para instalar no seu dispositivo.
          </div>
        )}

        {feedback ? <div className="install-feedback">{feedback}</div> : null}
      </div>

      <div className="install-cols">
        <div className="crm-card">
          <div className="crm-card-header">
            <i className="ti ti-star" style={{ color: 'var(--vesk-orange)' }} aria-hidden="true" />
            <div className="crm-card-title">Vantagens</div>
          </div>
          <ul className="install-benefits">
            {BENEFITS.map((b) => (
              <li key={b.text}>
                <i className={`ti ${b.icon}`} aria-hidden="true" />
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="crm-card">
          <div className="crm-card-header">
            <i className="ti ti-list-check" style={{ color: 'var(--vesk-orange)' }} aria-hidden="true" />
            <div className="crm-card-title">{instructions.title}</div>
          </div>
          <ol className="install-steps">
            {instructions.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </CrmLayout>
  );
};

export default InstalarApp;
