// Script de monitoramento instalado nos sites (direto ou carregado pelo botão de WhatsApp / formulário).
// Registra visitas, páginas, cliques (com posição, para o mapa de calor), rolagem, início e envio de formulário
// e cliques de contato (WhatsApp, telefone, e-mail). Não lê o que o visitante digita e não usa cookies:
// o identificador do visitante é aleatório e fica no localStorage do próprio site.

export function buildAnalyticsLoader(base, key) {
  // Trecho embutido nos scripts do botão/formulário: carrega o monitoramento uma única vez por página.
  return `(function(){
    try {
      if (window.__veskAnalytics || document.querySelector('script[data-vesk-analytics]')) return;
      var s = document.createElement('script');
      s.async = true;
      s.src = '${base}/api/t/${key}.js';
      s.setAttribute('data-vesk-analytics', '1');
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  })();`;
}

export function buildAnalyticsEmbedSnippet(base, key) {
  return `<!-- VESK CRM - Monitoramento do site -->\n<script src="${base}/api/t/${key}.js" async data-vesk-analytics="1"></script>`;
}

export function buildTrackerScript(base, key) {
  return `(function(){
  if (window.__veskAnalytics) return;
  var noop = { track: function() {}, sessionId: '' };
  // vesk_preview=1: página aberta dentro do mapa de calor do CRM — não conta como visita; só informa a rolagem
  // ao CRM (para alinhar os pontos de clique) e aceita comandos de rolagem dele.
  if (/[?&]vesk_preview=1/.test(location.search)) {
    window.__veskAnalytics = noop;
    if (window.parent && window.parent !== window) {
      var report = function() {
        try {
          var d = document.documentElement, b = document.body || {};
          window.parent.postMessage({
            veskPreview: 'scroll',
            y: window.scrollY || window.pageYOffset || 0,
            h: Math.max(d.scrollHeight || 0, b.scrollHeight || 0)
          }, '*');
        } catch (e) {}
      };
      window.addEventListener('scroll', report, { passive: true });
      window.addEventListener('load', report);
      setInterval(report, 1000);
      report();
      window.addEventListener('message', function(e) {
        var m = e.data;
        if (!m || e.source !== window.parent) return;
        if (m.veskPreview === 'scrollBy') window.scrollBy(0, Number(m.dy) || 0);
        if (m.veskPreview === 'scrollTo') window.scrollTo(0, Number(m.y) || 0);
      });
    }
    return;
  }
  if (location.protocol === 'file:' || navigator.webdriver) {
    window.__veskAnalytics = noop;
    return;
  }

  var URL_COLLECT = '${base}/api/t/${key}/collect';
  var SESSION_IDLE_MS = 30 * 60 * 1000;
  var queue = [];
  var sessionStart = null;

  function rid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function load(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  var visitor = load('vesk_vid');
  var isNewVisitor = !visitor;
  if (!visitor) { visitor = rid(); save('vesk_vid', visitor); }

  var sess = load('vesk_sess');
  var now = Date.now();
  if (!sess || !sess.id || now - (sess.last || 0) > SESSION_IDLE_MS) {
    sess = { id: rid(), last: now, dur: 0 };
    // Primeiro lote da sessão leva a origem (referrer e URL de entrada com UTMs).
    sessionStart = { r: document.referrer || '', u: location.href.slice(0, 1000), n: isNewVisitor };
  }
  sess.last = now;
  save('vesk_sess', sess);

  function path() {
    return (location.pathname || '/').slice(0, 300);
  }
  function docHeight() {
    var d = document.documentElement, b = document.body || {};
    return Math.max(d.scrollHeight || 0, b.scrollHeight || 0, d.clientHeight || 0);
  }
  function docWidth() {
    var d = document.documentElement;
    return Math.max(d.scrollWidth || 0, d.clientWidth || 0, 1);
  }

  // Tempo com a aba visível (não conta aba esquecida em segundo plano).
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  var pageVisibleMs = 0;
  function takeVisible() {
    if (visibleSince) {
      var delta = Date.now() - visibleSince;
      pageVisibleMs += delta;
      sess.dur = (sess.dur || 0) + delta / 1000;
      visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
    }
  }

  function flush() {
    if (!queue.length) return;
    takeVisible();
    sess.last = Date.now();
    save('vesk_sess', sess);
    var payload = { v: visitor, s: sess.id, dur: Math.round(sess.dur || 0), vw: window.innerWidth || 0, e: queue.splice(0, 40) };
    if (sessionStart) { payload.r = sessionStart.r; payload.u = sessionStart.u; payload.n = sessionStart.n; sessionStart = null; }
    var body = JSON.stringify(payload);
    var sent = false;
    try {
      if (navigator.sendBeacon) sent = navigator.sendBeacon(URL_COLLECT, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    } catch (e) {}
    if (!sent) {
      try {
        fetch(URL_COLLECT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: body, keepalive: true }).catch(function() {});
      } catch (e) {}
    }
    if (queue.length) flush();
  }

  function push(ev) {
    ev.p = ev.p || path();
    queue.push(ev);
    if (queue.length >= 25) flush();
  }

  // ---- páginas e rolagem ----
  var maxScroll = 0;
  var currentPath = null;
  function readScroll() {
    var h = docHeight();
    var seen = (window.scrollY || window.pageYOffset || 0) + (window.innerHeight || 0);
    var pct = h > 0 ? Math.min(100, Math.round((seen / h) * 100)) : 100;
    if (pct > maxScroll) maxScroll = pct;
  }
  function closePage() {
    if (currentPath === null) return;
    takeVisible();
    readScroll();
    push({ t: 'page_exit', p: currentPath, sc: maxScroll, ms: Math.round(pageVisibleMs) });
    currentPath = null;
  }
  function pageview() {
    var p = path();
    if (p === currentPath) return;
    closePage();
    currentPath = p;
    maxScroll = 0;
    pageVisibleMs = 0;
    visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
    push({ t: 'pageview', p: p, ti: String(document.title || '').slice(0, 120) });
    setTimeout(readScroll, 800);
    flush();
  }

  var scrollTimer = null;
  window.addEventListener('scroll', function() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function() { scrollTimer = null; readScroll(); }, 250);
  }, { passive: true });

  // Sites de página única (React, Vue…) trocam de página sem recarregar.
  try {
    var origPush = history.pushState;
    history.pushState = function() { var r = origPush.apply(this, arguments); setTimeout(pageview, 0); return r; };
    window.addEventListener('popstate', function() { setTimeout(pageview, 0); });
  } catch (e) {}

  // ---- cliques ----
  function textOf(el) {
    var t = el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || el.value || el.alt || '';
    return String(t).replace(/\\s+/g, ' ').trim().slice(0, 80);
  }
  // Só o texto do próprio elemento (um clique no fundo de uma seção não leva o texto da seção inteira).
  function ownText(el) {
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].nodeValue;
    return t.replace(/\\s+/g, ' ').trim().slice(0, 60);
  }
  function describe(el) {
    var cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  }
  function classify(href) {
    var h = String(href || '').toLowerCase();
    if (/^(https?:)?\\/\\/(wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com|chat\\.whatsapp\\.com)|^whatsapp:/.test(h)) return 'whatsapp';
    if (h.indexOf('tel:') === 0) return 'phone';
    if (h.indexOf('mailto:') === 0) return 'email';
    if (/^https?:/.test(h)) {
      try { return new URL(h).hostname.replace(/^www\\./, '') === location.hostname.replace(/^www\\./, '') ? 'link' : 'external'; } catch (e) { return 'link'; }
    }
    return 'link';
  }

  var lastClicks = [];
  document.addEventListener('click', function(e) {
    try {
      var target = e.target && e.target.closest ? e.target : null;
      if (!target) return;
      var el = target.closest('a,button,[role=button],input[type=submit],input[type=button],summary,label,select,[onclick]');
      var kind = 'dead';
      var href = '';
      var label = '';
      if (el) {
        href = el.tagName === 'A' ? (el.getAttribute('href') || '') : '';
        kind = el.tagName === 'A' ? classify(el.href || href) : 'button';
        label = textOf(el);
      } else {
        // Clique em algo que não é clicável (imagem, título…): sinal de que o visitante esperava um link.
        var tag = target.tagName ? target.tagName.toLowerCase() : '';
        if (tag === 'img') label = 'Imagem: ' + (target.alt || target.getAttribute('src') || '').split('/').pop().slice(0, 60);
        else label = ownText(target) || ('Área sem link (' + describe(target) + ')');
      }
      var pageX = e.pageX != null ? e.pageX : (e.clientX || 0) + (window.scrollX || 0);
      var pageY = e.pageY != null ? e.pageY : (e.clientY || 0) + (window.scrollY || 0);
      push({
        t: 'click', k: kind, l: label, h: String(href).slice(0, 400),
        x: Math.round((pageX / docWidth()) * 1000) / 1000, y: Math.round(pageY), ph: docHeight(), vw: window.innerWidth || 0
      });

      if (kind === 'whatsapp') push({ t: 'whatsapp_click', l: label, h: String(href).slice(0, 400) });
      else if (kind === 'phone') push({ t: 'phone_click', l: label, h: String(href).slice(0, 100) });
      else if (kind === 'email') push({ t: 'email_click', l: label, h: String(href).slice(0, 200) });

      // Cliques repetidos no mesmo lugar (frustração).
      var t = Date.now();
      lastClicks = lastClicks.filter(function(c) { return t - c.t < 1000 && Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30; });
      lastClicks.push({ t: t, x: e.clientX, y: e.clientY });
      if (lastClicks.length === 3) push({ t: 'rage_click', k: kind, l: label, x: Math.round((pageX / docWidth()) * 1000) / 1000, y: Math.round(pageY), ph: docHeight(), vw: window.innerWidth || 0 });

      if (kind === 'whatsapp' || kind === 'phone' || kind === 'email' || kind === 'external') flush();
    } catch (err) {}
  }, true);

  // ---- formulários (nunca lê os valores digitados) ----
  function formName(form) {
    if (!form) return '';
    return String(form.getAttribute('id') || form.getAttribute('name') || form.getAttribute('aria-label') || form.getAttribute('action') || 'formulário').slice(0, 80);
  }
  document.addEventListener('focusin', function(e) {
    var el = e.target;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (el.id && el.id.indexOf('vesk-wa-') === 0) return;
    var form = el.form || (el.closest && el.closest('form'));
    var keyEl = form || document.body;
    if (keyEl.__veskStarted) return;
    keyEl.__veskStarted = true;
    push({ t: 'form_start', l: formName(form) });
  }, true);
  document.addEventListener('submit', function(e) {
    push({ t: 'form_submit', l: formName(e.target) });
    flush();
  }, true);

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      closePage();
      flush();
    } else {
      visibleSince = Date.now();
      // Voltou para a aba: a mesma visualização continua (os totais são somados por sessão e página).
      if (currentPath === null) { currentPath = path(); pageVisibleMs = 0; }
    }
  });
  window.addEventListener('pagehide', function() { closePage(); flush(); });
  setInterval(flush, 5000);

  window.__veskAnalytics = {
    sessionId: sess.id,
    track: function(type, data) {
      if (!type) return;
      var ev = { t: String(type).slice(0, 24) };
      if (data && data.label) ev.l = String(data.label).slice(0, 80);
      push(ev);
      flush();
    }
  };
  // Eventos enviados antes do script carregar (botão de WhatsApp, formulário).
  var pending = window.__veskAQ || [];
  window.__veskAQ = { push: function(args) { window.__veskAnalytics.track(args[0], args[1]); } };
  for (var i = 0; i < pending.length; i++) window.__veskAQ.push(pending[i]);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pageview);
  else pageview();
})();`;
}
