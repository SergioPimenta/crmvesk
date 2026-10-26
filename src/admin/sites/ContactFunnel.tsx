import { fmtNum, fmtPct, rate } from './format';
import type { SiteOverview } from './types';

// Do acesso ao contato: quantas visitas avançam em cada etapa e onde se perdem.
const ContactFunnel = ({ data }: { data: SiteOverview }) => {
  const t = data.totals;
  const steps = [
    { label: 'Visitas', hint: 'Entraram no site', value: t.sessions },
    { label: 'Engajadas', hint: '30s+, 2 páginas ou rolaram metade', value: t.engaged },
    { label: 'Interesse', hint: 'Começaram o formulário ou abriram o WhatsApp', value: t.intent },
    { label: 'Contato', hint: 'Enviaram formulário, chamaram no WhatsApp ou ligaram', value: t.conversions },
  ];
  const leads = data.eventTypes.whatsapp_lead?.sessions || 0;
  const direct = data.eventTypes.whatsapp_click?.sessions || 0;

  return (
    <div className="sa-funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].value : 0;
        const share = rate(s.value, t.sessions);
        return (
          <div key={s.label} className="sa-funnel-step">
            <div className="sa-funnel-label">
              <strong>{s.label}</strong>
              <span>{s.hint}</span>
            </div>
            <div className="sa-funnel-track">
              <div className="sa-funnel-bar" style={{ width: `${Math.max(1, share * 100)}%` }} />
            </div>
            <div className="sa-funnel-num">
              <strong>{fmtNum(s.value)}</strong>
              <span>{fmtPct(share)}</span>
            </div>
            <div className="sa-funnel-drop">
              {i ? (
                <span title="Perda em relação à etapa anterior">
                  <i className="ti ti-arrow-down-right" aria-hidden="true" /> {fmtPct(1 - rate(s.value, prev))} saem
                </span>
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="sa-funnel-channels">
        <div className="sa-channel">
          <i className="ti ti-forms" aria-hidden="true" />
          <div>
            <strong>Formulário</strong>
            <span>
              {fmtNum(t.formStarted)} começaram · {fmtNum(t.convForm)} enviaram
              {t.formStarted ? ` (${fmtPct(rate(t.convForm, t.formStarted))})` : ''}
            </span>
          </div>
        </div>
        <div className="sa-channel">
          <i className="ti ti-brand-whatsapp" aria-hidden="true" />
          <div>
            <strong>WhatsApp</strong>
            <span>
              {fmtNum(t.whatsappOpened)} abriram o botão · {fmtNum(leads)} iniciaram conversa
              {direct ? ` · ${fmtNum(direct)} por link direto` : ''}
            </span>
          </div>
        </div>
        <div className="sa-channel">
          <i className="ti ti-phone" aria-hidden="true" />
          <div>
            <strong>Telefone</strong>
            <span>{fmtNum(t.convPhone)} clicaram para ligar</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactFunnel;
