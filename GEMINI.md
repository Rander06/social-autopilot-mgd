# Regras do Projeto — Marketing Meta Graph API

## Controle de Git (Commit e Push)
- Nunca executar `git commit` ou `git push` automaticamente, mesmo com o Antigravity no modo Turbo.
- Só fazer `commit` e `push` quando o usuário solicitar explicitamente ou se for estritamente necessário — e, nesse caso, avisar e confirmar com o usuário antes.

## Geração de Imagens e Custos (OpenAI)
- Sempre manter o modelo `chatgpt-image-latest` na qualidade padrão/econômica (`medium`/default, sem `quality: "high"`).
- Nunca alterar esse nível de qualidade para opções mais caras a menos que o usuário peça ou seja tecnicamente necessário — e sempre avisar antes de mudar.

## Padrão Visual dos Criativos (IA)
- Criativos gerados por IA devem ser 100% full-bleed (de ponta a ponta), sem faixa/mancha branca superior nem bordas coloridas artificiais.
- Manter os prompts de imagem enxutos e diretos para evitar sobrecarga textual e erros de ortografia em português (PT-BR).
