import { FormEvent, useState } from 'react';
import Modal from '../../components/crm/Modal';
import { api } from '../../services/api';
import type { MonitoredSite } from './types';

type Props = {
  open: boolean;
  site: MonitoredSite | null;
  onClose: () => void;
  onCreated: (site: MonitoredSite) => void;
};

// Instalação: sites com botão de WhatsApp ou formulário do CRM já são monitorados; os demais usam o script abaixo.
const SiteSetupModal = ({ open, site, onClose, onCreated }: Props) => {
  const [siteUrl, setSiteUrl] = useState('');
  const [siteName, setSiteName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post<{ site: MonitoredSite }>('/site-analytics/sites', { siteUrl, siteName });
      onCreated(res.site);
      setSiteUrl('');
      setSiteName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar site');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sem permissão de área de transferência */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Instalar monitoramento"
      description="Acessos, origem, regiões, cliques e mapa de calor do site."
    >
      {site ? (
        <div className="sa-setup">
          {site.hasButton || site.hasForm ? (
            <div className="sa-setup-ok">
              <i className="ti ti-circle-check" aria-hidden="true" />
              <div>
                <strong>{site.siteName} já está sendo monitorado.</strong>
                <span>
                  O {[site.hasButton ? 'botão de WhatsApp' : '', site.hasForm ? 'formulário de contato' : '']
                    .filter(Boolean)
                    .join(' e o ')}{' '}
                  do CRM carrega o monitoramento sozinho em todas as páginas onde está instalado. Não precisa fazer
                  nada.
                </span>
              </div>
            </div>
          ) : null}
          <div className="sa-setup-step">
            <strong>{site.hasButton || site.hasForm ? 'Páginas sem o botão/formulário' : 'Cole no site'}</strong>
            <span>
              Cole antes de <code>&lt;/head&gt;</code> em todas as páginas (no WordPress: plugin de "Header e Footer";
              no Wix/Webflow: código personalizado no cabeçalho).
            </span>
            <pre className="sa-code">{site.embedSnippet}</pre>
            <button type="button" className="crm-btn-secondary" onClick={() => copy(site.embedSnippet)}>
              <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" />
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
          </div>
          <div className="sa-setup-step">
            <strong>Medir cada canal</strong>
            <span>
              Use UTMs nos links que você divulga para separar bio, stories e anúncios, por exemplo:
            </span>
            <pre className="sa-code">{`${site.siteUrl}/?utm_source=instagram&utm_medium=bio`}</pre>
          </div>
          <div className="sa-setup-step">
            <strong>Privacidade</strong>
            <span>
              O monitoramento não usa cookies, não guarda IP nem o que o visitante digita: a região vem da localização
              aproximada da conexão. Mencione a coleta de estatísticas de uso na política de privacidade do site.
            </span>
          </div>
        </div>
      ) : null}

      <form className="sa-setup-new" onSubmit={submit}>
        <div className="sa-side-title">Monitorar outro site</div>
        <div className="crm-form">
          <div className="crm-field">
            <label htmlFor="sa-new-url">Endereço do site</label>
            <input
              id="sa-new-url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://www.seusite.com.br"
              required
            />
          </div>
          <div className="crm-field">
            <label htmlFor="sa-new-name">Nome (opcional)</label>
            <input id="sa-new-name" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site institucional" />
          </div>
        </div>
        {error ? <div className="sa-error">{error}</div> : null}
        <div className="crm-form-actions">
          <button type="submit" className="crm-btn-primary" disabled={saving || !siteUrl.trim()}>
            <i className="ti ti-plus" aria-hidden="true" />
            {saving ? 'Cadastrando…' : 'Cadastrar site'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SiteSetupModal;
