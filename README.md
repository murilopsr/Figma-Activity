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

## Cobrir todos os arquivos pelas datas de modificação (opcional)

O Figma não entrega um "registro de edições por dia". O que dá para ler:

- **Versões e comentários** de cada arquivo (o que o script já faz).
- **Data da última modificação** de todos os arquivos de um projeto. Isso dá um
  ponto por arquivo (o dia em que ele foi editado pela última vez). Rodando todo
  dia, o script guarda cada nova data e o histórico vai se formando sozinho.

Para ativar:

1. **Token:** gere outro com o escopo extra `projects:read` (além dos três de antes)
   e atualize o secret `FIGMA_TOKEN`.
2. **ID do projeto:** abra a pasta/projeto no Figma. Na URL
   `figma.com/files/team/AAA/project/BBB/...`, o ID do projeto é `BBB`.
3. **Config:** adicione `projectIds` e ligue `modifiedEvents`:

```json
{
  "modifiedEvents": true,
  "projectIds": [
    { "id": "BBB", "project": "Clientes" },
    { "id": "CCC", "project": "Estudos", "deep": true }
  ]
}
```

- Sem `deep`, o script só lê a data de modificação dos arquivos (rápido, poucas
  chamadas à API). Com `"deep": true`, também busca versões e comentários de cada
  arquivo (mais completo, mas pode bater no limite de requisições).
- A data de modificação **não diz quem editou**: arquivos de times contam as
  edições de todos. Use só em projetos que são seus.
- Arquivos em **Drafts** (rascunhos pessoais) não aparecem na listagem por
  projeto. Para esses, continue usando a lista `files` com a chave de cada um.

## Cobrir TODOS os arquivos do time (teamIds)

Em vez de listar projeto por projeto, informe o ID do time e o script descobre
sozinho todos os projetos e arquivos dele.

- **ID do time:** abra o Figma e entre no seu time. Na URL
  `figma.com/files/team/AAA/...`, o ID do time é `AAA`. Se você participa de mais
  de um time, coloque todos: `"teamIds": ["AAA", "BBB"]`.
- `"teamDeep": false` (padrão): só lê a data de modificação de cada arquivo
  (rápido, poucas chamadas). `"teamDeep": true`: também busca versões e
  comentários de cada arquivo e filtra pela sua autoria (mais completo, porém
  lento e sujeito ao limite de requisições da API).
- A lista `files` serve para o que **não** entra pelo time: rascunhos (Drafts) e
  arquivos que outras pessoas compartilharam com você. Esses sempre buscam
  versões e comentários.
- Escopos do token: os de antes + `folders:read` (e `file_metadata:read`).

## Datas de criação e última edição (metaEvents)

Ligado por padrão (`"metaEvents": true`). Para cada arquivo, o script lê os
metadados e registra:

- **touched:** o dia da última edição do arquivo;
- **created:** o dia em que o arquivo foi criado (se o Figma informar).

Com `onlyMe: true`, só entram os pontos em que **você** é quem editou/criou
(quando o Figma informa o autor). Isso espalha pontos reais pelo ano, mas é só um
ponto por arquivo e por data: não mostra quanto você trabalhou em cada dia.

No log, a linha "Campos do metadata: ..." lista o que o Figma devolveu. Se não
houver `created_at` na lista, só a data da última edição é usada. Requer o escopo
`file_metadata:read`.
