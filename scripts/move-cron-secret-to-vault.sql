-- ⚠️ REVISAR ANTES DE RODAR. Operação única, com backup feito.
--
-- Tira o CRON_SECRET do plaintext. Hoje o job process-sequences-daily guarda o
-- segredo literal dentro de cron.job.command, legível por qualquer um com acesso
-- ao banco. Este script move o valor para o Vault e recria o job buscando o
-- segredo em tempo de execução — igual ao que a migration
-- 20260722130000_schedule_process_sequences_cron.sql faz em ambiente novo.
--
-- Por que ler o segredo do próprio job em vez de pedir para colar: assim o valor
-- não passa por nenhum arquivo, log de terminal ou histórico de shell. Ele sai de
-- onde já está, entra no Vault, e o plaintext é destruído.
--
-- Tudo num único DO: é atômico. Qualquer RAISE EXCEPTION desfaz a transação
-- inteira e o job antigo continua intacto.

DO $$
DECLARE
  v_command text;
  v_secret  text;
  v_vault   text;
  v_novo    text;
BEGIN
  -- 1. Lê o comando do job atual.
  SELECT command INTO v_command FROM cron.job WHERE jobname = 'process-sequences-daily';
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'Job process-sequences-daily não encontrado — nada a migrar.';
  END IF;

  -- 2. Extrai o segredo do header X-Cron-Secret.
  v_secret := substring(v_command from '''X-Cron-Secret'',[ ]*''([^'']+)''');
  IF v_secret IS NULL OR length(v_secret) < 16 THEN
    RAISE EXCEPTION
      'Não consegui extrair o CRON_SECRET do job (o formato do comando mudou?). Abortando sem alterar nada.';
  END IF;

  -- 3. Grava no Vault, se ainda não existir.
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      v_secret, 'cron_secret',
      'Segredo compartilhado do cron do process-sequences'
    );
  END IF;

  -- 4. TRAVA DE SEGURANÇA: confirma que o Vault devolve exatamente o mesmo valor
  --    ANTES de destruir o plaintext. Sem isso, um Vault mal gravado deixaria o
  --    cron autenticando com string vazia e tomando 401 todo dia, em silêncio.
  SELECT decrypted_secret INTO v_vault
    FROM vault.decrypted_secrets WHERE name = 'cron_secret';
  IF v_vault IS DISTINCT FROM v_secret THEN
    RAISE EXCEPTION
      'O Vault não devolveu o mesmo segredo do job. Abortando sem mexer no agendamento.';
  END IF;

  -- 5. Só agora remove o job que carrega o segredo em claro.
  PERFORM cron.unschedule('process-sequences-daily');

  -- 6. Recria idêntico, mas lendo o segredo do Vault em tempo de execução.
  --    Mesmos parâmetros: 0 12 * * *, header X-Cron-Secret, sem body.
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

  -- 7. Verificação final: o novo comando NÃO pode conter o segredo literal.
  SELECT command INTO v_novo FROM cron.job WHERE jobname = 'process-sequences-daily';
  IF v_novo LIKE '%' || v_secret || '%' THEN
    RAISE EXCEPTION 'O novo comando ainda contém o segredo em claro. Desfazendo tudo.';
  END IF;

  RAISE NOTICE 'OK: segredo movido para o Vault e job recriado sem plaintext.';
END $$;

-- Conferência pós-execução (rodar separado, deve devolver plaintext_no_comando = false):
--   SELECT jobname, schedule, active,
--          command LIKE '%X-Cron-Secret%' AND command LIKE '%vault%' AS usa_vault,
--          command ~ '[0-9a-f]{32,}' AS plaintext_no_comando
--   FROM cron.job WHERE jobname = 'process-sequences-daily';
