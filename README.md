# Catálogo Anil — pré-orçamento online

Link que o pré-atendimento da Anil Piscinas e Spas envia ao cliente. O cliente:

1. Informa **nome completo, data de nascimento e WhatsApp**;
2. Escolhe o que procura (**Piscinas, Linha Infantil, Spas, Banheiras**);
3. Vê **somente os modelos** das categorias marcadas, com fotos, planta, medidas, ficha técnica e cor;
4. Marca opcionais (bomba, filtro, ozônio, aquecimento solar…), serviços, cidade e observações;
5. Envia e recebe um **código de atendimento** (ex.: `ANL-7K3PQ`), com botão para mandar o código e os modelos no **WhatsApp da vendedora**.

A vendedora abre o painel `/admin`, busca pelo código e já entra na fase de venda com tudo preenchido.

## Painel `/admin`

- **Orçamentos**: busca por código, nome ou telefone; status (novo, em atendimento, convertido, perdido); anotações internas; exportação CSV; botão para abrir o WhatsApp do cliente.
- **Produtos / Categorias / Opcionais**: editar textos, medidas, fotos (upload), planta, cores, ordem e visibilidade.
- **Vendedoras e links**: cada vendedora tem um link próprio (`/?v=ana`). O cliente que entra por ele envia o código direto para o WhatsApp dela. Sem `?v=`, vai para `WHATSAPP_PADRAO`.

## Integração com n8n (opcional)

Com `N8N_WEBHOOK_URL` definido, cada orçamento gera um `POST` JSON (`event: "orcamento.criado"`) com cliente, modelos, opcionais, serviços, vendedora, um `resumo` em texto e `link_painel`. Se `N8N_WEBHOOK_TOKEN` estiver definido, vai no cabeçalho `Authorization: Bearer <token>`.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `PUBLIC_URL` | URL pública, ex.: `https://catalogo.anilpiscinas.com.br` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login do painel |
| `SESSION_SECRET` | Texto aleatório para assinar a sessão do painel |
| `WHATSAPP_PADRAO` | WhatsApp (55 + DDD + número) quando o link não indica vendedora |
| `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_TOKEN` | Webhook opcional |
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
