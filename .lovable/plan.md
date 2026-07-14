# Documento único consolidado

## Objetivo
Gerar um único arquivo Markdown que consolide toda a documentação atualmente espalhada em `docs/` (README + 01 a 09) em uma versão linear, pronta para compartilhar/imprimir/anexar.

## Entregável
- `docs/FLOWCRM.md` — documento único com TOC no topo e todas as 9 seções concatenadas em ordem, com cabeçalhos rebaixados (h1 → h2, h2 → h3) para hierarquia consistente.

## Conteúdo (ordem)
1. Capa + visão geral (do `README.md`)
2. Índice navegável (anchors internos)
3. Arquitetura
4. Schema do banco
5. Auth & Onboarding
6. Módulos
7. Integrações
8. Convenções
9. Edge Functions
10. Checklist pós-remix
11. Estendendo o projeto

## Decisões
- **Manter** os 10 arquivos atuais em `docs/` (não apagar) — o consolidado é adicional, útil para distribuição offline. Caso prefira substituir, basta pedir.
- Sem mudanças de conteúdo: apenas concatenação + ajuste de níveis de heading + TOC.
- Sem alterações em código de aplicação.

## Fora de escopo
- Reescrever ou resumir o conteúdo existente.
- Gerar PDF/DOCX (apenas Markdown, conforme pedido).
