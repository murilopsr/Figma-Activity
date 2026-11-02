# Figma Activity

Coleta suas versões e comentários do Figma e publica um JSON que o componente
`FigmaActivity` (no Framer) lê para desenhar o gráfico.

O JSON guarda só data/hora, tipo (versão ou comentário) e o nome do projeto que
você escolher. Não guarda nomes de arquivo, mensagens nem dados de outras pessoas.

## Passo a passo

1. **Crie um repositório** no GitHub com estas pastas (pode ser público: o JSON
   só tem timestamps e rótulos de projeto).
2. **Gere um token no Figma:** Settings > Security > Personal access tokens.
   Escopos: `file_versions:read`, `file_comments:read`, `current_user:read`.
   (Se for listar projetos inteiros: `projects:read`.)
3. **Guarde o token no GitHub:** Settings > Secrets and variables > Actions >
   New repository secret, nome `FIGMA_TOKEN`.
4. **Pegue a chave de cada arquivo:** na URL `figma.com/design/ABC123/Nome`, a
   chave é `ABC123`. Preencha `figma-activity.config.json` (um item por arquivo,
   com o nome do projeto que deve aparecer no filtro).
5. **Teste localmente (opcional):**
   `FIGMA_TOKEN=figd_xxx node scripts/fetch-figma-activity.mjs`
6. **Rode a Action:** aba Actions > "Atualizar atividade do Figma" > Run workflow.
   Depois disso ela roda sozinha todo dia.
7. **No Framer**, selecione o componente `FigmaActivity` e cole no campo
   **Data URL**:
   `https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/public/figma-activity.json`

## Observações

- **Teste primeiro com um arquivo.** Ainda não confirmei se a API lista todas as
  versões automáticas ou só as salvas manualmente. Se o gráfico vier vazio, os
  comentários ainda contam, e vale nomear versões importantes no Figma.
- O script **acumula histórico**: eventos já coletados ficam no JSON mesmo que a
  API deixe de listá-los (útil se o plano limita o histórico de versões).
- `onlyMe: true` conta só a sua atividade. Use `false` para contar o time todo.
- O limite padrão de retenção é 800 dias (`keepDays`).
- Nunca coloque o token no Framer nem no repositório; ele fica só no secret.
