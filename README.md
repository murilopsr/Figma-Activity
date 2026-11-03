# Figma Activity

Coleta suas versões, comentários e datas de edição do Figma e publica um JSON que o
componente `FigmaActivity` (Framer) lê para desenhar o gráfico.

## O que fica público (e o que não)

- **Público (neste repositório):** `public/figma-activity.json`, com só `t` (data/hora),
  `kind` (version, comment, touched) e `id` (código opaco, não dá para descobrir o arquivo).
- **Fora do repositório:** o config com as chaves dos seus arquivos fica no **secret
  `FIGMA_CONFIG`**. Nomes de arquivos/clientes não são gravados em lugar nenhum, e os logs da
  Action mostram só "arquivo #N".

## Configuração (uma vez)

1. **Token do Figma** (Settings > Security > Personal access tokens), só leitura:
   `current_user:read`, `file_versions:read`, `file_comments:read`, `file_metadata:read`.
   Escolha a validade mais longa e **não cole o token em conversas**.
2. No GitHub: **Settings > Secrets and variables > Actions > New repository secret**
   - `FIGMA_TOKEN`: o token do passo 1.
   - `FIGMA_CONFIG`: o conteúdo do seu config (veja `figma-activity.config.example.json`),
     com a chave de cada arquivo. Exemplo de chave: em `figma.com/design/ABC123/Nome`, é `ABC123`.
3. Aba **Actions > Atualizar atividade do Figma > Run workflow**.
4. O gráfico lê:
   `https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/public/figma-activity.json`

## Opções do config

| Campo | Padrão | O que faz |
|---|---|---|
| `onlyMe` | `true` | conta só a sua atividade (versões, comentários, edições feitas por você) |
| `metaEvents` | `true` | acrescenta a data da última edição (e de criação, se o Figma informar) de cada arquivo |
| `keepDays` | `800` | quantos dias de histórico manter |
| `includeProjects` | `false` | grava o nome do projeto no JSON. **Não ative em repositório público** |
| `idSalt` | vazio | texto secreto extra para gerar os códigos opacos |

## Segurança

- Nunca coloque o config, chaves de arquivo ou token no repositório (o `.gitignore` já bloqueia).
- Se uma chave de arquivo tiver sido exposta, deixe o compartilhamento por link do arquivo
  como restrito no Figma.
- Os logs de Actions em repositório público são públicos: o script não imprime nomes nem chaves.
