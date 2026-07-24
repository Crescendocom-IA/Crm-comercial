import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";

/*
 * Log de auditoria. Os filtros de ação e tipo de entidade vão na chave da
 * query (recorte server-side, como a versão com useEffect fazia); a busca
 * textual segue em memória na tela. A leitura é limitada a 200 linhas — a tela
 * não tem controles de página, então não há useAuditLogsQuery paginado de fato;
 * `page` fica de fora até existir UI que o consuma.
 *
 * Não há useApiKeysQuery: SecuritySettings não tem UI de chaves de API, então
 * seria hook sem consumidor.
 */

const AUDIT_LIMIT = 200;

export interface AuditLogFilters {
  action: string;  // "all" ou uma ação
  entity: string;  // "all" ou um entity_type
}

export function useAuditLogsQuery(filters: AuditLogFilters) {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: ["security", orgId, "audit-logs", filters] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    queryFn: async () => {
      let q = supabase.from("audit_logs").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(AUDIT_LIMIT);
      if (filters.action !== "all") q = q.eq("action", filters.action);
      if (filters.entity !== "all") q = q.eq("entity_type", filters.entity);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return { logs: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}
