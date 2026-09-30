# VESK CRM

CRM com funil de vendas, contatos, propostas, atendimento por WhatsApp (API oficial da Meta), botão de WhatsApp e
captura de formulários para sites, e prospecção pelo Google Maps.

- **Frontend:** React 18 + TypeScript + Vite (`src/`)
- **API:** Express 4 em Node 20+ (`server/`), publicada como função serverless na Vercel (`api/index.js`)
- **Banco:** Postgres (Neon / Vercel Postgres) — o esquema é aplicado automaticamente (`server/migrate.js`)
- **Scraper do Google Maps:** serviço Python + Playwright separado (`scraper/`, veja `scraper/README.md`)

## Rodando localmente

```bash
npm install
cp .env.example server/.env   # preencha POSTGRES_URL e JWT_SECRET
npm run dev:server            # API em http://localhost:3001
npm run dev                   # frontend em http://localhost:5173 (proxy /api → 3001)
```

Para criar o primeiro administrador, defina `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` (8+ caracteres) antes de subir
o servidor. Novos usuários entram por convite (Usuários → Convidar).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `npm run dev:server` | Frontend / API em modo de desenvolvimento |
| `npm run build` | Checagem de tipos + build de produção |
| `npm run typecheck` | Só a checagem de tipos |
| `npm run lint` | ESLint (frontend + servidor) |
| `npm test` | Testes do servidor (`node --test`, sem dependências extras) |
| `npm run scraper` | Sobe o scraper do Google Maps localmente |

## Variáveis de ambiente

Todas estão documentadas, agrupadas, em [`.env.example`](.env.example). As obrigatórias são `POSTGRES_URL` e
`JWT_SECRET`.

## Modelo de acesso

- **Workspace:** cada conta é um workspace. Usuários convidados entram no workspace de quem os convidou.
- **Administrador:** vê todos os dados do workspace, gerencia usuários, integrações e atribui responsáveis.
- **Usuário:** só vê e altera o que ele mesmo criou (contatos, negócios, empresas, atividades, e-mails, propostas e
  grupos de disparo) e as conversas de WhatsApp sem responsável ou atribuídas a ele. Dados sem dono (anteriores ao
  recurso ou captados por site sem responsável definido) ficam visíveis só para administradores.
- **Leads de sites:** cada botão de WhatsApp e formulário de contato tem um "Responsável pelos leads" (ninguém,
  usuário fixo ou rodízio).

## Segurança e operação

- Sessão JWT de 4 h, renovada automaticamente enquanto há uso; perfil e status do usuário são lidos do banco
  (cache de 15 s).
- Limite de requisições no login, no aceite de convite e nos endpoints públicos (contador no Postgres, tabela
  `rate_limits`).
- Webhook da Meta exige assinatura `X-Hub-Signature-256` (veja `WHATSAPP_SIGNATURE_MODE` no `.env.example`).
- Exclusões de contatos, negócios e e-mails ficam copiadas em `deleted_records` (180 dias) para recuperação manual.
- Logs de webhook do WhatsApp são apagados após 30 dias.
- `GET /api/health` verifica o servidor e o banco (use em monitoramento de disponibilidade).
- Erros do navegador são enviados para `POST /api/client-errors` e aparecem nos logs do servidor.

## Deploy (Vercel)

O deploy é feito pela integração Git da Vercel (`vercel.json`). Configure as variáveis do `.env.example` no projeto.
As migrações rodam no primeiro acesso após mudar o esquema. O GitHub Actions (`.github/workflows/ci.yml`) roda tipos,
lint e testes em cada push e pull request.
