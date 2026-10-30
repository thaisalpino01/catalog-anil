# Catálogo Anil — pré-orçamento online

Link que o pré-atendimento da Anil Piscinas e Spas envia ao cliente. O link **não pede dados pessoais** — só modelo e cidade de entrega. O cliente:

1. Escolhe o que procura (**Piscinas, Linha Infantil, Spas, Banheiras**);
2. Vê **somente os modelos** das categorias marcadas e escolhe **um modelo por tipo**, com fotos, planta, medidas, ficha técnica e cor;
3. Escolhe o **tipo de entrega** (entrega no endereço ou retirada na fábrica) e informa a **cidade** (ambos obrigatórios); serviços, equipamentos e observações são opcionais;
4. Vê a **prévia do orçamento com valor aproximado** e recebe um código (ex.: `ANL-7K3PQ`), com botão que envia o **resumo completo no WhatsApp** (código do orçamento, cidade, entrega, itens com o código de cada modelo e valor).

O valor aproximado soma os preços de tabela cadastrados no painel (produtos e opcionais "a partir de"). Item sem preço aparece como "sob consulta"; frete e instalação ficam "a combinar".

O telefone e o nome chegam para a vendedora pela própria conversa do WhatsApp. Ela abre o painel `/admin`, busca pelo código e já entra na fase de venda.

## Painel `/admin`

- **Orçamentos**: busca por código, cidade ou modelo; status (novo, em atendimento, convertido, perdido); anotações internas; exportação CSV.
- **Produtos / Categorias / Opcionais**: editar preços, textos, medidas, fotos (upload), planta, cores, ordem e visibilidade.
- **Vendedoras e links**: cada vendedora tem um link próprio (`/?v=ana`). O cliente que entra por ele envia o código direto para o WhatsApp dela. Sem `?v=`, vai para `WHATSAPP_PADRAO`.

## Integração com n8n (opcional)

Com `N8N_WEBHOOK_URL` definido, cada orçamento gera um `POST` JSON (`event: "orcamento.criado"`) com cidade de entrega, modelos, opcionais, serviços, vendedora, um `resumo` em texto e `link_painel`. Se `N8N_WEBHOOK_TOKEN` estiver definido, vai no cabeçalho `Authorization: Bearer <token>`.

## Preços do sistema da Anil (sincronização a cada 2h)

O fluxo do n8n em [`deploy/n8n-sincronizar-precos.json`](deploy/n8n-sincronizar-precos.json) roda a cada 2 horas: busca a API de preços da Anil (que só responde ao IP do servidor do n8n) e envia a lista para `POST /api/integracoes/precos` com `Authorization: Bearer <PRICE_SYNC_TOKEN>`.

- O preço é atualizado no produto cujo **código é igual à referência** do sistema (`MGP-…`, `SPA-…`, `MGB-…`).
- Produtos sem referência na API mantêm o preço do painel; referências da API sem produto no catálogo são ignoradas.
- O resultado da última sincronização aparece no painel, em **Produtos**.

Para importar: n8n → Workflows → Import from file → trocar `COLE_AQUI_O_PRICE_SYNC_TOKEN` pelo mesmo valor de `PRICE_SYNC_TOKEN` da stack → ativar.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `PUBLIC_URL` | URL pública, ex.: `https://catalogo.anilpiscinas.com.br` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login do painel |
| `SESSION_SECRET` | Texto aleatório para assinar a sessão do painel |
| `WHATSAPP_PADRAO` | WhatsApp (55 + DDD + número) quando o link não indica vendedora |
| `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN` | Webhook opcional |
| `PRICE_SYNC_TOKEN` | Token que o n8n usa para enviar os preços do sistema |
| `CODE_PREFIX` | Prefixo do código (padrão `ANL`) |
| `DATA_DIR` | Pasta do banco SQLite e das imagens (padrão `/data` no container) |

## Rodar localmente

```bash
npm install
cp .env.example .env
node --env-file=.env src/server.js
```

Requer Node 22.13+ (usa o SQLite nativo `node:sqlite`). Na primeira execução o catálogo é carregado de `seed/catalog.json` e as imagens de `seed/images` são copiadas para `DATA_DIR/media`. Depois disso, tudo é editado pelo painel — o seed não sobrescreve alterações.

## Deploy

Cada push na `main` publica `ghcr.io/thaisalpino01/catalog-anil:latest` pelo GitHub Actions. A stack para o Portainer está em [`deploy/portainer-stack.yml`](deploy/portainer-stack.yml) (Traefik + `network_swarm_public`, volume persistente `catalogo_data`).

Para atualizar após um novo push: Portainer → Stacks → catalogo → **Update the stack** com *Re-pull image* marcado (ou `docker service update --force --image ghcr.io/thaisalpino01/catalog-anil:latest catalogo_catalogo`).

## Origem do conteúdo

- Piscinas e Linha Infantil: *Catálogo Luxo – Piscinas* (PDF), com fotos, plantas e ficha técnica.
- Spas e Banheiras: site piscinasanil.com.br (nomes, medidas e fotos). Revise no painel.
