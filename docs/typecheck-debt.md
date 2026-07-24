# Dívida de typecheck — catálogo

Levantado em 2026-07-24, logo após `npm run typecheck` (`tsc -b --noEmit`)
passar a checar o projeto de verdade. Até então o comando de typecheck da raiz
saía 0 sempre (config "solução" com `files: []` sem modo build), então estes
erros estavam escondidos.

**Este documento só cataloga. Nada foi corrigido aqui** — cada item vira uma
tarefa própria, priorizada pela categoria.

Total: **11 erros, 2 arquivos.**

Rodar para reproduzir:

```bash
npm run typecheck
```

---

## Categoria 1 — Erro real que quebra em runtime (1)

Mesma classe do `logAudit` sem import que motivou este conserto: o código
referencia um símbolo que não existe no escopo. Passa no build (Vite não faz
type-check), quebra quando a linha executa.

### `src/pages/Reports.tsx:681` — `toast` não existe no escopo (TS2304)

```
src/pages/Reports.tsx(681,5): error TS2304: Cannot find name 'toast'.
```

O arquivo tem cinco componentes, cada um com seu `const { toast } = useToast()`
— **menos `ActivitiesReport`** (linha 646). Ele chama `toast(...)` ao exportar
o CSV de atividades (linha 681), mas nunca destruturou `toast`. O
`const { toast } = useToast()` mais próximo (linha 783) é de `ForecastReport`,
outra função.

- **Impacto:** exportar o CSV do relatório de atividades dispara
  `ReferenceError: toast is not defined`. Os outros quatro relatórios exportam
  normalmente.
- **Correção (não aplicada):** adicionar `const { toast } = useToast();` no topo
  de `ActivitiesReport`, como nos irmãos. Uma linha.

---

## Categoria 2 — Tipos gerados desatualizados, sem efeito em runtime (10)

Todos em `src/components/crm/ErpIntegrationTab.tsx`, e todos com a mesma raiz: a
tabela **`erp_sync_log` não existe em `src/integrations/supabase/types.ts`** (os
tipos gerados). Ela existe no banco — o ERP grava nela e a UI lê —, então em
runtime a query funciona; o PostgREST devolve os dados. O que falha é só o
type-check: sem a tabela nos tipos, `supabase.from("erp_sync_log")` vira um
`SelectQueryError`, e todo acesso a coluna cai em cascata.

```
ErpIntegrationTab.tsx(82,36): TS2589  Type instantiation is excessively deep and possibly infinite.
ErpIntegrationTab.tsx(83,13): TS2769  No overload matches this call.               (.from("erp_sync_log"))
ErpIntegrationTab.tsx(91,41): TS2339  Property 'created_at' does not exist ...
ErpIntegrationTab.tsx(93,55): TS2339  Property 'created_at' does not exist ...
ErpIntegrationTab.tsx(96,23): TS2339  Property 'created_at' does not exist ...
ErpIntegrationTab.tsx(97,41): TS2339  Property 'operation' does not exist ...
ErpIntegrationTab.tsx(98,40): TS2339  Property 'operation' does not exist ...
ErpIntegrationTab.tsx(99,39): TS2339  Property 'operation' does not exist ...
ErpIntegrationTab.tsx(132,13): TS2769 No overload matches this call.               (.from("erp_sync_log"))
ErpIntegrationTab.tsx(137,14): TS2352 Conversion ... to 'SyncLog[]' may be a mistake ...
```

- **Impacto em runtime:** nenhum. A tabela existe; a leitura funciona. Os 10
  erros são um só problema visto de dez ângulos.
- **Correção (não aplicada):** regenerar os tipos do Supabase para incluir
  `erp_sync_log` (o caminho correto — alinha o tipo à realidade do banco). Um
  cast pontual (`.from("erp_sync_log" as any)` + tipagem manual do retorno)
  silenciaria os dez, mas esconde a causa e some na próxima regeneração.

---

## Categoria 3 — Uso de `any` que precisa refino (0)

Nenhum erro desta categoria no levantamento atual. (`noImplicitAny` está
desligado em ambos os tsconfig, então `any` implícito não vira erro; isto é uma
escolha de configuração, não dívida catalogada aqui.)

---

## Resumo

| Categoria | Erros | Arquivos | Corrige runtime? |
|-----------|-------|----------|------------------|
| 1 — quebra runtime | 1 | `Reports.tsx` | sim, urgente |
| 2 — tipos desatualizados | 10 | `ErpIntegrationTab.tsx` | não, higiene de tipos |
| 3 — refino de `any` | 0 | — | — |

A Categoria 1 é a única com bug de comportamento; a Categoria 2 é ruído de tipo
de uma única causa. Enquanto o catálogo não for zerado, `npm run typecheck`
continua saindo diferente de 0 — o que é o esperado: agora ele conta a verdade.
