"""Scraper gratuito do Google Maps via Playwright (sem API paga)."""
import re
import time
from urllib.parse import quote_plus

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


def digits_only(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def format_phone_br(phone: str) -> str:
    if not phone:
        return "—"
    d = digits_only(phone)
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return phone


def _dismiss_cookies(page) -> None:
    for label in ("Aceitar tudo", "Accept all", "Aceitar", "Accept"):
        try:
            page.get_by_role("button", name=label).click(timeout=2500)
            page.wait_for_timeout(500)
            return
        except Exception:
            pass


def _extract_detail(page) -> dict:
    phone = ""
    site = ""
    endereco = ""

    try:
        tel = page.locator('a[href^="tel:"]').first
        if tel.count():
            href = tel.get_attribute("href") or ""
            phone = href.replace("tel:", "").strip()
    except Exception:
        pass

    try:
        web = page.locator('a[data-item-id="authority"]').first
        if web.count():
            site = (web.get_attribute("href") or "").strip()
    except Exception:
        pass

    try:
        addr_btn = page.locator('button[data-item-id="address"]').first
        if addr_btn.count():
            endereco = (addr_btn.get_attribute("aria-label") or addr_btn.inner_text() or "").strip()
    except Exception:
        pass

    return {
        "telefone": format_phone_br(phone),
        "telefoneRaw": digits_only(phone),
        "site": site,
        "endereco": endereco,
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
        card_index = 0

        while len(results) < max_results and stalls < 8:
            cards = page.locator("a.hfpxzc")
            count = cards.count()

            if count == 0:
                stalls += 1
                feed.evaluate("el => { el.scrollTop = el.scrollHeight }")
                page.wait_for_timeout(1500)
                continue

            progressed = False
            while card_index < count and len(results) < max_results:
                card = cards.nth(card_index)
                card_index += 1
                try:
                    name = (card.get_attribute("aria-label") or "").strip()
                    if not name or name in seen_names:
                        continue
                    seen_names.add(name)

                    card.click(timeout=8000)
                    page.wait_for_timeout(1800)

                    detail = _extract_detail(page)
                    if only_with_phone and len(detail["telefoneRaw"]) < 10:
                        continue

                    results.append(
                        {
                            "nome": name,
                            "telefone": detail["telefone"],
                            "telefoneRaw": detail["telefoneRaw"],
                            "site": detail["site"],
                            "endereco": detail["endereco"],
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
