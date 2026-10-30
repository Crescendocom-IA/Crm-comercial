# Agente ERP → FlowCRM

Programa que fica no **servidor do ERP** (Windows), lê o banco Firebird e **envia
ao CRM** os clientes, produtos, pedidos, itens, vendedores e grupos de produto.
A cada 20 minutos ele manda só o que mudou.

- **Só faz conexões de saída** (HTTPS para o CRM). Não precisa abrir porta no
  firewall, nem túnel, nem n8n.
- **Só lê o ERP.** Nada é gravado no Firebird. A senha dos vendedores nunca é lida.
- O mapeamento das colunas fica em [`src/mapping.js`](src/mapping.js).

> **Status:** testado com uma cópia do banco (`ERP.FDB`) e contra o CRM real, mas
> **ainda não rodou ligado a um servidor Firebird de verdade**. O passo 5 existe
> para confirmar isso antes de enviar qualquer dado.

---

## O que você precisa

| Item | Onde conseguir |
|---|---|
| Acesso ao Windows do servidor do ERP, como **Administrador** | TI / fornecedor do ERP |
| **Caminho do banco** no servidor (ex.: `C:\ERP\DADOS\ERP.FDB`) | Fornecedor do ERP |
| **Usuário e senha do Firebird** (de preferência só de leitura) | Fornecedor do ERP |
| **Token do CRM** | No CRM: Integrações → ERP → Gerar token (use a empresa que vai receber os dados) |

> ⚠️ **Gerar um novo token invalida o anterior.** E o token decide em qual empresa
> os dados entram: gere logado na empresa certa.

---

## 1. Instalar o Node.js

Baixe o **Node.js 20 LTS** (Windows x64) em <https://nodejs.org> e instale com as
opções padrão. Confirme no PowerShell:

```powershell
node --version
```

## 2. Copiar o agente para o servidor

Copie esta pasta (`erp-integration/api`) para um caminho **sem espaços e sem
acentos**, e instale:

```powershell
cd C:\flowcrm-erp-api
npm install
```

> Se o PowerShell bloquear o `npm`, use `npm.cmd` no lugar.

## 3. Configurar

```powershell
copy .env.example .env
notepad .env
```

Preencha:

| Campo | Valor |
|---|---|
| `FIREBIRD_DATABASE` | Caminho **local** do banco, ex.: `C:\ERP\DADOS\ERP.FDB` |
| `FIREBIRD_USER` / `FIREBIRD_PASSWORD` | Usuário e senha do Firebird |
| `API_TOKEN` | Uma senha aleatória (comando abaixo) |
| `CRM_TOKEN` | O token gerado no CRM |

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Conferir o `CRM_SYNC_URL`

Já vem apontando para o CRM atual. Só mude ao trocar de projeto Supabase.

## 5. ✅ Testar (só lê, não envia nada)

```powershell
npm run test-firebird
```

Esperado: `✓` nas 6 tabelas, com as quantidades de registros.

- **`✗ faltam as colunas…`**: este ERP é diferente do mapeado. **Pare** e envie a
  saída para quem cuida da integração.
- **Acentos errados na amostra**: coloque `FIREBIRD_ENCODING=WIN1252` no `.env` e
  rode de novo (se continuar errado, tente `ISO8859_1`).
- **Aviso "sem índice"**: funciona, mas pode ficar lento nas tabelas grandes.

## 6. Primeiro envio, começando pequeno

```powershell
npm run sync -- --so=vendedores
```

Deve terminar com `✓ vendedores`. Confira no CRM. Depois, envie tudo:

```powershell
npm run sync -- --completo
```

São cerca de 430 mil registros; leva de 20 a 40 minutos. Pode repetir sem medo:
reenviar **atualiza**, não duplica.

## 7. Deixar rodando sozinho

Abra o PowerShell **como Administrador**:

```powershell
cd C:\flowcrm-erp-api
npm run install-service
```

O serviço **FlowCRM ERP API** aparece em `services.msc` e sobe junto com o Windows.
Para confirmar:

```powershell
curl.exe http://127.0.0.1:3333/health
```

Daqui em diante, ele envia as mudanças a cada 20 minutos (`SYNC_CRON` no `.env`).
Depois de alterar o `.env`, reinicie: `Restart-Service "FlowCRM ERP API"`.

Para remover: `npm run uninstall-service`.

---

## Acompanhar

- **No CRM:** Integrações → ERP mostra o histórico de envios.
- **No servidor:** logs em `logs\`, um arquivo por dia, guardados por 14 dias.

```powershell
Get-Content .\logs\erp-api-*.log -Tail 30
Select-String -Path .\logs\erp-api-*.log -Pattern "ERROR"
```

Se o serviço nem iniciar, veja a pasta `daemon\`.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `Error connecting to database` | Firebird parado (`services.msc`) ou caminho errado em `FIREBIRD_DATABASE` |
| `CRM respondeu 401` | Token errado ou regerado no CRM: atualize `CRM_TOKEN` e reinicie |
| `Query excedeu 30000ms` | Tabela sem índice: reduza `SYNC_BATCH_SIZE` ou peça o índice ao fornecedor |
| `listen EADDRINUSE :::3333` | O serviço já está rodando |
| Serviço não sobe após reiniciar o servidor | Caminho com espaço ou acento: use `C:\flowcrm-erp-api` |

Um lote que falha não para o sync. Ele é registrado, e o próximo ciclo reenvia o
período, porque a marca do último sync só avança quando tudo dá certo.

## Limitações

- **Exclusões não chegam ao CRM.** Um registro apagado no ERP continua no CRM.
- **O ERP manda.** Edições no CRM em clientes com selo "ERP" são sobrescritas quando
  o cliente muda no ERP.
- **Só de ida.** O CRM não grava nada no ERP.
- **Depende de `DATA_ULT_ALTERACAO`.** Alteração que não atualize esse campo só
  chega num `npm run sync -- --completo`.

## Para desenvolvedores

```powershell
npm test                  # testes do sync (sem Firebird nem rede)
npm run dev               # roda com recarga automática
```

| Método | Rota | O que faz |
|---|---|---|
| GET | `/health` | Serviço e Firebird de pé (sem autenticação) |
| POST | `/sync` | Sync agora; `{ "completo": true }` reenvia tudo |
| GET | `/clientes`, `/clientes/count` | Diagnóstico: clientes no formato do CRM |

A API escuta só em `127.0.0.1`. As rotas exigem o header `X-API-Token`.
