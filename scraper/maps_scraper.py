"""Scraper gratuito do Google Maps via Playwright (sem API paga)."""
import re
from urllib.parse import quote_plus

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

PHONE_RE = re.compile(r"\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}")
DOMAIN_RE = re.compile(
    r"(?:Acesse o site[·\s]+|·\s*)([\w-]+(?:\.[\w-]+)+(?:/[\w./-]*)?)",
    re.IGNORECASE,
)


def digits_only(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def format_phone_br(phone: str) -> str:
    if not phone:
        return "—"
    d = digits_only(phone)
    if d.startswith("0") and len(d) > 11:
        d = d.lstrip("0")
    if len(d) == 13 and d.startswith("55"):
        d = d[2:]
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return phone.strip()


def _dismiss_cookies(page) -> None:
    for label in ("Aceitar tudo", "Accept all", "Aceitar", "Accept"):
        try:
            page.get_by_role("button", name=label).click(timeout=2500)
            page.wait_for_timeout(500)
            return
        except Exception:
            pass


def _parse_phone_from_text(text: str) -> str:
    matches = PHONE_RE.findall(text or "")
    return matches[-1].strip() if matches else ""


def _parse_site_from_text(text: str) -> str:
    m = DOMAIN_RE.search(text or "")
    if not m:
        return ""
    site = m.group(1).strip().rstrip("·")
    if not site.startswith("http"):
        site = f"https://{site}"
    return site


def _extract_from_article(article) -> dict:
    """Extrai nome, telefone, site e endereço direto do card da lista (sem abrir painel)."""
    data = article.evaluate(
        """(el) => {
            const link = el.querySelector('a.hfpxzc');
            const name = (link && link.getAttribute('aria-label')) || '';
            const text = el.innerText || '';

            let site = '';
            for (const a of el.querySelectorAll('a[href]')) {
                const href = a.href || '';
                const aria = (a.getAttribute('aria-label') || '').toLowerCase();
                if (!href.startsWith('http')) continue;
                if (href.includes('google.com/maps') || href.includes('google.com/aclk')) continue;
                if (aria.includes('acessar o site') || aria.includes('website') || aria.includes('site de')) {
                    site = href;
                    break;
                }
            }
            if (!site) {
                for (const a of el.querySelectorAll('a[href^="http"]')) {
                    const href = a.href || '';
                    if (href.includes('google.com') || href.includes('gstatic.com')) continue;
                    site = href;
                    break;
                }
            }

            let endereco = '';
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (line === name || /^\\d[,.]\\d/.test(line) || /^patrocinado$/i.test(line)) continue;
                if (/^(aberto|fechado|fecha|abre)/i.test(line)) continue;
                if (line.includes('·') && /\\(\\d{2}\\)/.test(line)) {
                    const part = line.split('·').map(p => p.trim()).find(p =>
                        !/^(aberto|fechado|fecha|abre)/i.test(p) && !/\\(\\d{2}\\)\\s*\\d/.test(p)
                    );
                    if (part && part.length > 8) endereco = part;
                    continue;
                }
                if (/\\(\\d{2}\\)\\s*\\d{4}/.test(line)) continue;
                if (/website|rotas|ligar|reservar/i.test(line)) continue;
                if (line.length > 10 && (line.includes('Rua') || line.includes('Av') || line.includes('-') || line.includes(','))) {
                    endereco = line.replace(/^[^·]+·\\s*/, '').trim();
                }
            }

            return { name, text, site, endereco };
        }"""
    )

    phone_raw = _parse_phone_from_text(data.get("text", ""))
    site = (data.get("site") or "").strip()
    if not site:
        site = _parse_site_from_text(data.get("text", ""))

    return {
        "nome": (data.get("name") or "").strip(),
        "telefone": format_phone_br(phone_raw),
        "telefoneRaw": digits_only(phone_raw),
        "site": site,
        "endereco": (data.get("endereco") or "").strip(),
    }


def _extract_detail_panel(page) -> dict:
    """Fallback: painel lateral após clique no card."""
    phone = ""
    site = ""
    endereco = ""

    try:
        page.wait_for_url(re.compile(r"/maps/place/"), timeout=8000)
    except Exception:
        pass
    page.wait_for_timeout(1200)

    panel = page.evaluate(
        """() => {
            let phone = '';
            let site = '';
            let endereco = '';

            for (const a of document.querySelectorAll('a[href^="tel:"]')) {
                phone = (a.getAttribute('href') || '').replace('tel:', '').trim();
                if (phone) break;
            }
            if (!phone) {
                const btn = document.querySelector('button[data-item-id^="phone"]');
                if (btn) {
                    const aria = btn.getAttribute('aria-label') || '';
                    const m = aria.match(/\\(\\d{2}\\)\\s*[\\d-]+/);
                    if (m) phone = m[0];
                    else phone = (btn.innerText || '').trim();
                }
            }

            for (const a of document.querySelectorAll('a[href^="http"]')) {
                const href = a.href || '';
                const aria = (a.getAttribute('aria-label') || '').toLowerCase();
                if (href.includes('google.com/maps') || href.includes('google.com/aclk')) continue;
                if (a.getAttribute('data-item-id') === 'authority' || aria.includes('site') || aria.includes('website')) {
                    site = href;
                    break;
                }
            }

            const addrBtn = document.querySelector('button[data-item-id="address"], button[data-item-id*="address"]');
            if (addrBtn) {
                endereco = (addrBtn.getAttribute('aria-label') || addrBtn.innerText || '').trim();
                endereco = endereco.replace(/^Endere[cç]o:\\s*/i, '');
            }

            return { phone, site, endereco };
        }"""
    )

    phone = panel.get("phone") or phone
    site = panel.get("site") or site
    endereco = panel.get("endereco") or endereco

    return {
        "telefone": format_phone_br(phone),
        "telefoneRaw": digits_only(phone),
        "site": (site or "").strip(),
        "endereco": (endereco or "").strip(),
    }


def scrape_google_maps(
    query: str,
    limit: int = 30,
    headless: bool = True,
    only_with_phone: bool = False,
) -> list[dict]:
    text_query = (query or "").strip()
    if not text_query:
        raise ValueError("Informe o termo de busca")

    max_results = max(1, min(int(limit or 30), 60))
    results: list[dict] = []
    seen_names: set[str] = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            locale="pt-BR",
            viewport={"width": 1360, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        page.set_default_timeout(45000)

        url = f"https://www.google.com/maps/search/{quote_plus(text_query)}"
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2000)
        _dismiss_cookies(page)

        feed = page.locator('div[role="feed"]')
        try:
            feed.wait_for(state="visible", timeout=35000)
        except PlaywrightTimeout as exc:
            browser.close()
            raise RuntimeError(
                "Não foi possível carregar resultados do Google Maps. Tente outro termo de busca."
            ) from exc

        stalls = 0
        article_index = 0

        while len(results) < max_results and stalls < 10:
            articles = page.locator('div[role="feed"] div[role="article"]')
            count = articles.count()

            if count == 0:
                stalls += 1
                feed.evaluate("el => { el.scrollTop = el.scrollHeight }")
                page.wait_for_timeout(1500)
                continue

            progressed = False
            while article_index < count and len(results) < max_results:
                article = articles.nth(article_index)
                article_index += 1
                try:
                    item = _extract_from_article(article)
                    name = item["nome"]
                    if not name or name in seen_names:
                        continue

                    if len(item["telefoneRaw"]) < 10 or not item["site"]:
                        try:
                            link = article.locator("a.hfpxzc").first
                            if link.count():
                                link.click(timeout=8000)
                                detail = _extract_detail_panel(page)
                                if len(item["telefoneRaw"]) < 10 and len(detail["telefoneRaw"]) >= 10:
                                    item["telefone"] = detail["telefone"]
                                    item["telefoneRaw"] = detail["telefoneRaw"]
                                if not item["site"] and detail["site"]:
                                    item["site"] = detail["site"]
                                if not item["endereco"] and detail["endereco"]:
                                    item["endereco"] = detail["endereco"]
                        except Exception:
                            pass

                    if only_with_phone and len(item["telefoneRaw"]) < 10:
                        continue

                    seen_names.add(name)
                    results.append(
                        {
                            "nome": name,
                            "telefone": item["telefone"],
                            "telefoneRaw": item["telefoneRaw"],
                            "site": item["site"],
                            "endereco": item["endereco"],
                        }
                    )
                    progressed = True
                except Exception:
                    continue

            if progressed:
                stalls = 0
            else:
                stalls += 1

            if len(results) >= max_results:
                break

            feed.evaluate("el => { el.scrollTop = el.scrollHeight }")
            page.wait_for_timeout(1600)

        browser.close()

    return results
