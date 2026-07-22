-- Versiona o agendamento do process-sequences.
--
-- O job existia só no banco, criado à mão, sem rastro no repositório: recriar o
-- projeto do zero perderia o agendamento silenciosamente. Esta migration o torna
-- reproduzível.
--
-- Replica o job atual: 0 12 * * * (meio-dia UTC = 09:00 em São Paulo, horário
-- melhor para disparo de e-mail que meia-noite) e o header X-Cron-Secret, que é
-- o que process-sequences valida (fail-closed: sem segredo, responde 401).
-- Sem body — a função lê apenas o header.
--
-- ─── SEGREDO ────────────────────────────────────────────────────────────────
-- O CRON_SECRET NÃO entra neste arquivo: migrations vão para o git, e um segredo
-- commitado vaza para sempre. O comando agendado busca o valor no Vault EM TEMPO
-- DE EXECUÇÃO, então ele também não fica gravado em cron.job.command.
--
-- Pré-requisito, rodar UMA VEZ fora do versionamento (SQL Editor do Dashboard),
-- com o mesmo valor da secret CRON_SECRET das Edge Functions:
--
--   select vault.create_secret(
--     '<valor do CRON_SECRET>', 'cron_secret',
--     'Segredo compartilhado do cron do process-sequences'
--   );
--
-- Fallback: se o segredo não existir no Vault, o comando tenta o GUC
-- app.cron_secret com current_setting(..., true) — a flag `true` devolve NULL em
-- vez de erro quando o GUC não existe, para o job não quebrar. Não achando
-- nenhum dos dois, envia string vazia e a função rejeita com 401 (fail-closed),
-- que é o comportamento seguro.

DO $$
BEGIN
  -- Idempotente: só cria se ainda não existir. Rodar de novo não duplica nem
  -- sobrescreve um job já ajustado à mão.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-sequences-daily') THEN
    PERFORM cron.schedule(
      'process-sequences-daily',
      '0 12 * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://qwigwpookuhxhehzewti.supabase.co/functions/v1/process-sequences',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Secret', COALESCE(
              (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
              current_setting('app.cron_secret', true),
              ''
            )
          )
        );
      $cron$
    );
    RAISE NOTICE 'cron job process-sequences-daily agendado';
  ELSE
    RAISE NOTICE 'cron job process-sequences-daily já existe — nada a fazer';
  END IF;
END $$;
