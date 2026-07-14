# Corrigir conexão Slack

## Diagnóstico

1. Você tem 2 conexões Slack criadas na workspace Lovable, mas **nenhuma está vinculada a este projeto**. Sem o vínculo, a variável `SLACK_API_KEY` não fica disponível nas edge functions (`slack-connect`, `slack-send-test`), então elas sempre retornam `SLACK_API_KEY not configured`.
2. O botão "Adicionar ao Slack" em `src/components/setup/StepSlack.tsx` (`handleOAuthConnect`) hoje **apenas exibe um toast** sobre `SLACK_CLIENT_ID/SECRET`. Ele nunca chama a edge function `slack-connect`, então a UI nunca sai do estado "idle".

## Passos

### 1. Vincular a conexão Slack ao projeto
Usar `standard_connectors--connect` com `connector_id: "slack"`. Você seleciona qual das duas conexões existentes ("lucas's Slack" ou "lucas's Slack (1)") vincular ao projeto FlowCRM. Isso injeta automaticamente `SLACK_API_KEY` como env var nas edge functions.

### 2. Corrigir o fluxo do botão "Adicionar ao Slack"
Reescrever `handleOAuthConnect` em `src/components/setup/StepSlack.tsx` para:
- Chamar `supabase.functions.invoke("slack-connect", { body: { org_id } })` diretamente (sem exigir bot token manual, pois o gateway Lovable já autentica).
- Ler `workspace_name` / `channels` da resposta e marcar `connectionStatus = "connected"`.
- Mostrar mensagem de erro clara em caso de falha.
- Remover / esconder a seção "Configurar manualmente com Bot Token" (ficará como fallback opcional apenas).

### 3. Validar
- Abrir a página de Setup → passo Slack → clicar "Adicionar ao Slack".
- Confirmar que o card verde "Conectado ao workspace: …" aparece.
- Clicar "Enviar mensagem de teste" e verificar chegada no canal configurado.

## Detalhes técnicos

- As edge functions `slack-connect` e `slack-send-test` já estão implementadas corretamente para o gateway Lovable (usam `LOVABLE_API_KEY` + `SLACK_API_KEY` + `https://connector-gateway.lovable.dev/slack/api`). Não precisam ser alteradas.
- Após o vínculo, `SLACK_API_KEY` aparecerá em `fetch_secrets`. Nenhum secret manual precisa ser adicionado.
- O trecho "Bot Token manual" pode continuar existindo como opção avançada, mas deixa de ser o único caminho.
