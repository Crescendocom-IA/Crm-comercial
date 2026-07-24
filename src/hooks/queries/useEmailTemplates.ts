import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Template = Database["public"]["Tables"]["email_templates"]["Row"];

/*
 * A tela lista todos os templates e filtra a busca em memória; o modal de
 * edição carrega o template SELECIONADO da lista, não um buscado por id —
 * então não há useEmailTemplateQuery(id) (seria hook sem consumidor).
 *
 * A chave ['email-templates', orgId] é a mesma que o modal de composição lê:
 * criar/editar um template aqui já atualiza o seletor de template de lá.
 */

export const templateKeys = {
  all: (orgId: string | null | undefined) => ["email-templates", orgId] as const,
  list: (orgId: string | null | undefined) => ["email-templates", orgId, "list"] as const,
};

export function useEmailTemplatesQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: templateKeys.list(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Template[];
    },
  });
  return { templates: query.data ?? [], isLoading: query.isLoading };
}

export type TemplateInput = {
  name: string; subject: string; body_html: string; category: string | null;
};

export function useEmailTemplateMutation() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: templateKeys.all(orgId) });

  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TemplateInput }) => {
      if (id) {
        const { error } = await supabase.from("email_templates").update({
          name: input.name, subject: input.subject,
          body_html: input.body_html, category: input.category,
        } as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert({
          org_id: orgId!, name: input.name, subject: input.subject,
          body_html: input.body_html || "", category: input.category, created_by: user?.id,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });

  /** Duplica um template — insere uma cópia com "(cópia)" no nome. */
  const duplicate = useMutation({
    mutationFn: async (t: Template) => {
      const { error } = await supabase.from("email_templates").insert({
        org_id: orgId!, name: `${t.name} (cópia)`, subject: t.subject,
        body_html: t.body_html, category: t.category, created_by: user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { save, duplicate, remove, invalidar };
}
