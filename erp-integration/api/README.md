# API intermediária ERP → FlowCRM

Lê o **Firebird 2.5** do ERP num **Windows Server 2019** e envia os clientes para
o FlowCRM. Roda como serviço do Windows, escuta só em `localhost` e é exposta
para fora pelo **Cloudflare Tunnel**.

> **Ainda não foi executada contra o ERP real.** O mapeamento de colunas em
> `src/routes/clientes.js` é uma suposição — o passo 4 abaixo é o que confirma ou
> corrige isso. Não pule.

---

## ⚠️ Leia antes de começar

Este código nunca tocou o seu banco. Três coisas precisam ser confirmadas no
servidor antes de confiar no sync:

| O que | Por quê | Onde se resolve |
|---|---|---|
| **Nomes das colunas** | Escrevi `CODIGO`, `NOME`, `CNPJ_CPF`… sem ver o ERP | Passo 4 (`npm run test-firebird`) |
| **Coluna de atualização** | Sem ela o sync incremental não existe — só varredura completa | Passo 4 |
| **Cliente = contato ou empresa?** | Decidi por CNPJ (14 díg.) = empresa, CPF (11) = pessoa | `src/services/sync.js`, função `classificar()` |

---

## 1. Instalar o Node.js

1. Baixe o **Node.js 18 LTS** (ou 20 LTS) para Windows x64:
   <https://nodejs.org/en/download>
2. Instale com as opções padrão (marque "Add to PATH").
3. Confirme no PowerShell:

```powershell
node --version    # deve mostrar v18.x ou v20.x
npm --version
```

> Node 18+ é necessário porque o código usa `fetch` nativo. Em Node 16 o sync
> falha com `fetch is not defined`.

---

## 2. Copiar a pasta para o servidor

Copie `erp-integration/api` para um caminho **sem espaços e sem acentos** — o
`node-windows` cria o serviço a partir do caminho e espaço no path é a causa
mais comum de o serviço não subir:

```
C:\flowcrm-erp-api\
```

Instale as dependências:

```powershell
cd C:\flowcrm-erp-api
npm install
```

---

## 3. Configurar o `.env`

```powershell
copy .env.example .env
notepad .env
```

Gere os segredos (o `API_TOKEN` protege esta API; o `CRM_TOKEN` vem do CRM):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

O `CRM_TOKEN` você pega no FlowCRM em **Integrações → ERP → Gerar token**.
Ele aparece **uma única vez** — copie na hora.

Campos que mais dão problema:

- `FIREBIRD_DATABASE` — caminho **local no servidor**, não caminho de rede.
  Ex.: `C:\ERP\DADOS\ERP.FDB`
- `FIREBIRD_PASSWORD` — se o ERP usa senha própria do SYSDBA, é a dela.
- `ERP_TABELA_CLIENTES` — se a camada `ERP_CLIENTE` não existir, aponte para a
  tabela crua.

---

## 4. ✅ Testar a conexão e DESCOBRIR AS COLUNAS

**Este é o passo que valida tudo.**

```powershell
npm run test-firebird
```

Saída esperada:

```
✓ Conectado. Versão do engine: 2.5.9
✓ Primeiras tabelas encontradas (5): ...
✓ Colunas de ERP_CLIENTE (11):
   • CODIGO                       VARYING
   • NOME                         VARYING
   ...
✓ Registros em ERP_CLIENTE: 13000
```

Agora **compare a lista de colunas** com o objeto `COLUNAS` no topo de
`src/routes/clientes.js` e ajuste o que estiver diferente:

```js
const COLUNAS = {
  codigo_erp: "CODIGO",        // ← troque pelo nome real
  nome: "NOME",
  atualizado_em: "ATUALIZADO_EM",
  // ...
};
```

**Se não houver coluna de data de atualização**, o sync incremental não funciona.
Nesse caso, ou se usa varredura completa (13 mil registros por vez, aceitável de
madrugada), ou se pede ao fornecedor do ERP um campo de timestamp na view.

---

## 5. Rodar em modo desenvolvimento

```powershell
npm run dev
```

Deve aparecer:

```
[INFO] Pool Firebird criado (max 5) -> localhost:3050
[INFO] API do ERP ouvindo em http://127.0.0.1:3333 (apenas local)
```

Deixe rodando e teste em **outro** PowerShell (passo 6).

---

## 6. Testar os endpoints

Guarde o token numa variável para não repetir:

```powershell
$T = "cole_aqui_o_API_TOKEN_do_env"
```

**Health (sem autenticação):**
```powershell
curl.exe http://127.0.0.1:3333/health
# {"status":"ok","firebird":"conectado","uptime_s":12}
```

**Contagem de clientes:**
```powershell
curl.exe -H "X-API-Token: $T" http://127.0.0.1:3333/clientes/count
# {"total":13000}
```

**Primeira página (comece com 5 para inspecionar o formato):**
```powershell
curl.exe -H "X-API-Token: $T" "http://127.0.0.1:3333/clientes?page=1&limit=5"
```

Confira se os campos vieram preenchidos e corretos. Campo vindo `null` em massa
= mapeamento de coluna errado no passo 4.

**Incremental:**
```powershell
curl.exe -H "X-API-Token: $T" "http://127.0.0.1:3333/clientes?since=2026-01-01T00:00:00Z&limit=5"
```

**Token errado deve dar 401:**
```powershell
curl.exe -H "X-API-Token: errado" http://127.0.0.1:3333/clientes/count
# {"error":"unauthorized"}
```

**Sync para o CRM — comece pequeno.** Antes de mandar 13 mil, teste com um
recorte usando `since` numa data recente:

```powershell
curl.exe -X POST -H "X-API-Token: $T" -H "Content-Type: application/json" `
  -d '{\"since\":\"2026-07-01T00:00:00Z\"}' `
  http://127.0.0.1:3333/sync/clientes
```

Resposta:
```json
{ "total": 12, "lotes": 1, "enviados": 12, "inserted": 12, "updated": 0,
  "errors": 0, "lotes_com_falha": [], "duracao_ms": 1840 }
```

Confira no CRM (**Integrações → ERP → Ver log**) se as linhas apareceram. Só
depois rode o sync completo (sem `since`).

---

## 7. Instalar como serviço do Windows

Feche o `npm run dev` antes (a porta precisa estar livre).

Abra o PowerShell **como Administrador**:

```powershell
cd C:\flowcrm-erp-api
npm run install-service
```

O serviço aparece em `services.msc` como **FlowCRM ERP API**, com inicialização
automática. Para remover:

```powershell
npm run uninstall-service
```

Confirme que subiu:

```powershell
curl.exe http://127.0.0.1:3333/health
```

---

## 8. Cloudflare Tunnel

O túnel é o que permite o n8n (fora da rede) chamar esta API sem abrir porta no
firewall nem expor IP do servidor.

**8.1. Instalar o `cloudflared`**

```powershell
winget install --id Cloudflare.cloudflared
```

Se `winget` não existir no 2019, baixe o `.exe` de
<https://github.com/cloudflare/cloudflared/releases> (arquivo
`cloudflared-windows-amd64.exe`), renomeie para `cloudflared.exe` e coloque em
`C:\Windows\System32`.

**8.2. Autenticar**

```powershell
cloudflared tunnel login
```

Abre o navegador; escolha o domínio que você administra na Cloudflare. Isso grava
um certificado em `C:\Users\<seu_usuario>\.cloudflared\cert.pem`.

**8.3. Criar o túnel**

```powershell
cloudflared tunnel create flowcrm-erp
```

Anote o **UUID** que ele imprime.

**8.4. Arquivo de configuração**

Crie `C:\Users\<seu_usuario>\.cloudflared\config.yml`:

```yaml
tunnel: <UUID-do-passo-anterior>
credentials-file: C:\Users\<seu_usuario>\.cloudflared\<UUID>.json

ingress:
  - hostname: erp-api.seudominio.com.br
    service: http://127.0.0.1:3333
  - service: http_status:404
```

**8.5. Apontar o DNS**

```powershell
cloudflared tunnel route dns flowcrm-erp erp-api.seudominio.com.br
```

**8.6. Rodar como serviço**

```powershell
cloudflared service install
```

**8.7. Testar de fora**

De qualquer máquina:

```bash
curl https://erp-api.seudominio.com.br/health
```

> **Importante:** o túnel expõe a API na internet. A única proteção é o
> `API_TOKEN` — por isso ele precisa ser longo e aleatório, e o `/health` é a
> única rota sem autenticação (ela não devolve dado do ERP, só "ligado ou não").
>
> Se quiser uma camada a mais, o Cloudflare Access permite exigir autenticação
> antes mesmo de a requisição chegar ao servidor.

---

## 9. Logs

Ficam em `C:\flowcrm-erp-api\logs\`, com rotação diária e 14 dias de retenção.

```powershell
# acompanhar em tempo real
Get-Content .\logs\erp-api-2026-07-23.log -Wait -Tail 30

# procurar erros do dia
Select-String -Path .\logs\erp-api-*.log -Pattern "ERROR"
```

Rodando como serviço, o `node-windows` também grava em `daemon\` dentro da pasta
do projeto — é lá que aparecem falhas de inicialização que nunca chegam ao
winston.

---

## 10. Troubleshooting

**`✗ FALHOU: Error connecting to database`**
- O serviço do Firebird está rodando? `services.msc` → *Firebird Server*
- O caminho de `FIREBIRD_DATABASE` existe? Teste: `Test-Path "C:\ERP\DADOS\ERP.FDB"`
- É caminho local? Firebird não abre `.FDB` em compartilhamento de rede.

**`Error: listen EADDRINUSE :::3333`**
A porta está ocupada — provavelmente o serviço já está rodando e você tentou
`npm run dev` junto:
```powershell
netstat -ano | findstr :3333
Stop-Service "FlowCRM ERP API"
```

**Todos os campos vêm `null`**
Mapeamento de coluna errado. Rode `npm run test-firebird` e compare com o objeto
`COLUNAS`.

**`Query excedeu 30000ms`**
A tabela é grande e não tem índice na coluna usada no `ORDER BY`/`WHERE`. Peça
um índice em `CODIGO` e na coluna de atualização, ou reduza `SYNC_BATCH_SIZE`.

**`CRM respondeu 401`**
O `CRM_TOKEN` está errado ou foi regerado no CRM. Gere de novo em
**Integrações → ERP** e atualize o `.env` (o token antigo é invalidado ao gerar
um novo).

**`CRM respondeu 403`**
O corpo mandou um `org_id` diferente do dono do token. Esta API não envia
`org_id` — se apareceu, alguém alterou `sync.js`.

**Serviço não sobe depois do reboot**
Veja `daemon\flowcrmerpapi.err.log`. Causa mais comum: caminho com espaço ou
acento; mova para `C:\flowcrm-erp-api`.

**Sync lento com 13 mil clientes**
Esperado: ~26 lotes de 500. Se passar de alguns minutos, o gargalo costuma ser
o `ORDER BY` sem índice. Rode de madrugada via `SYNC_CRON=0 3 * * *`.

---

## Referência dos endpoints

| Método | Rota | Auth | O que faz |
|---|---|---|---|
| GET | `/health` | não | Serviço + Firebird de pé |
| GET | `/clientes?page&limit&since` | sim | Lista paginada e normalizada |
| GET | `/clientes/count` | sim | Total, para planejar lotes |
| POST | `/sync/clientes` | sim | Dispara o sync (corpo: `{ since? }`) |
| GET | `/produtos`, `/pedidos` | sim | **501** — reservado para a Fase 3 |

Autenticação: header `X-API-Token`.

---

## O que esta fase NÃO faz

- **Produtos e pedidos** — rotas reservadas, respondendo 501.
- **Sync do CRM de volta para o ERP** — o fluxo é só de ida.
- **Merge de conflito** — o ERP sobrescreve o CRM. O badge "ERP" no CRM avisa
  o usuário disso.
- **Deduplicação por CNPJ** — a chave é o `codigo_erp`. Dois códigos com o mesmo
  CNPJ viram dois registros no CRM.
