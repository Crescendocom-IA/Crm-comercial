# Plano de evolução — FlowCRM

Documento vivo: cada ideia entra aqui conforme é discutida. Nada foi implementado ainda.

**Status:** 💬 em discussão · ✅ decidido · 🔨 em implementação · ✔️ pronto

---

## Visão do produto (resumo da ideia)

O CRM recebe do ERP de cada cliente **clientes, produtos, pedidos e itens**. Uma **tela de filtro** cruza esse histórico ("quem comprou mangueira nos últimos 6 meses acima de R$ X") e vira o **ponto de partida das ações**: enviar email/WhatsApp, criar tarefas ou negócios para os vendedores. A **IA** usa o mesmo histórico para sugerir sozinha quais clientes têm mais chance de comprar cada produto.

```
ERP do cliente ──► Ponte (item 2) ──► Clientes + Produtos + Pedidos (item 4)
                                             │
                                             ▼
                              Filtro / Público-alvo (item 5) ◄── IA sugere público (item 7)
                                             │
                                             ▼
                     Ações em massa: email, WhatsApp, tarefa, negócio (item 6)
                                             │
                                             ▼
                          Funil de vendas + relatórios (item 1)
```

---

## Roadmap sugerido (ordem de implementação)

| Fase | O quê | Por quê nessa ordem |
|---|---|---|
| 0 | Pré-requisitos + **corrigir falha de segurança** (item 3) | Obrigatório antes de ter mais de uma empresa no app |
| 1 | **Produtos, pedidos e itens** no CRM + sync desse ERP (itens 4 e 2) | Sem o histórico de vendas no CRM, filtro e IA não têm dado |
| 2 | **Tela de filtro / público-alvo** (item 5) | É a base de tudo, como definido |
| 3 | **Ações em massa a partir do filtro** (item 6) | Transforma o filtro em venda |
| 4 | **IA de recomendação** (item 7) | Usa o histórico + filtro já prontos |
| — | Gráfico de funil (item 1) | Independente; pode entrar em qualquer fase como entrega rápida |
| depois | Ponte genérica para vários ERPs (item 2, parte multi-ERP) | Quando entrar o 2º cliente com ERP diferente |

---

## Pré-requisitos (antes de implementar qualquer item)

- [ ] Mover o projeto para `C:\Users\User\projetos\Crm-comercial` *(decidido)*
- [ ] Liberar `npm install` para rodar typecheck, testes, build e o app localmente
- [ ] Ter um `.env` com as 3 variáveis `VITE_SUPABASE_*`
- [x] Acesso ao Supabase: **o usuário tem acesso**. O projeto atual (`qwigwpookuhxhehzewti`) **não tem uso real** → passa a ser o **ambiente de teste**; um projeto novo será criado depois para produção.
- [ ] Domínio de envio no Resend: **não configurado** — resolver na fase 3 (disparos).

**Primeira fase a implementar:** segurança (item 3) + gráfico de funil (item 1).

---

## Itens

### 1. Gráfico de funil de vendas — ✔️ pronto (no ar desde 29/10/2026)

**Pedido:** gráfico em formato de funil para o funil de vendas.

**Situação atual:**
- Dashboard tem o card "Pipeline por Estágio" com barras horizontais (`src/pages/Dashboard.tsx:294`, dados de `funnelData` em `src/hooks/queries/useDashboard.ts:301`).
- Relatórios tem "Taxa de Conversão por Estágio" (`src/pages/Reports.tsx:377`), mas o cálculo está errado: compara a contagem *atual* de etapas vizinhas (pode dar >100%).
- O CRM não guarda histórico de mudança de etapa — só a etapa atual do negócio.

**Opções:**
- **A — Funil visual:** `FunnelChart` do Recharts (já instalado) no lugar das barras. Mostra quantidade e valor por etapa *agora*. Só frontend.
- **B — Funil de conversão real:** tabela `deal_stage_history` + trigger que grava cada mudança de etapa; funil mostra quantos *entraram* em cada etapa no período e a % de conversão entre etapas. Corrige também o gráfico de conversão dos Relatórios. Histórico só conta a partir da criação.

**Recomendação:** A agora, já preparada para B; criar o histórico (B) junto para começar a acumular dados.

**Decisões:**
- [x] **A + B** — funil visual já, e histórico de etapas começa a gravar para a conversão real.
- [ ] Onde aparece: Dashboard, Relatórios ou os dois? *(sugestão: os dois)*
- [ ] Mostrar por quantidade, por valor (R$) ou alternável? *(sugestão: alternável)*

---

### 2. Ponte com o banco de cada cliente (inclusive estruturas diferentes) — 🔨 ponte do ERP atual pronta (agente envia direto, 6 entidades); mapeamento por tela e outros ERPs ainda não

**Pedido:** integrar o banco de dados de cada empresa cliente; e se cada uma tiver um banco estruturado de forma completamente diferente?

**O que já existe (feito para 1 ERP):**
- **Agente local** `erp-integration/api` (Node no servidor do cliente): lê o Firebird, expõe `/clientes`, `/pedidos`, `/produtos` só em localhost, publicado via Cloudflare Tunnel.
- **Porta de entrada** Edge Function `erp-sync`: recebe lotes de contatos/empresas, autentica pelo `X-ERP-Token` (hash em `integration_configs`, por org), faz upsert por `codigo_erp` e grava em `erp_sync_log`. **Hoje só aceita contatos e empresas.**
- Quem liga os dois hoje é um **n8n** (puxa do agente, empurra para o `erp-sync`).
- Também existem: importação CSV na tela, API pública (`fc_xxx`) e `inbound-webhook`.
- `clientes.js` está com nomes de coluna errados (os reais têm prefixo `CLI_`).

**Solução para estruturas diferentes — "modelo único + tradutor por cliente":**
1. **Modelo canônico** no CRM: um formato único de Cliente, Produto, Pedido, Item, Vendedor. Todo o app (filtro, IA, relatórios) só conhece esse formato.
2. **Mapeamento por empresa**, salvo no banco e editável numa tela: "tabela `ERP_CLIENTE`, coluna `CLI_FONE` → Cliente.telefone". Cada cliente tem o seu; o código não muda.
3. **Mapeamento assistido por IA:** o agente lê os nomes das tabelas/colunas (como fizemos com o `.FDB`), a IA sugere o mapeamento e uma pessoa confirma.
4. **Consultas SQL por mapeamento** no agente (em vez de rotas fixas): o mapeamento gera o `SELECT` de cada entidade, inclusive JOINs quando o dado está espalhado em várias tabelas.
5. **Área de staging + validação:** o dado bruto entra, é validado (CPF/CNPJ, duplicados, campos obrigatórios) e só então vira registro do CRM; erros vão para um log reprocessável.
6. **Sync incremental** por data de alteração + upsert por código externo.

**Tipos de ponte por cenário:**
| Cenário do cliente | Ponte |
|---|---|
| ERP em nuvem com API (Bling, Omie, Tiny, Conta Azul…) | Conector nativo no CRM (token/OAuth), CRM puxa. Nada instalado. |
| ERP local com banco (Firebird, SQL Server, MySQL, Postgres…) | Agente instalado no servidor do cliente que **empurra** para o CRM (só saída HTTPS). |
| Sem integração técnica | Importação de planilha (CSV/Excel) com mapeamento — já existe, estender para produtos/pedidos. |
| Sistema próprio com TI | API pública / webhooks do CRM. |

**Decisões:**
- [x] **ERPs dos futuros clientes são desconhecidos** → estratégia:
  1. **Agora:** integração completa com o ERP do `.FDB` (primeiro cliente).
  2. **Já construir sobre o modelo canônico** (tabelas neutras de cliente/produto/pedido/item; o CRM nunca lê nomes `ERP_*` direto) e com o **mapeamento em configuração**, não em código — o ERP atual vira o "mapeamento nº 1".
  3. **Porta universal:** importação de planilha (CSV/Excel) para clientes, produtos, pedidos e itens, com mapeamento de colunas. Qualquer empresa consegue exportar planilha do seu sistema → serve para qualquer ERP desde o dia 1.
     - **Volume grande (centenas de milhares de linhas):** o importador atual **não aguenta** — lê o arquivo inteiro no navegador e manda tudo num único `insert` (`CSVImportModal.tsx`). Precisa virar **importação em segundo plano**:
       1. Upload do arquivo (CSV/Excel, aceitar `.zip`) para o Supabase Storage — upload retomável.
       2. Mapeamento de colunas feito sobre uma **amostra** (primeiras linhas).
       3. Processamento **no servidor, em lotes** (ex.: 5–10 mil linhas por vez) para uma tabela de staging, com `COPY`/insert em massa; depois validação e upsert por código externo.
       4. **Barra de progresso**, pode fechar a tela; retoma de onde parou se falhar; relatório de erros baixável (só as linhas com problema).
       5. Ordem por dependência: produtos → clientes → pedidos → itens (um arquivo por entidade, ou um `.zip` com todos).
     - Referência: o ERP do `.FDB` tem ~430 mil linhas somando tudo; um CSV desse porte tem ~50–100 MB — tamanho normal para esse fluxo.
     - **Para quem tem banco grande e quer atualização contínua, o agente continua sendo o caminho recomendado**; a planilha é a carga inicial / alternativa sem instalação.
  4. **Depois, conforme os clientes aparecerem:** adaptadores para os ERPs mais comuns (tela de mapeamento com IA, conectores Bling/Omie/Tiny etc.). Só se faz quando houver demanda real.
- [x] **Só ERP → CRM.**
- [x] **Agente envia direto ao CRM** — sai o n8n e o Cloudflare Tunnel.
- [x] **Sync a cada 15–30 min**, incremental por `DATA_ULT_ALTERACAO`.

---

### 3. Contas, empresas e permissões — 🔨 falha crítica corrigida e no ar (29/10/2026); visibilidade por dono e super admin ainda não feitos

**Como funciona hoje:**
- **Um banco só** (Supabase/Postgres) para todas as empresas. Cada registro tem `org_id`; o RLS filtra por empresa. Não há banco separado por empresa.
- **Empresa** = `organizations`. **Vínculo** do usuário = `profiles.org_id` (uma empresa por usuário). **Papel** = `user_roles` (`owner` / `admin` / `member`).
- **Cadastro orgânico** cria empresa nova e o usuário vira `owner`. **Convite** (`invite-member`, só owner/admin) manda magic link e o convidado entra na empresa com o papel definido.
- **Papéis só escondem botões** (`useRole.ts`): no banco, qualquer membro pode ler/editar/excluir tudo da empresa.
- **Todo membro vê todos os contatos/negócios da empresa** — não existe "vendedor vê só a própria carteira".
- **`role_permissions`** (matriz na tela Equipe) é salva mas **não é aplicada** em lugar nenhum.

**🔴 Falha de segurança crítica (prioridade máxima):**
- Política `"Users can update own profile"` (`initial_schema.sql:767`) deixa o usuário alterar **qualquer coluna** do próprio profile, inclusive `org_id`. Quem souber o UUID de outra empresa consegue entrar nela. O mesmo vale para o INSERT (linha 768).
- Correção: impedir mudança de `org_id` e checar pertencimento por `user_roles`.
- Verificar no banco de produção se a política é a mesma do repositório.

**Melhorias possíveis:**
- Aplicar papéis no banco (RLS por papel), não só na tela.
- Visibilidade por dono: vendedor vê só a própria carteira; gestor vê a equipe; admin vê tudo.
- Fazer a matriz `role_permissions` valer de verdade.
- Usuário em mais de uma empresa (consultor/revenda).
- Papel de "plataforma" (você, dono do SaaS) para gerenciar todas as empresas.

**Decisões:**
- [x] **Vendedor (member) vê só a própria carteira; admin faz o papel de gestor e vê tudo; owner vê tudo.** Sem papel novo. Aplicado no banco (RLS), não só na tela.
- [x] **Vendedores do ERP:** importados como referência (nome/código nos clientes e pedidos); cada um é ligado a um usuário do CRM só quando for convidado.
- [x] **Usuário pertence a uma empresa só** (como hoje).
- [x] **Painel de super admin: sim** — ver empresas, usuários, status do sync, uso; apoiar suporte.
- [ ] Algum cliente exige banco isolado? *(padrão: não — banco compartilhado com `org_id`)*

---

### 4. Produtos, pedidos de venda e itens — 🔨 tabelas, sync e telas prontos (29/10/2026); carga inicial no Supabase de teste

**Pedido:** adicionar produtos, pedidos de venda e itens de venda ao CRM.

**Feito (29/10/2026):**
- Migration `20261029100000_erp_sales_data.sql`: `products`, `product_groups`, `erp_sellers`, `sales_orders`, `sales_order_items` (só leitura no app; RLS por org), telefone/e-mail em `companies`, view `customer_purchase_summary` e função `customer_top_products`.
- Chave de tudo = **ID interno do ERP** (`CLI_ID`, `PROD_ID`, `PEDIDO_ID`, `VEND_ID`, `ITEMPED_ID`) — conferido: `CLI_CODIGO` só bate com 78% dos pedidos.
- `erp-sync` aceita `seller`, `product_group`, `product`, `order`, `order_item` (upsert em lote de 500).
- Agente: `src/mapping.js` com o mapeamento real; sync incremental de tudo (`POST /sync`, `SYNC_CRON`); senha de vendedor nunca é lida.
- Telas: **Produtos**, **Pedidos** (vendas/orçamentos, itens) e aba **Compras** na ficha de empresa/contato.

**Situação atual:** o CRM **não tem** nenhuma tabela de produto ou pedido. O agente do ERP já tem rotas `/produtos` e `/pedidos`, mas o `erp-sync` não as recebe.

**Proposta (tabelas novas, todas com `org_id` + RLS + `codigo_erp`):**
| Tabela | Vem de | Campos principais |
|---|---|---|
| `products` | `ERP_PRODUTO` | código, descrição, marca, grupo, subgrupo, unidade, preço de venda, custo, margem, saldo, ativo |
| `product_brands` / `product_groups` | `ERP_MARCA`, `ERP_GRUPO_PROD`, `ERP_SUBGRUPO_PROD` | descrição |
| `sales_orders` | `ERP_PEDIDO` | número, cliente (contato/empresa), vendedor, data, status, tipo, valor, desconto, total, forma de pagamento, entregue |
| `sales_order_items` | `ERP_ITEM_PEDIDO` | pedido, produto, quantidade, valor unitário, desconto, total |

**Telas:**
- **Produtos** (lista + detalhe: quem compra, quanto vende, últimos pedidos).
- **Pedidos** (lista com filtros + detalhe com itens).
- **Na ficha do cliente:** aba "Compras" — histórico, ticket médio, última compra, produtos mais comprados, frequência.
- **Indicadores por cliente calculados** (base do filtro e da IA): total comprado, nº de pedidos, ticket médio, data da última compra, dias sem comprar, produtos/grupos/marcas comprados.

**Volume:** ~110 mil pedidos e ~272 mil itens só nesse ERP — exige índices e consultas no banco (não no navegador). Carga inicial em lotes.

**Decisões:**
- [x] **Venda = `PEDIDO_TIPO = 'P'`**; `'O'` = orçamento (importar também, como oportunidade/cotação, mas fora dos totais de venda). *Lido do `.FDB` — confirmar o significado com quem usa o ERP.*

**Valores encontrados no `.FDB` (ERP_PEDIDO, 110.272 registros, 02/01/2024 → 20/05/2026):**
| Campo | Valores |
|---|---|
| `PEDIDO_TIPO` | `P` = 89.662 (R$ 43,1 mi, ticket ~R$ 481) · `O` = 20.610 (R$ 34,2 mi, ticket ~R$ 1.659) |
| `PEDIDO_STATUS` | sempre `E` — não distingue nada |
| `IND_ENTREGUE` | sempre vazio — não é usado |
| `PEDIDO_OPERACAO`, `PEDIDO_EMPRESA`, `PEDIDO_FILIAL` | sempre `1` |

- Não há pedidos cancelados identificáveis neste arquivo.
- O histórico cobre ~2 anos e 5 meses — "importar tudo" = esse período.
- Orçamentos não convertidos são um público valioso para o filtro ("quem pediu orçamento de X e não comprou").
- [x] **Só espelho do ERP** — o CRM lê, não cria pedidos.
- [x] **Importar todo o histórico** (~110 mil pedidos / ~272 mil itens).
- [x] **CNPJ → empresa, CPF → contato.**

---

### 5. Tela de filtro / público-alvo — "base de tudo" — 🔨 pronta (30/10/2026): regras de compra, cadastro, salvar e exportar; ações em massa são o item 6

**Pedido:** filtro completo que, com base no histórico, encontra os leads certos. Ex.: "vou vender mangueira a R$ 1.000 na semana que vem — quem comprou mangueira nos últimos 6 meses, acima de tantos reais". É dessa tela que partem as ações.

**Situação atual:** existe a tabela `segments` (filtros salvos), usada só numa aba de Lead Scoring e para relatórios salvos. Os filtros de Contatos são simples (status, responsável, busca). Nada cruza com compras.

**Proposta — construtor de filtros (regras com E / OU):**
- **Cadastro:** tipo (PF/PJ), cidade, estado, categoria, situação cadastral, vendedor, tags, status, lead score, campos customizados.
- **Compras:** comprou / não comprou **produto, marca, grupo ou subgrupo** X; no período Y; quantidade ≥ N; valor ≥ R$; nº de pedidos; ticket médio; **dias sem comprar**; primeira/última compra; faturamento mensal médio.
- **Relacionamento:** dias sem contato, atividades, negócios abertos, etapa do funil, motivo de perda, e-mail aberto/clicado.
- **Resultado ao vivo:** quantidade de clientes, valor potencial, lista com colunas configuráveis, exportar.
- **Salvar como público** (dinâmico — recalcula sempre) e reutilizar.
- **Botões de ação** sobre o resultado → item 6.
- O ERP já tinha essa ideia (`ERP_FILTROS`: faturamento mín/máx, ticket médio, sem compra há X dias, sem contato, aniversário…) — serve de referência.

**Técnico:** filtro roda no banco (função SQL / view com os indicadores por cliente do item 4), não no navegador.

**Decisões pendentes:**
- [ ] Algum critério obrigatório que não está na lista?
- [x] **Vendedor filtra só a própria carteira** (consequência do item 3); admin/gestor filtram tudo/equipe.

---

### 6. Ações em massa a partir do filtro — 💬 em discussão

**Pedido:** com o resultado do filtro, enviar mensagem/email para cada cliente filtrado e disparar o fluxo do app.

**O que já existe:**
- Email: envio via **Resend** (`send-email`), templates com variáveis, sequências (cadência de emails) com inscrição manual.
- WhatsApp: ação `send_whatsapp` nas automações via **Evolution API** (integração marcada como desativada na doc).
- Automações: trigger → condições → ações (criar tarefa, mover etapa, tag, webhook…).

**Proposta — ações sobre um público:**
- **Email em massa** com template personalizado (nome, produto, preço) + descadastro (LGPD).
- **WhatsApp em massa** com mensagem modelo.
- **Inscrever em sequência** (follow-up automático).
- **Criar tarefas** para os vendedores responsáveis ("ligar oferecendo mangueira").
- **Criar negócios** no funil para cada cliente (campanha) — e acompanhar no funil/gráfico.
- **Adicionar tag / exportar lista.**
- **Campanha:** registro com público, mensagem, data, e resultado (enviados, abertos, respondidos, negócios gerados, vendido).

**Riscos/atenção:**
- WhatsApp em massa por API não oficial (Evolution) **pode banir o número**. Para volume, usar a **API oficial do WhatsApp (Meta)** com modelos aprovados — tem custo por conversa.
- Email em massa exige domínio verificado no Resend e opção de descadastro.
- Limites de envio e fila para não travar.

**Decisões:**
- [x] **Primeira versão:** email em massa, tarefas para vendedores e negócios no funil.
- [x] **WhatsApp fica para uma fase seguinte** (decidir oficial × Evolution quando chegar lá).
- [x] **Revisar antes de enviar:** mostra lista + mensagem; alguém aprova e só então dispara.

---

### 7. IA que encontra os clientes certos para cada produto — 💬 em discussão

**Pedido:** a IA analisa vendas, produtos e clientes sozinha e gera a lista de quem tem mais chance de comprar um produto, para enviar ofertas aos leads certos.

**Proposta em camadas (da mais simples e confiável à mais "inteligente"):**
1. **Regras de recompra (sem IA):** quem compra o produto/grupo a cada ~X dias e está "na hora" de comprar de novo; quem parou de comprar.
2. **Quem compra junto (cesta):** clientes que compraram produtos que costumam ser vendidos junto com o produto X, mas nunca compraram X.
3. **Clientes parecidos:** clientes com perfil de compra semelhante aos que compram X (mesmo ramo, mesmos grupos, mesmo porte).
4. **IA (Claude) por cima:** recebe o produto + as listas acima, ranqueia, **explica o motivo** de cada cliente ("comprou mangueira 3x no último ano, última há 5 meses") e **escreve a oferta** personalizada.
5. Resultado vira um **público do filtro (item 5)** → ações (item 6).

**Por que em camadas:** a IA não consegue "ler" 272 mil itens de uma vez; o banco calcula os padrões e a IA interpreta e escreve. Fica mais barato, rápido e explicável.

**Decisões:**
- [x] **Sob demanda** primeiro: escolhe o produto → "quem compraria?" → lista com motivo.
- [x] **IA pode sugerir preço/desconto** (com base em ticket médio e margem), sempre com aprovação humana.

---

### 8. Entender o fluxo do app (admin e funcionário) — ✔️ respondido

Respondido na conversa: menu, papel de cada tela, fluxo do admin e do vendedor, diferenças entre Atividades × Tarefas e Empresas × Contatos.

**Pontos de melhoria identificados:**
- [ ] Atividades × Tarefas confunde: tarefa é uma atividade do tipo "task", mas aparece em duas telas.
- [ ] Não há tela "Minha agenda / Meu dia" do vendedor juntando tarefas, negócios parados e clientes a contatar.
- [ ] Criar um guia de uso dentro do app (onboarding por papel).

---

## Referência — Banco do ERP (`ERP (1).FDB`)

20 tabelas, todas com prefixo `ERP_`. Principais: `ERP_CLIENTE` (~23 mil), `ERP_PEDIDO` (~110 mil), `ERP_ITEM_PEDIDO` (~272 mil), `ERP_PRODUTO` (~26,6 mil), `ERP_VENDEDOR` (79). Há um módulo comercial pouco usado: `ERP_ETAPAS`, `ERP_RESULTADO_CHAMADAS`, `ERP_MOTIVO_PERDAS`, `ERP_CARTEIRA_CLIENTES` + `ERP_FILTROS`.

```
ERP_EMPRESA
 ├── ERP_VENDEDOR ──(CLI_VEND)──► ERP_CLIENTE ──► ERP_CADSIT / ERP_CATEGORIA / ERP_PORTADOR
 │                                    └──(PEDIDO_CLI)──► ERP_PEDIDO
 │                                                         └──(ITEMPED_ID_PEDIDO)──► ERP_ITEM_PEDIDO
 │                                                                                     └──► ERP_PRODUTO ──► MARCA / GRUPO / SUBGRUPO
```

Pontos já identificados:
- `erp-integration/api/src/routes/clientes.js` usa nomes de coluna errados (reais têm prefixo `CLI_`).
- Quase todas as tabelas têm `DATA_ULT_ALTERACAO` → sync incremental é viável.
- `ERP_VENDEDOR.VEND_SENHA` nunca deve ser sincronizada.
- O prefixo `ERP_` + `ERP_MENUS` + login de vendedor sugerem que é uma camada intermediária (réplica para um app de vendas), não o ERP original.
