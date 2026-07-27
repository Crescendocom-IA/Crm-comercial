-- move_deal_stage: converte config.to_stage (NOME) para config.stage_id (UUID).
--
-- O executor casava o estágio por nome via ilike, então renomear um estágio
-- quebrava a automação e nomes parecidos ("Proposta" vs "Proposta Enviada") se
-- confundiam. O builder passou a gravar stage_id; aqui migramos o que já existe.
--
-- actions é um array jsonb de { type, config }, então percorremos elemento a
-- elemento. Casamento por nome EXATO (não ilike): na dúvida, é melhor não
-- converter e deixar o fallback por nome do executor agir do que apontar para o
-- estágio errado. Ambíguo (dois estágios homônimos) ou inexistente → mantém o
-- nome e registra um aviso.

do $$
declare
  a record;
  new_actions jsonb;
  act jsonb;
  idx int;
  sid uuid;
  cnt int;
  sname text;
begin
  for a in
    select id, org_id, actions
    from automations
    where actions @> '[{"type":"move_deal_stage"}]'::jsonb
  loop
    new_actions := a.actions;
    for idx in 0 .. jsonb_array_length(a.actions) - 1 loop
      act := a.actions -> idx;
      if act ->> 'type' = 'move_deal_stage'
         and (act -> 'config') ? 'to_stage'
         and not ((act -> 'config') ? 'stage_id') then
        sname := act -> 'config' ->> 'to_stage';

        select count(*) into cnt
        from pipeline_stages
        where org_id = a.org_id and name = sname;

        if cnt = 1 then
          select id into sid
          from pipeline_stages
          where org_id = a.org_id and name = sname
          limit 1;
          new_actions := jsonb_set(
            new_actions,
            array[idx::text, 'config', 'stage_id'],
            to_jsonb(sid::text)
          );
        else
          raise notice 'automation %: estágio "%" ambíguo ou inexistente (% encontrados) — mantido por nome', a.id, sname, cnt;
        end if;
      end if;
    end loop;

    if new_actions is distinct from a.actions then
      update automations set actions = new_actions where id = a.id;
    end if;
  end loop;
end $$;
