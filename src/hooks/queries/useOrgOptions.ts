import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/*
 * Listas que alimentam selects e filtros em várias telas: membros da org,
 * empresas e indústrias.
 *
 * Nasceram dentro de useContacts porque só Contatos as consumia. Com Empresas
 * migrando, o segundo consumidor chegou — e uma cópia em cada módulo daria
 * duas chaves de cache diferentes para o mesmo dado, ou seja, duas requisições
 * e dois momentos de invalidação.
 *
 * As chaves são prefixadas pelo domínio real (['companies', orgId, ...]), então
 * a invalidação da lista de Empresas atualiza o select de empresa em Contatos
 * sem que nenhuma das duas telas saiba da outra.
 */

export const optionKeys = {
  companies: (orgId: string | null | undefined) => ["companies", orgId, "options"] as const,
  members: (orgId: string | null | undefined) => ["profiles", orgId, "options"] as const,
  industries: (orgId: string | null | undefined) => ["organizations", orgId, "industries"] as const,
};

export function useCompanyOptionsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: optionKeys.companies(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as Company[];
    },
  });
  return query.data ?? [];
}

export function useMembersQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: optionKeys.members(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as Profile[];
    },
  });
  return query.data ?? [];
}

export const DEFAULT_INDUSTRIES = [
  "Tecnologia", "SaaS", "Serviços", "E-commerce", "Indústria",
  "Consultoria", "Educação", "Saúde", "Financeiro", "Varejo",
  "Logística", "Agronegócio", "Imobiliário", "Jurídico", "Marketing",
];

/**
 * Indústrias configuradas na org, com fallback para a lista padrão.
 *
 * A versão com useEffect disparava uma requisição por componente montado — em
 * Empresas eram três ao mesmo tempo (página, drawer e modal de criação) para
 * ler o mesmo campo `settings`. Sob a mesma chave, vira uma só.
 */
export function useIndustriesQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: optionKeys.industries(orgId),
    enabled: !!orgId,
    // Muda por configuração manual, quase nunca: não faz sentido revalidar
    // junto com listas de registros.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations").select("settings").eq("id", orgId!).single();
      if (error) throw error;
      const settings = data?.settings as Record<string, unknown> | null;
      const lista = settings?.industries;
      return Array.isArray(lista) && lista.length > 0 ? (lista as string[]) : DEFAULT_INDUSTRIES;
    },
  });
  return { industries: query.data ?? DEFAULT_INDUSTRIES, loading: query.isLoading };
}
