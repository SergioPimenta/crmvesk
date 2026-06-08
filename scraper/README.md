# Scraper Google Maps (Python + Playwright)

Serviço gratuito de busca no Google Maps. O CRM na Vercel chama este serviço via `MAPS_SCRAPER_URL`.

## Local

```bash
pip install -r scraper/requirements.txt
playwright install chromium
npm run scraper
```

No `server/.env`: `MAPS_SCRAPER_URL=http://localhost:8765`

## Deploy no Render (recomendado)

1. Acesse [Render Dashboard](https://dashboard.render.com/) → **New** → **Web Service**
2. Conecte o repositório `SergioPimenta/crmvesk`
3. **Root Directory:** `scraper`
4. **Runtime:** Docker (usa o `Dockerfile` desta pasta)
5. Plano **Free** ou superior (Free pode hibernar após inatividade)
6. Após o deploy, copie a URL (ex.: `https://crmvesk-maps-scraper.onrender.com`)
7. Na Vercel → Settings → Environment Variables:
   - `MAPS_SCRAPER_URL` = `https://sua-url.onrender.com` (sem barra no final)

Teste: `GET https://sua-url.onrender.com/health`

## Variáveis

| Variável | Onde | Descrição |
|----------|------|-----------|
| `MAPS_SCRAPER_URL` | Vercel / server/.env | URL do serviço Python |
| `GOOGLE_MAPS_API_KEY` | Vercel (opcional) | Fallback pago via Places API |
