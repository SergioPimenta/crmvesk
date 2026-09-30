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

## Atendimento por WhatsApp

- **Filas:** Aguardando (sem responsável), Em andamento e Finalizados. "Assumir conversa" atribui a você; quando o
  cliente escreve numa conversa finalizada, ela volta para Aguardando.
- **Respostas rápidas:** textos prontos da equipe. No campo de mensagem, digite `/` e escolha pelo atalho (setas +
  Enter). Cada um edita as que criou; administradores editam todas.
- **Notas internas:** botão de notas no campo de mensagem. A nota aparece só para a equipe e nunca é enviada ao
  cliente.
- **Histórico da conversa:** assumida, transferida, devolvida, finalizada e reaberta aparecem na própria conversa.
- **Falhas de envio:** o motivo informado pela Meta aparece no balão "Não entregue".
- **Aviso sonoro:** toque e contagem no título da aba quando chega uma conversa nova em Aguardando (sino na lista
  liga e desliga).
- **Acesso:** usuário comum só abre conversas sem responsável ou atribuídas a ele; administradores abrem todas.

## Agenda

- **Calendário real:** visões Dia, Semana e Mês ligadas às atividades, com a linha do "agora", navegação por data e
  filtros por tipo, responsável, concluídas e busca.
- **Criar e remarcar:** clique num horário vazio para criar; arraste um compromisso para outro horário ou dia (passo
  de 15 min) e puxe a borda de baixo para mudar a duração. No mês, arraste o compromisso para outro dia.
- **Atividade completa:** data e hora reais (guardadas em UTC, exibidas no fuso do navegador), duração ou dia inteiro,
  contato, negócio, responsável, prioridade, local, link de videochamada e descrição.
- **Painel lateral:** atrasadas, hoje, próximos 7 dias e atividades antigas sem data; concluir com um clique.
- **Visibilidade:** administradores veem tudo; usuários veem as atividades que criaram **ou** que foram designadas a
  eles. Exclusões ficam copiadas em `deleted_records`.
- O Dashboard mostra as atrasadas e as de hoje reais.

### Lembretes da Agenda

- Cada atividade com horário tem uma antecedência (na hora, 5 min… 1 dia antes; o padrão é 15 min). Ao chegar a hora,
  o responsável (ou quem criou) recebe: um aviso no **sino** do sistema, **push no celular** (se ativado) e, se ligar
  "Lembretes por e-mail" no sino, um e-mail. Remarcar ou mudar a antecedência reabilita o lembrete.
- **Quem dispara:** enquanto alguém estiver com o CRM aberto, os lembretes vencidos são disparados sozinhos (a cada
  consulta do sino, no máximo a cada 20 s). Para avisar **com o CRM fechado** (push e e-mail), configure um agendador
  que chame `GET /api/cron/reminders` a cada minuto com o cabeçalho `Authorization: Bearer <CRON_SECRET>`:
  - **Vercel Cron** (exige plano Pro para rodar a cada minuto; o plano Hobby só aceita uma vez por dia): em
    `vercel.json`, `"crons": [{ "path": "/api/cron/reminders", "schedule": "* * * * *" }]` e a variável
    `CRON_SECRET` no projeto (a Vercel envia o cabeçalho sozinha); ou
  - um serviço externo gratuito (ex.: cron-job.org) chamando a URL a cada minuto com o cabeçalho acima.
- Ao concluir uma **reunião ou ligação**, o sistema pergunta "Como foi?": registra o resultado na atividade, permite
  mover o negócio de etapa e já agendar o próximo passo.
- **Ligações com o restante do CRM:** botão "Agendar" na conversa do WhatsApp (já com contato e telefone) e lista de
  atividades + "Agendar" na ficha do contato.

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
