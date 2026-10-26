// Análise automática do site: regras simples sobre os números do período que viram recomendações práticas.
// Cada regra só dispara com volume mínimo, para não tirar conclusão de meia dúzia de visitas.

const pct = (v) => `${Math.round(v * 100)}%`;
const rate = (part, total) => (total > 0 ? part / total : 0);

const SEVERITY_ORDER = { critical: 0, warning: 1, tip: 2, positive: 3 };
const DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * @param {object} data resultado de getOverview (sem `insights`)
 * @returns {{ id: string, severity: 'critical'|'warning'|'tip'|'positive', title: string, detail: string, action: string }[]}
 */
export function buildInsights(data) {
  const out = [];
  const t = data.totals || {};
  const prev = data.previous || {};
  const add = (id, severity, title, detail, action) => out.push({ id, severity, title, detail, action });

  if (!t.sessions) {
    add(
      'no-data',
      'tip',
      'Ainda não há visitas neste período',
      'O monitoramento começa a contar assim que o script do site é carregado por um visitante.',
      'Confira se o botão de WhatsApp, o formulário ou o script de monitoramento estão instalados e abra o site uma vez para testar.'
    );
    return out;
  }

  const enough = t.sessions >= 30;

  // ---- conversão geral
  if (enough && t.conversionRate < 0.01) {
    add(
      'low-conversion',
      'critical',
      `Só ${pct(t.conversionRate)} das visitas viram contato`,
      `${t.sessions} visitas e ${t.conversions} contatos no período. Sites de serviço costumam converter bem mais quando o contato está sempre à mão.`,
      'Deixe um botão de WhatsApp fixo e visível em todas as páginas, coloque uma chamada clara ("Peça um orçamento") logo no primeiro bloco e repita no fim de cada seção.'
    );
  } else if (enough && t.conversionRate >= 0.04) {
    add(
      'good-conversion',
      'positive',
      `Boa conversão: ${pct(t.conversionRate)} das visitas viram contato`,
      'O site está cumprindo o papel de gerar contatos.',
      'Agora o ganho está em trazer mais tráfego qualificado: invista nos canais que mais convertem (veja Origem).'
    );
  }

  if (prev.sessions >= 20 && t.sessions < prev.sessions * 0.7) {
    add(
      'traffic-drop',
      'warning',
      `Visitas caíram ${pct(1 - t.sessions / prev.sessions)} em relação ao período anterior`,
      `${t.sessions} visitas agora contra ${prev.sessions} antes.`,
      'Veja em Origem qual canal caiu (Instagram, Google…) — normalmente é uma campanha pausada, menos posts com link ou queda de posição no Google.'
    );
  } else if (prev.sessions >= 20 && t.sessions > prev.sessions * 1.3) {
    add(
      'traffic-up',
      'positive',
      `Visitas subiram ${pct(t.sessions / prev.sessions - 1)} em relação ao período anterior`,
      `${t.sessions} visitas agora contra ${prev.sessions} antes.`,
      'Descubra em Origem o que trouxe o aumento e repita a ação.'
    );
  }

  // ---- rejeição e engajamento
  if (enough && t.bounceRate > 0.6) {
    add(
      'high-bounce',
      'warning',
      `${pct(t.bounceRate)} saem sem interagir`,
      'Essas visitas ficaram menos de 15 segundos, não rolaram até a metade e não clicaram em nada.',
      'Revise o primeiro bloco do site: título que diga em uma frase o que a empresa faz e para quem, uma foto real do serviço e o botão de contato visível sem rolar. Confira também a velocidade de carregamento no celular.'
    );
  }
  if (enough && t.avgDuration > 0 && t.avgDuration < 20) {
    add(
      'short-visits',
      'tip',
      `Tempo médio de apenas ${t.avgDuration}s`,
      'Visitas muito curtas costumam indicar que o visitante não encontrou rápido o que procurava.',
      'Mostre prova social logo no início (clientes, avaliações do Google, números) e deixe preço, região atendida ou prazo fáceis de achar.'
    );
  }

  // ---- dispositivos
  const mobile = (data.devices || []).find((d) => d.device === 'mobile');
  const desktop = (data.devices || []).find((d) => d.device === 'desktop');
  if (mobile && mobile.sessions >= 20) {
    const share = rate(mobile.sessions, t.sessions);
    const mRate = rate(mobile.conversions, mobile.sessions);
    const dRate = desktop ? rate(desktop.conversions, desktop.sessions) : 0;
    if (desktop && desktop.sessions >= 15 && dRate > 0 && mRate < dRate * 0.6) {
      add(
        'mobile-gap',
        'critical',
        `No celular a conversão é ${pct(mRate)}, contra ${pct(dRate)} no computador`,
        `${pct(share)} das visitas vêm do celular, então essa diferença custa muitos contatos.`,
        'Teste o site no celular: botões grandes, telefone e WhatsApp clicáveis, formulário curto (nome + WhatsApp) e nada cobrindo a tela (pop-ups, banners de cookies grandes).'
      );
    } else if (share >= 0.6) {
      add(
        'mobile-first',
        'tip',
        `${pct(share)} das visitas são pelo celular`,
        'A versão para celular é a principal vitrine do site.',
        'Priorize o layout do celular em qualquer mudança e teste cada página pelo navegador do Instagram, que é mais limitado.'
      );
    }
  }

  // ---- origem
  const sources = data.sources || [];
  const bySource = new Map();
  for (const s of sources) {
    const cur = bySource.get(s.source) || { sessions: 0, conversions: 0 };
    cur.sessions += s.sessions;
    cur.conversions += s.conversions;
    bySource.set(s.source, cur);
  }
  const insta = bySource.get('Instagram');
  if (insta && insta.sessions >= 20) {
    const iRate = rate(insta.conversions, insta.sessions);
    if (iRate < t.conversionRate * 0.6) {
      add(
        'instagram-low',
        'warning',
        `O Instagram traz ${pct(rate(insta.sessions, t.sessions))} das visitas, mas converte só ${pct(iRate)}`,
        'Quem chega pelo Instagram está no celular, dentro do app, e costuma desistir se precisar procurar o contato.',
        'Faça uma página de destino para o link da bio/stories com a oferta do post e um botão grande de WhatsApp; use ?utm_source=instagram&utm_medium=bio (ou stories) no link para medir cada ponto.'
      );
    } else if (iRate > t.conversionRate * 1.3) {
      add(
        'instagram-good',
        'positive',
        `Instagram é o canal que mais converte (${pct(iRate)})`,
        `${insta.conversions} contatos vieram do Instagram no período.`,
        'Aumente a frequência de stories com link para o site e teste anúncios impulsionando os posts que mais trazem visitas.'
      );
    }
  }
  const google = bySource.get('Google');
  if (enough && rate(google?.sessions || 0, t.sessions) < 0.1) {
    add(
      'low-google',
      'tip',
      `O Google traz só ${pct(rate(google?.sessions || 0, t.sessions))} das visitas`,
      'Pouca busca orgânica significa depender de redes sociais e indicação.',
      'Mantenha o Perfil da Empresa no Google completo (com link do site e fotos), crie páginas por serviço e cidade atendida e peça avaliações aos clientes.'
    );
  }
  const direct = bySource.get('Direto');
  if (enough && rate(direct?.sessions || 0, t.sessions) > 0.5 && !(data.campaigns || []).length) {
    add(
      'untagged',
      'tip',
      `${pct(rate(direct?.sessions || 0, t.sessions))} das visitas aparecem como "Direto"`,
      'Links abertos por apps (WhatsApp, Instagram, e-mail) muitas vezes chegam sem a origem.',
      'Coloque UTMs em todos os links que você divulga, ex.: site.com.br/?utm_source=instagram&utm_medium=bio&utm_campaign=promo-outubro.'
    );
  }

  // ---- formulário e WhatsApp
  if (t.formStarted >= 5) {
    const done = rate(t.convForm, t.formStarted);
    if (done < 0.5) {
      add(
        'form-abandon',
        'critical',
        `${pct(1 - done)} começam o formulário e desistem`,
        `${t.formStarted} visitas começaram a preencher e ${t.convForm} enviaram.`,
        'Reduza o formulário ao essencial (nome e WhatsApp), deixe claro o que acontece depois do envio ("respondemos em até 1h") e ofereça o WhatsApp como alternativa ao lado.'
      );
    }
  }
  const leads = data.eventTypes?.whatsapp_lead?.sessions || 0;
  if (t.whatsappOpened >= 5) {
    const done = rate(leads, t.whatsappOpened);
    if (done < 0.4) {
      add(
        'wa-form-abandon',
        'warning',
        `${pct(1 - done)} abrem o botão de WhatsApp e não iniciam a conversa`,
        `${t.whatsappOpened} visitas abriram o botão e ${leads} preencheram os dados.`,
        'O formulário antes do WhatsApp afasta parte das pessoas. Teste desligar "Pedir dados antes" na integração do botão por algumas semanas e compare.'
      );
    }
  }
  if (t.convWhatsapp > 0 && t.convForm > 0 && t.convWhatsapp >= t.convForm * 3) {
    add(
      'whatsapp-preferred',
      'positive',
      'A maioria prefere o WhatsApp ao formulário',
      `${t.convWhatsapp} contatos por WhatsApp contra ${t.convForm} pelo formulário.`,
      'Dê mais destaque ao WhatsApp nas chamadas e garanta resposta rápida, principalmente nos horários de pico.'
    );
  }

  // ---- páginas
  const landing = (data.landingPages || []).filter((p) => p.sessions >= 20);
  const worst = landing
    .map((p) => ({ ...p, bounce: rate(p.bounces, p.sessions) }))
    .sort((a, b) => b.bounce - a.bounce)[0];
  if (worst && worst.bounce > 0.7) {
    add(
      'landing-bounce',
      'warning',
      `A página ${worst.path} perde ${pct(worst.bounce)} de quem chega nela`,
      `${worst.sessions} visitas começaram por essa página.`,
      'Confira se o conteúdo dela corresponde ao que o anúncio/post prometeu e se o botão de contato aparece sem rolar.'
    );
  }
  const home = (data.pages || []).find((p) => p.path === '/' && p.sessions >= 20 && p.avgScroll != null);
  if (home && home.avgScroll < 50) {
    add(
      'low-scroll',
      'warning',
      `Na página inicial a rolagem média para em ${home.avgScroll}%`,
      'Metade do conteúdo não é vista pela maioria dos visitantes.',
      'Traga para cima o que mais vende (serviços, provas sociais e o botão de contato) e use o Mapa de calor para ver onde a atenção acaba.'
    );
  }

  // ---- cliques
  const dead = (data.deadClicks || [])[0];
  if (dead && dead.clicks >= 5) {
    add(
      'dead-clicks',
      'tip',
      `Visitantes clicam em "${dead.label}" (${dead.path}), mas não é clicável`,
      `${dead.clicks} cliques nesse elemento não levaram a lugar nenhum.`,
      'Transforme esse elemento em link (para o serviço, foto ampliada ou WhatsApp) — é um interesse que hoje se perde.'
    );
  }
  const rage = (data.rageClicks || [])[0];
  if (rage && rage.clicks >= 3) {
    add(
      'rage-clicks',
      'warning',
      `Cliques repetidos de frustração em "${rage.label || 'um elemento'}" (${rage.path})`,
      `${rage.clicks} vezes alguém clicou 3 ou mais vezes seguidas no mesmo ponto.`,
      'Teste esse elemento: pode estar lento, quebrado ou parecer um botão sem ser.'
    );
  }

  // ---- horários
  const cells = data.weekHour || [];
  if (cells.length && t.sessions >= 50) {
    const peak = [...cells].sort((a, b) => b.sessions - a.sessions)[0];
    add(
      'peak-time',
      'tip',
      `Pico de visitas: ${DOW[peak.dow]} por volta das ${peak.hour}h`,
      'Esse é o horário em que mais gente está olhando o site.',
      'Publique e impulsione posts um pouco antes desse horário e garanta alguém respondendo o WhatsApp nele.'
    );
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
