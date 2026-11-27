# Regras do Projeto — Projeto-PilotFlow

## Controle de Git (Commit e Push)
- Nunca executar `git commit` ou `git push` automaticamente, mesmo com o Antigravity no modo Turbo.
- Só fazer `commit` e `push` quando o usuário solicitar explicitamente ou se for estritamente necessário — e, nesse caso, avisar e confirmar com o usuário antes.

## Geração de Imagens e Custos (OpenAI)
- Sempre manter o modelo `chatgpt-image-latest` na qualidade padrão/econômica (`medium`/default, sem `quality: "high"`).
- Nunca alterar esse nível de qualidade para opções mais caras a menos que o usuário peça ou seja tecnicamente necessário — e sempre avisar antes de mudar.

## Padrão Visual dos Criativos (IA)
- Criativos gerados por IA devem ser 100% full-bleed (de ponta a ponta), sem faixa/mancha branca superior nem bordas coloridas artificiais.
- Manter os prompts de imagem enxutos e diretos para evitar sobrecarga textual e erros de ortografia em português (PT-BR).

## Geração de Imagens e Textos (Google Gemini) — Padrão Aprovado
- Manter inalterado o padrão atual de geração de imagens do Google Gemini (`gemini-3-pro-image` para imagem única, `gemini-3.1-flash-image` para carrossel, `imageConfig: { aspectRatio, imageSize: "1K" }`, e as direções fotográficas ultrarrealistas full-bleed com CTA centralizado e logo livre no canto inferior esquerdo em `app/api/cron/gerar-e-postar/route.ts` e `lib/ai-engine.ts`).
- Nunca alterar modelos, parâmetros ou estilo visual dos criativos gerados pelo Gemini a menos que o usuário solicite explicitamente; se houver necessidade técnica de mudança, avisar e confirmar com o usuário antes.

## Módulo de Tráfego Pago (Meta Ads & TikTok) — Arquitetura de Referência
- Sempre consultar [docs/arquitetura-campanhas-saas.md](docs/arquitetura-campanhas-saas.md) antes de planejar ou implementar qualquer funcionalidade de criação, gestão, monitoramento ou automação de campanhas de tráfego pago neste SaaS.
- Seguir estritamente as decisões arquiteturais do documento: orquestração 100% no backend Node.js multi-tenant (sem MCP local), reaproveitamento de posts orgânicos existentes (zero re-upload), criação segura como `PAUSED`, IA via Structured Outputs e TikTok Ads bloqueado com feature flag ("Em breve") até aprovação da TikTok Marketing API.
