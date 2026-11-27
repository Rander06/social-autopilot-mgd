# Contexto Técnico e Arquitetura: Módulo de Tráfego Pago no SaaS (Meta Ads & TikTok)

## 1. Visão Geral e Objetivo do Projeto
Este projeto é um **SaaS multi-tenant (Node.js / Next.js)** que já gera criativos com IA e realiza postagens orgânicas automáticas no Facebook, Instagram e TikTok. 
O objetivo agora é integrar um **módulo nativo de criação e gestão de campanhas de tráfego pago**, permitindo que cada empresa cliente conecte suas próprias contas de anúncios e clique em um botão **"Criar Campanha" (Impulsionar)** diretamente nos posts orgânicos já publicados pelo sistema.

---

## 2. Decisões de Arquitetura (SaaS Nuvem vs. MCP Local)
* **NÃO usar MCP local (Claude Code / Codex) nem scripts locais:** Ferramentas via MCP local funcionam apenas para operação single-user no computador do gestor. Em um SaaS multi-tenant, toda a orquestração deve rodar no **backend Node.js** via chamadas REST diretas às APIs oficiais, utilizando o `access_token` de cada empresa (`company_id`).
* **Aproveitamento de Prova Social (Zero Re-upload):** Como o SaaS já publica os posts organicamente, **não devemos fazer upload de imagem/vídeo novamente** na API de anúncios. Devemos referenciar o ID da publicação existente para manter curtidas, comentários e compartilhamentos intactos.
* **Inteligência Artificial via Structured Outputs:** As "skills" de tráfego (parser de comando em linguagem natural para parâmetros de campanha) serão implementadas no backend usando chamadas de LLM (Gemini/OpenAI) com **JSON Schema estrito (Structured Outputs)** para converter o pedido do usuário em payloads válidos da API.
* **Monitoramento via API Route Serverless + Supabase `pg_cron`:** Como a aplicação roda em Next.js serverless (Vercel), o monitoramento de métricas (`/insights`) e aplicação das regras de decisão (`decide()`) deve rodar em uma rota backend dedicada (`GET /api/cron/monitorar-campanhas`, protegida por `CRON_SECRET`), disparada a cada 6h/12h via **`pg_cron` + `pg_net`** do Supabase (seguindo o mesmo padrão do agendador de posts em `supabase/schema.sql`).

---

## 3. Estado Atual das Integrações e Permissões
1. **Meta (Facebook & Instagram):**
   * Já existe um App Meta aprovado em modo **Live** para postagens orgânicas.
   * **Mesma API e Mesmo App:** Utilizaremos a mesma Graph/Marketing API (`v26.0`) no novo `MetaAdsService` e o mesmo App ID.
   * **Implantação em 2 Fases (Testes Internos → Clientes Externos):**
     * **Fase 1 (Validação imediata na conta própria):** Adicionar o produto **Marketing API** no painel Meta e utilizar **System User Token** salvo com criptografia AES-256-GCM na aba *Integrações* contendo os escopos `ads_management`, `ads_read` e `business_management`.
     * **Fase 2 (Clientes externos em escala):** Implementar fluxo OAuth dedicado (`/api/meta/auth` e `/api/meta/callback` via *Facebook Login for Business*) e submeter **App Review** (com screencast da interface do SaaS) para obter **Advanced Access** em `ads_management`, `ads_read` e `business_management`.
2. **TikTok:**
   * Atualmente operando apenas em ambiente **Sandbox** (postagens em conta privada).
   * **Ação no Produto:** Manter a opção de criar campanhas no TikTok bloqueada na UI (ex: badge *"Em breve"* / Feature Flag) até a aprovação oficial da **TikTok Marketing API** (escopo de *Spark Ads*, onde o vídeo orgânico já publicado é impulsionado via `tiktok_item_id` com `identity_type: "TT_USER"`).

---

## 4. Fluxo de Dados e Banco de Dados (Multi-Tenant por `company_id`)

> **Padrão do Banco:** Todo o schema atual do PilotFlow ([supabase/schema.sql](../supabase/schema.sql)) utiliza **`company_id`** (`references public.companies(id)`) como chave multi-tenant (equivalente a `tenant_id`).

### A. Dados que o fluxo de postagem orgânica já grava em `public.posts_history`:
* Para Facebook: `fb_page_id` (em `integrations`) e `fb_post_id` (salvo **já no formato composto `${page_id}_${post_id}`**).
* Para Instagram: `ig_user_id` (em `integrations`) e `ig_post_id` (`ig_media_id` numérico retornado por `/media_publish`).

### B. Novas Tabelas no Supabase (`supabase/migration_meta_ads.sql`):
* **`public.ad_accounts`:** Vinculada a `company_id` + `provider` (`META` | `TIKTOK`), armazenando `ad_account_id` (`act_XXXXXXXXX`, selecionado após listar `GET /v26.0/me/adaccounts?fields=id,name,currency,account_status`), `account_name`, `currency`, `account_status`, `is_default` e o **Perfil de Decisão (`decide()`)**: `cpa_maximo`, `roas_minimo`, `amostra_minima_cliques`, `link_destino_padrao`, `localizacao_base` e `auto_pause_enabled`.
* **`public.ad_campaigns`:** Vinculada a `company_id` e `post_id` (`references public.posts_history(id)`), armazenando canal (`INSTAGRAM` | `FACEBOOK` | `TIKTOK`), `ad_account_id`, objetivo, orçamento diário em centavos (`daily_budget_cents`), `currency`, `targeting_json`, IDs criados na Meta (`meta_campaign_id`, `meta_adset_id`, `meta_creative_id`, `meta_ad_id`), `status` (`DRAFT` | `PAUSED` | `ACTIVE` | `ARCHIVED` | `ERROR`) e último veredito/insights (`last_verdict`, `last_verdict_reason`, `last_insights_json`, `last_insights_at`).

---

## 5. Pipeline de Criação de Campanha na Meta Graph API (`v26.0`)

Quando o cliente clicar em **"Criar Campanha"** em um post já publicado e preencher o modal (ex: *"Rodar R$ 40/dia por 7 dias focando em tráfego/mensagens"*):

1. **Parser de IA (Backend) + Validações:**
   * Converte o texto do usuário + configurações padrão da conta (`ad_accounts`) em um JSON validado contendo: `objective`, `daily_budget_cents`, `targeting` (`geo_locations`, `age_min`, `age_max`) e `optimization_goal`.
   * **Moeda & Orçamento Mínimo:** Respeitar a moeda (`currency`) da conta selecionada e validar o orçamento mínimo diário da Meta (ex.: ≥ R\$ 6,00/dia = `600` centavos em `BRL`).
   * **Geolocalização Real (`searchGeoLocations()`):** Cidades/raios exigem `key` numérica obtida via `GET /v26.0/search?type=adgeolocation&q=...` (nunca texto livre no `targeting.geo_locations`), com fallback seguro para `{ countries: ["BR"] }`.
2. **Passo 1 — Criar Campanha (`POST /v26.0/{ad_account_id}/campaigns`):**
   * Payload: `{ name, objective: 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'OUTCOME_SALES', status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false }`.
   * *Regra de segurança:* Sempre criar como `PAUSED` (ou exigir confirmação explícita antes de ativar) para evitar gasto acidental.
3. **Passo 2 — Criar Conjunto de Anúncios (`POST /v26.0/{ad_account_id}/adsets`):**
   * Payload: `{ name, campaign_id, daily_budget (em centavos), billing_event: 'IMPRESSIONS', optimization_goal, bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: { ...targeting, targeting_automation: { advantage_audience: 0 } }, status: 'PAUSED' }`.
   * Para objetivos de **Mensagens/WhatsApp** ou **Leads**, incluir `destination_type` (ex.: `WHATSAPP` | `WEBSITE`) e `promoted_object: { page_id }` conforme exigência da `v26.0`.
4. **Passo 3 — Criar AdCreative reaproveitando o Post (`POST /v26.0/{ad_account_id}/adcreatives`):**
   * Se for post do **Facebook**: normalizar para nunca duplicar o `page_id` (`const objectStoryId = fbPostId.includes("_") ? fbPostId : "${pageId}_${fbPostId}"`) e enviar `{ name, object_story_id: objectStoryId }`.
   * Se for post do **Instagram**: enviar `{ name, object_id: page_id, instagram_user_id, source_instagram_media_id: ig_media_id }` (observando as combinações de `call_to_action` permitidas pela Meta para mídia orgânica do Instagram).
5. **Passo 4 — Criar Anúncio (`POST /v26.0/{ad_account_id}/ads`):**
   * Payload: `{ name, adset_id, creative: { creative_id }, status: 'PAUSED' }`.

---

## 6. Motor de Monitoramento e Regras (`decide()`)
* **Worker Agendado (a cada 6h ou 12h via Vercel Cron / Supabase `pg_cron` → `GET /api/cron/monitorar-campanhas`):** Consulta `GET /v26.0/{ad_account_id}/insights?level=ad&date_preset=last_7d&fields=ad_id,ad_name,spend,impressions,clicks,ctr,cpc,actions`.
* **Lógica de Veredito:** Compara o desempenho real com o perfil da empresa/conta (`ad_accounts`) no banco:
  * **ESCALAR:** CPA ≤ `cpa_maximo` (ou ROAS ≥ `roas_minimo`) com volume acima da amostra mínima (`amostra_minima_cliques`).
  * **PAUSAR:** Gasto ≥ `2× cpa_maximo` com zero conversões (pode pausar automaticamente na Meta se `auto_pause_enabled = true`, ou apenas registrar alerta no dashboard).
  * **MANTER:** Dados insuficientes ou campanha ainda dentro das primeiras 48h (janela mínima para não quebrar a fase de aprendizado do algoritmo).

---

## 7. Roadmap de Implementação no Código
1. **[Concluído]** Inspecionar autenticação Meta atual (`integrations.meta_token_enc`, `ig_user_id`, `fb_page_id`) e armazenamento dos IDs orgânicos (`posts_history.ig_post_id` e `fb_post_id`).
2. **[Concluído]** Criar a migration SQL (`supabase/migration_meta_ads.sql`), atualizar `supabase/schema.sql`, criar tipos em `lib/types.ts` e CRUD multi-tenant por `company_id` em `lib/store.ts` para `ad_accounts` e `ad_campaigns`.
3. **[Concluído]** Implementar o serviço `MetaAdsService` em Node.js (`lib/meta-ads.ts`, Graph API `v26.0`) com: `listAdAccounts()`, `checkAdsPermissions()`, `searchGeoLocations()`, `createCampaignFromExistingPost()`, `toggleEntityStatus()` e `fetchAdInsights()`.
4. **[Concluído]** Criar os 5 serviços adaptados da arquitetura ZX LAB (`lib/ads-orchestrator.ts`), endpoint `/api/ads` (Structured Output + gestão) e cron serverless `GET /api/cron/monitorar-campanhas` (janelas 4d/7d/14d/30d + motor `decide()`).
5. **[Concluído]** Criar os componentes de UI (`app/components/CampaignsModule.tsx` + `app/page.tsx`): aba **"Campanhas"**, botão **"Impulsionar / Criar Campanha"** nos posts publicados + modal de criação rápida com prévia IA + seletor/perfil de conta de anúncios (`decide()`) + badge *"Em breve"* para TikTok Ads.

---

## 8. Mapeamento das Skills (Modelo ZX LAB adaptado para Backend Node.js)
Em vez de arquivos `SKILL.md` locais, o backend deve implementar a lógica dos 5 módulos da arquitetura ZX LAB como serviços/prompts especializados:

1. **Orquestrador (`CampaignOrchestratorService`):**
   * Recebe a intenção do usuário no modal ou dashboard, consulta o perfil de metas do cliente (`decide()`) e os dados recentes da conta, e roteia para o serviço adequado.
2. **Lançador de Campanhas (`CampaignLauncherService` — equiv. `meta-campaign-launcher`):**
   * Converte o comando em linguagem natural (ex: *"R$ 50/dia para leads em Uberaba"*) em JSON estruturado via LLM e cria Campanha + Conjunto + Anúncio apontando para o `post_id`/`ig_media_id` existente, sempre em `PAUSED`.
3. **Coletor de Métricas (`MetricsFetcherWorker` — equiv. `meta-metrics-fetcher`):**
   * Cron job que busca insights da Graph API nas janelas de **4, 7, 14 e 30 dias** (CPL, CPA, ROAS, CPM, CTR, CPC e Frequência) e salva no banco para alimentar o dashboard do cliente sem depender da API em tempo real a cada clique.
4. **Analisador de Performance (`PerformanceAnalyzerService` — equiv. `meta-performance-analyzer`):**
   * Cruza as métricas coletadas com os limiares do cliente (`cpa_maximo`, `roas_minimo`, `amostra_minima`) e gera o veredito **ESCALAR / MATAR / MANTER** com explicação gerada por IA (identificando fadiga criativa quando a frequência sobe e o CTR cai).
5. **Otimizador de Orçamento & Copy (`BudgetAndCreativeAdvisor` — equiv. `meta-budget-optimizer` e `meta-creative-brief`):**
   * Sugere no painel de onde tirar verba (conjuntos com CPA estourado) e para onde mover (conjuntos vencedores), além de gerar novos ganchos de copy/roteiro para o módulo de criação orgânica do SaaS com base nos posts impulsionados que mais converteram.
